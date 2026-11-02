//! Haptix Leash: an on-chain spending policy for an AI agent.
//!
//! The contract lives on the agent's own account. The agent holds only a
//! function-call key scoped to `agent_spend` on this account, so it cannot
//! transfer NEAR, call other contracts or touch keys directly. Every spend goes
//! through the policy below:
//!
//! - to an allowed receiver, under the per-transaction cap and the rolling
//!   window cap: sent at once
//! - to anyone else, or over either cap: held as a pending request
//! - pending requests are approved or rejected by the owner's passkey
//!   (WebAuthn P-256, verified on-chain with `env::p256_verify`)
//!
//! The passkey also manages agent keys and withdrawals, so the account does
//! not need a full-access key at all.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde::Deserialize;
use near_sdk::serde_json::{self, json};
use near_sdk::store::IterableMap;
use near_sdk::{
    env, near, require, AccountId, Allowance, BorshStorageKey, NearToken, PanicOnDefault, Promise,
    PublicKey,
};

const EVENT_STANDARD: &str = "haptix_leash";
const EVENT_VERSION: &str = "1.0.0";
/// Domain separator for passkey challenges. Bumped if the message format changes.
const CHALLENGE_DOMAIN: &str = "haptix-leash:v1";
/// WebAuthn authenticator data flags.
const FLAG_USER_PRESENT: u8 = 0x01;
const FLAG_USER_VERIFIED: u8 = 0x04;
const RP_ID_HASH_LEN: usize = 32;
const AUTH_DATA_MIN_LEN: usize = RP_ID_HASH_LEN + 1 + 4;
const P256_COMPRESSED_LEN: usize = 33;
const P256_SIGNATURE_LEN: usize = 64;
const NANOS_PER_SEC: u64 = 1_000_000_000;
const NANOS_PER_MS: u64 = 1_000_000;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Pending,
}

/// Spending rules. All values are set at init and changed only by passkey.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Policy {
    /// Largest single spend the agent may send without approval.
    pub per_tx_max: NearToken,
    /// Largest total the agent may send without approval within one window.
    pub window_max: NearToken,
    /// Window length in seconds.
    pub window_secs: u64,
    /// Cap on held requests, so a looping agent cannot lock balance in storage.
    pub max_pending: u32,
    /// Cap on memo size, for the same reason.
    pub max_memo_bytes: u32,
    /// Receivers the agent may pay without approval. Empty = any receiver.
    /// Payments to anyone else are always held, whatever the amount.
    pub allowed_receivers: Vec<AccountId>,
}

impl Policy {
    fn assert_valid(&self) {
        require!(self.per_tx_max.as_yoctonear() > 0, "per_tx_max must be > 0");
        require!(
            self.window_max >= self.per_tx_max,
            "window_max must be >= per_tx_max"
        );
        require!(self.window_secs > 0, "window_secs must be > 0");
        require!(self.max_pending > 0, "max_pending must be > 0");
        let mut sorted = self.allowed_receivers.clone();
        sorted.sort();
        sorted.dedup();
        require!(
            sorted.len() == self.allowed_receivers.len(),
            "allowed_receivers has duplicates"
        );
    }

    fn allows(&self, receiver: &AccountId) -> bool {
        self.allowed_receivers.is_empty() || self.allowed_receivers.contains(receiver)
    }
}

/// The owner's passkey and the WebAuthn context it must be used from.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct PasskeyOwner {
    /// Compressed SEC1 P-256 public key (33 bytes).
    pub public_key: Base64VecU8,
    /// WebAuthn relying party id, e.g. "leash.example.com".
    pub rp_id: String,
    /// Origins allowed in clientDataJSON, e.g. "https://leash.example.com".
    pub origins: Vec<String>,
}

impl PasskeyOwner {
    fn assert_valid(&self) {
        let pk = &self.public_key.0;
        require!(
            pk.len() == P256_COMPRESSED_LEN && (pk[0] == 0x02 || pk[0] == 0x03),
            "public_key must be a 33-byte compressed P-256 key"
        );
        require!(!self.rp_id.is_empty(), "rp_id is required");
        require!(!self.origins.is_empty(), "at least one origin is required");
    }
}

/// A WebAuthn assertion produced by `navigator.credentials.get`.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct WebAuthnAssertion {
    pub authenticator_data: Base64VecU8,
    pub client_data_json: String,
    /// Raw r||s (64 bytes), not DER. Either s form verifies; replay is
    /// prevented by the nonce in the challenge.
    pub signature: Base64VecU8,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct ClientData {
    #[serde(rename = "type")]
    kind: String,
    challenge: String,
    origin: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum HoldReason {
    UnknownReceiver,
    OverPerTxLimit,
    OverWindowLimit,
}

#[near(serializers = [json])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RefuseReason {
    ZeroAmount,
    SelfTransfer,
    MemoTooLong,
    PendingQueueFull,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum SpendOutcome {
    Sent,
    Held { id: U64, reason: HoldReason },
    Refused { reason: RefuseReason },
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct PendingSpend {
    pub id: U64,
    pub receiver_id: AccountId,
    pub amount: NearToken,
    pub memo: String,
    pub reason: HoldReason,
    pub created_at_ms: U64,
}

/// What the passkey is authorizing. Each variant maps to one challenge string.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum OwnerAction {
    Approve { id: U64 },
    Reject { id: U64 },
    RejectAll { count: u32 },
    SetPolicy { policy: Policy },
    Withdraw { receiver_id: AccountId, amount: NearToken },
    AddAgentKey { public_key: PublicKey, allowance: NearToken },
    RevokeAgentKey { public_key: PublicKey },
}

impl OwnerAction {
    fn describe(&self) -> String {
        match self {
            OwnerAction::Approve { id } => format!("approve:{}", id.0),
            OwnerAction::Reject { id } => format!("reject:{}", id.0),
            OwnerAction::RejectAll { count } => format!("reject_all:{}", count),
            OwnerAction::SetPolicy { policy } => format!(
                "set_policy:{}:{}:{}:{}:{}:{}",
                policy.per_tx_max.as_yoctonear(),
                policy.window_max.as_yoctonear(),
                policy.window_secs,
                policy.max_pending,
                policy.max_memo_bytes,
                policy
                    .allowed_receivers
                    .iter()
                    .map(|a| a.as_str())
                    .collect::<Vec<_>>()
                    .join(",")
            ),
            OwnerAction::Withdraw {
                receiver_id,
                amount,
            } => format!("withdraw:{}:{}", receiver_id, amount.as_yoctonear()),
            OwnerAction::AddAgentKey {
                public_key,
                allowance,
            } => format!(
                "add_agent_key:{}:{}",
                String::from(public_key),
                allowance.as_yoctonear()
            ),
            OwnerAction::RevokeAgentKey { public_key } => {
                format!("revoke_agent_key:{}", String::from(public_key))
            }
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Stats {
    pub attempts: u64,
    pub sent: u64,
    pub sent_total: NearToken,
    pub held: u64,
    pub refused: u64,
    pub approved: u64,
    pub approved_total: NearToken,
    pub rejected: u64,
}

#[near(serializers = [json])]
pub struct WindowView {
    pub started_at_ms: U64,
    pub resets_at_ms: U64,
    pub spent: NearToken,
    pub remaining: NearToken,
}

/// Everything a dashboard needs, in one view call.
#[near(serializers = [json])]
pub struct Overview {
    pub owner: PasskeyOwner,
    pub policy: Policy,
    pub window: WindowView,
    pub pending: Vec<PendingSpend>,
    pub stats: Stats,
    pub nonce: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Leash {
    owner: PasskeyOwner,
    policy: Policy,
    window_start_ns: u64,
    window_spent: NearToken,
    auth_nonce: u64,
    next_pending_id: u64,
    pending: IterableMap<u64, PendingSpend>,
    stats: Stats,
}

#[near]
impl Leash {
    #[init]
    #[private]
    pub fn new(owner: PasskeyOwner, policy: Policy) -> Self {
        owner.assert_valid();
        policy.assert_valid();
        Self {
            owner,
            policy,
            window_start_ns: env::block_timestamp(),
            window_spent: NearToken::from_yoctonear(0),
            auth_nonce: 0,
            next_pending_id: 0,
            pending: IterableMap::new(StorageKey::Pending),
            stats: Stats::default(),
        }
    }

    // ---------------------------------------------------------------- agent

    /// The only method the agent's key can call. Never panics on policy
    /// grounds, so every attempt is counted in `stats`.
    pub fn agent_spend(
        &mut self,
        receiver_id: AccountId,
        amount: NearToken,
        memo: Option<String>,
    ) -> SpendOutcome {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "agent_spend must be signed by a key of this account"
        );
        self.stats.attempts += 1;
        let memo = memo.unwrap_or_default();

        let refuse = if amount.as_yoctonear() == 0 {
            Some(RefuseReason::ZeroAmount)
        } else if receiver_id == env::current_account_id() {
            Some(RefuseReason::SelfTransfer)
        } else if memo.len() > self.policy.max_memo_bytes as usize {
            Some(RefuseReason::MemoTooLong)
        } else {
            None
        };
        if let Some(reason) = refuse {
            return self.refuse(&receiver_id, amount, reason);
        }

        self.roll_window();
        let known_receiver = self.policy.allows(&receiver_id);
        let within_tx = amount <= self.policy.per_tx_max;
        let within_window = self
            .window_spent
            .checked_add(amount)
            .is_some_and(|total| total <= self.policy.window_max);

        if known_receiver && within_tx && within_window {
            self.window_spent = self.window_spent.saturating_add(amount);
            self.stats.sent += 1;
            self.stats.sent_total = self.stats.sent_total.saturating_add(amount);
            emit(
                "spend_sent",
                json!({ "receiver_id": receiver_id, "amount": amount, "memo": memo,
                        "window_spent": self.window_spent }),
            );
            Promise::new(receiver_id).transfer(amount).detach();
            return SpendOutcome::Sent;
        }

        if self.pending.len() >= self.policy.max_pending {
            return self.refuse(&receiver_id, amount, RefuseReason::PendingQueueFull);
        }

        let reason = if !known_receiver {
            HoldReason::UnknownReceiver
        } else if within_tx {
            HoldReason::OverWindowLimit
        } else {
            HoldReason::OverPerTxLimit
        };
        let id = self.next_pending_id;
        self.next_pending_id += 1;
        let request = PendingSpend {
            id: U64(id),
            receiver_id,
            amount,
            memo,
            reason,
            created_at_ms: U64(env::block_timestamp() / NANOS_PER_MS),
        };
        emit("spend_held", json!(&request));
        self.pending.insert(id, request);
        self.stats.held += 1;
        SpendOutcome::Held {
            id: U64(id),
            reason,
        }
    }

    // ---------------------------------------------------------------- owner

    /// Send a held request. Bypasses the limits: the owner decided.
    pub fn approve(&mut self, id: U64, assertion: WebAuthnAssertion) {
        self.verify_owner(&OwnerAction::Approve { id }, &assertion);
        let request = self
            .pending
            .remove(&id.0)
            .unwrap_or_else(|| env::panic_str("no such pending request"));
        self.stats.approved += 1;
        self.stats.approved_total = self.stats.approved_total.saturating_add(request.amount);
        emit("spend_approved", json!(&request));
        Promise::new(request.receiver_id)
            .transfer(request.amount)
            .detach();
    }

    pub fn reject(&mut self, id: U64, assertion: WebAuthnAssertion) {
        self.verify_owner(&OwnerAction::Reject { id }, &assertion);
        let request = self
            .pending
            .remove(&id.0)
            .unwrap_or_else(|| env::panic_str("no such pending request"));
        self.stats.rejected += 1;
        emit("spend_rejected", json!(&request));
    }

    /// Reject every held request in one approval. `count` must match the
    /// current queue length, so the owner signs for exactly what they saw.
    pub fn reject_all(&mut self, count: u32, assertion: WebAuthnAssertion) {
        require!(count == self.pending.len(), "pending count changed; refresh and sign again");
        self.verify_owner(&OwnerAction::RejectAll { count }, &assertion);
        let ids: Vec<u64> = self.pending.keys().copied().collect();
        for id in ids {
            if let Some(request) = self.pending.remove(&id) {
                emit("spend_rejected", json!(&request));
            }
        }
        self.stats.rejected += u64::from(count);
    }

    pub fn set_policy(&mut self, policy: Policy, assertion: WebAuthnAssertion) {
        policy.assert_valid();
        self.verify_owner(
            &OwnerAction::SetPolicy {
                policy: policy.clone(),
            },
            &assertion,
        );
        emit("policy_set", json!(&policy));
        self.policy = policy;
    }

    pub fn withdraw(&mut self, receiver_id: AccountId, amount: NearToken, assertion: WebAuthnAssertion) {
        self.verify_owner(
            &OwnerAction::Withdraw {
                receiver_id: receiver_id.clone(),
                amount,
            },
            &assertion,
        );
        emit("withdrawn", json!({ "receiver_id": receiver_id, "amount": amount }));
        Promise::new(receiver_id).transfer(amount).detach();
    }

    /// Give an agent a key that can call `agent_spend` on this account and
    /// nothing else. `allowance` caps the gas fees that key may burn.
    pub fn add_agent_key(
        &mut self,
        public_key: PublicKey,
        allowance: NearToken,
        assertion: WebAuthnAssertion,
    ) {
        require!(allowance.as_yoctonear() > 0, "allowance must be > 0");
        self.verify_owner(
            &OwnerAction::AddAgentKey {
                public_key: public_key.clone(),
                allowance,
            },
            &assertion,
        );
        emit(
            "agent_key_added",
            json!({ "public_key": public_key, "allowance": allowance }),
        );
        let allowance = Allowance::limited(allowance)
            .unwrap_or_else(|| env::panic_str("allowance must be > 0"));
        Promise::new(env::current_account_id())
            .add_access_key_allowance(
                public_key,
                allowance,
                env::current_account_id(),
                "agent_spend".to_string(),
            )
            .detach();
    }

    /// Kill switch: delete an agent key.
    pub fn revoke_agent_key(&mut self, public_key: PublicKey, assertion: WebAuthnAssertion) {
        self.verify_owner(
            &OwnerAction::RevokeAgentKey {
                public_key: public_key.clone(),
            },
            &assertion,
        );
        emit("agent_key_revoked", json!({ "public_key": public_key }));
        Promise::new(env::current_account_id())
            .delete_key(public_key)
            .detach();
    }

    // ---------------------------------------------------------------- views

    pub fn get_overview(&self) -> Overview {
        Overview {
            owner: self.owner.clone(),
            policy: self.policy.clone(),
            window: self.get_window(),
            pending: self.get_pending(None, None),
            stats: self.stats.clone(),
            nonce: U64(self.auth_nonce),
        }
    }

    pub fn get_policy(&self) -> Policy {
        self.policy.clone()
    }

    pub fn get_owner(&self) -> PasskeyOwner {
        self.owner.clone()
    }

    pub fn get_stats(&self) -> Stats {
        self.stats.clone()
    }

    pub fn get_nonce(&self) -> U64 {
        U64(self.auth_nonce)
    }

    pub fn get_window(&self) -> WindowView {
        let now = env::block_timestamp();
        let (start, spent) = if self.window_expired(now) {
            (now, NearToken::from_yoctonear(0))
        } else {
            (self.window_start_ns, self.window_spent)
        };
        WindowView {
            started_at_ms: U64(start / NANOS_PER_MS),
            resets_at_ms: U64(
                start.saturating_add(self.policy.window_secs.saturating_mul(NANOS_PER_SEC))
                    / NANOS_PER_MS,
            ),
            spent,
            remaining: self.policy.window_max.saturating_sub(spent),
        }
    }

    pub fn get_pending(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<PendingSpend> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(self.policy.max_pending) as usize;
        self.pending
            .values()
            .skip(from)
            .take(limit)
            .cloned()
            .collect()
    }

    /// The exact challenge (base64url, unpadded) the passkey must sign for
    /// `action` at the current nonce. Clients may also compute it themselves:
    /// sha256("haptix-leash:v1:{account}:{nonce}:{action}").
    pub fn get_challenge(&self, action: OwnerAction) -> String {
        URL_SAFE_NO_PAD.encode(self.challenge(&action))
    }

    // ---------------------------------------------------------------- internal

    fn refuse(&mut self, receiver_id: &AccountId, amount: NearToken, reason: RefuseReason) -> SpendOutcome {
        self.stats.refused += 1;
        emit(
            "spend_refused",
            json!({ "receiver_id": receiver_id, "amount": amount, "reason": reason }),
        );
        SpendOutcome::Refused { reason }
    }

    fn window_expired(&self, now_ns: u64) -> bool {
        now_ns.saturating_sub(self.window_start_ns)
            >= self.policy.window_secs.saturating_mul(NANOS_PER_SEC)
    }

    fn roll_window(&mut self) {
        let now = env::block_timestamp();
        if self.window_expired(now) {
            self.window_start_ns = now;
            self.window_spent = NearToken::from_yoctonear(0);
        }
    }

    fn challenge(&self, action: &OwnerAction) -> [u8; 32] {
        let message = format!(
            "{}:{}:{}:{}",
            CHALLENGE_DOMAIN,
            env::current_account_id(),
            self.auth_nonce,
            action.describe()
        );
        env::sha256_array(message.as_bytes())
    }

    /// Verify a WebAuthn assertion over `action` and bump the nonce.
    fn verify_owner(&mut self, action: &OwnerAction, assertion: &WebAuthnAssertion) {
        let client_data: ClientData = serde_json::from_str(&assertion.client_data_json)
            .unwrap_or_else(|_| env::panic_str("invalid clientDataJSON"));
        require!(client_data.kind == "webauthn.get", "wrong WebAuthn type");
        require!(
            self.owner.origins.iter().any(|o| *o == client_data.origin),
            "origin not allowed"
        );
        let challenge = URL_SAFE_NO_PAD
            .decode(client_data.challenge.trim_end_matches('='))
            .unwrap_or_else(|_| env::panic_str("challenge is not base64url"));
        require!(
            challenge.as_slice() == self.challenge(action).as_slice(),
            "challenge mismatch: wrong action or stale nonce"
        );

        let auth_data = &assertion.authenticator_data.0;
        require!(auth_data.len() >= AUTH_DATA_MIN_LEN, "authenticator data too short");
        require!(
            auth_data[..RP_ID_HASH_LEN] == env::sha256_array(self.owner.rp_id.as_bytes()),
            "rp_id mismatch"
        );
        let flags = auth_data[RP_ID_HASH_LEN];
        require!(flags & FLAG_USER_PRESENT != 0, "user not present");
        require!(flags & FLAG_USER_VERIFIED != 0, "user not verified (biometric/PIN required)");

        let signature: &[u8; P256_SIGNATURE_LEN] = assertion
            .signature
            .0
            .as_slice()
            .try_into()
            .unwrap_or_else(|_| env::panic_str("signature must be 64 bytes r||s"));
        let public_key: &[u8; P256_COMPRESSED_LEN] = self
            .owner
            .public_key
            .0
            .as_slice()
            .try_into()
            .unwrap_or_else(|_| env::panic_str("stored key is malformed"));

        let mut signed = auth_data.clone();
        signed.extend_from_slice(&env::sha256_array(assertion.client_data_json.as_bytes()));
        let prehash = env::sha256_array(&signed);
        require!(
            env::p256_verify(signature, &prehash, public_key),
            "passkey signature invalid"
        );
        self.auth_nonce += 1;
    }
}

fn emit(event: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": EVENT_STANDARD, "version": EVENT_VERSION,
                "event": event, "data": [data] })
    ));
}

#[cfg(test)]
mod tests;
