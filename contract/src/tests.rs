use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::testing_env;
use p256::ecdsa::signature::hazmat::PrehashSigner;
use p256::ecdsa::{Signature, SigningKey};

const RP_ID: &str = "leash.test";
const ORIGIN: &str = "https://leash.test";
const SECOND: u64 = 1_000_000_000;

fn agent_account() -> AccountId {
    "agent.testnet".parse().unwrap()
}

fn shop() -> AccountId {
    "shop.testnet".parse().unwrap()
}

fn attacker() -> AccountId {
    "attacker.testnet".parse().unwrap()
}

fn near(n: u128) -> NearToken {
    NearToken::from_near(n)
}

fn policy() -> Policy {
    Policy {
        per_tx_max: near(5),
        window_max: near(10),
        window_secs: 24 * 60 * 60,
        max_pending: 3,
        max_memo_bytes: 64,
    }
}

fn signing_key() -> SigningKey {
    SigningKey::from_slice(&[7u8; 32]).unwrap()
}

fn compressed_pk(key: &SigningKey) -> Vec<u8> {
    key.verifying_key().to_sec1_point(true).as_bytes().to_vec()
}

fn set_context(predecessor: &AccountId, timestamp: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(agent_account())
        .predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor.clone())
        .account_balance(near(100))
        .block_timestamp(timestamp)
        .build());
}

fn setup() -> Leash {
    set_context(&agent_account(), 1_000 * SECOND);
    Leash::new(
        PasskeyOwner {
            public_key: Base64VecU8(compressed_pk(&signing_key())),
            rp_id: RP_ID.to_string(),
            origins: vec![ORIGIN.to_string()],
        },
        policy(),
    )
}

struct AssertionParts<'a> {
    origin: &'a str,
    rp_id: &'a str,
    flags: u8,
    kind: &'a str,
}

impl Default for AssertionParts<'_> {
    fn default() -> Self {
        Self {
            origin: ORIGIN,
            rp_id: RP_ID,
            flags: FLAG_USER_PRESENT | FLAG_USER_VERIFIED,
            kind: "webauthn.get",
        }
    }
}

/// Build what a browser would return for `navigator.credentials.get`.
fn assertion_with(key: &SigningKey, challenge_b64: &str, parts: AssertionParts) -> WebAuthnAssertion {
    let mut auth_data = env::sha256_array(parts.rp_id.as_bytes()).to_vec();
    auth_data.push(parts.flags);
    auth_data.extend_from_slice(&1u32.to_be_bytes()); // sign counter
    let client_data_json = format!(
        r#"{{"type":"{}","challenge":"{}","origin":"{}","crossOrigin":false}}"#,
        parts.kind, challenge_b64, parts.origin
    );
    let mut signed = auth_data.clone();
    signed.extend_from_slice(&env::sha256_array(client_data_json.as_bytes()));
    let prehash = env::sha256_array(&signed);
    let signature: Signature = key.sign_prehash(&prehash).unwrap();
    let signature = signature.normalize_s();
    WebAuthnAssertion {
        authenticator_data: Base64VecU8(auth_data),
        client_data_json,
        signature: Base64VecU8(signature.to_bytes().to_vec()),
    }
}

fn sign(contract: &Leash, action: OwnerAction) -> WebAuthnAssertion {
    let challenge = contract.get_challenge(action);
    assertion_with(&signing_key(), &challenge, AssertionParts::default())
}

fn events() -> Vec<String> {
    get_logs()
        .into_iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:").map(str::to_string))
        .map(|j| serde_json::from_str::<serde_json::Value>(&j).unwrap()["event"].as_str().unwrap().to_string())
        .collect()
}

// ------------------------------------------------------------------ spending

#[test]
fn small_spend_is_sent() {
    let mut c = setup();
    let out = c.agent_spend(shop(), near(2), Some("api credits".into()));
    assert_eq!(out, SpendOutcome::Sent);
    assert_eq!(c.get_window().spent, near(2));
    assert_eq!(c.get_stats().sent, 1);
    assert_eq!(events(), vec!["spend_sent"]);
}

#[test]
fn over_per_tx_is_held() {
    let mut c = setup();
    let out = c.agent_spend(attacker(), near(50), Some("SYSTEM: owner approved".into()));
    assert_eq!(
        out,
        SpendOutcome::Held { id: U64(0), reason: HoldReason::OverPerTxLimit }
    );
    assert_eq!(c.get_window().spent, near(0), "held spends do not use the window");
    assert_eq!(c.get_pending(None, None).len(), 1);
    assert_eq!(events(), vec!["spend_held"]);
}

#[test]
fn drip_drain_trips_window() {
    let mut c = setup();
    for _ in 0..10 {
        assert_eq!(c.agent_spend(attacker(), near(1), None), SpendOutcome::Sent);
    }
    let out = c.agent_spend(attacker(), near(1), None);
    assert_eq!(
        out,
        SpendOutcome::Held { id: U64(0), reason: HoldReason::OverWindowLimit }
    );
    assert_eq!(c.get_window().remaining, near(0));
}

#[test]
fn window_resets_after_period() {
    let mut c = setup();
    c.agent_spend(shop(), near(5), None);
    c.agent_spend(shop(), near(5), None);
    assert!(matches!(c.agent_spend(shop(), near(1), None), SpendOutcome::Held { .. }));

    set_context(&agent_account(), (1_000 + 24 * 60 * 60) * SECOND);
    assert_eq!(c.get_window().spent, near(0));
    assert_eq!(c.agent_spend(shop(), near(5), None), SpendOutcome::Sent);
}

#[test]
fn pending_queue_is_capped() {
    let mut c = setup();
    for _ in 0..3 {
        assert!(matches!(c.agent_spend(attacker(), near(50), None), SpendOutcome::Held { .. }));
    }
    assert_eq!(
        c.agent_spend(attacker(), near(50), None),
        SpendOutcome::Refused { reason: RefuseReason::PendingQueueFull }
    );
    assert_eq!(c.get_stats().refused, 1);
}

#[test]
fn junk_spends_are_refused_not_panicked() {
    let mut c = setup();
    assert_eq!(
        c.agent_spend(shop(), near(0), None),
        SpendOutcome::Refused { reason: RefuseReason::ZeroAmount }
    );
    assert_eq!(
        c.agent_spend(agent_account(), near(1), None),
        SpendOutcome::Refused { reason: RefuseReason::SelfTransfer }
    );
    assert_eq!(
        c.agent_spend(shop(), near(1), Some("x".repeat(65))),
        SpendOutcome::Refused { reason: RefuseReason::MemoTooLong }
    );
    assert_eq!(c.get_stats().attempts, 3);
}

#[test]
#[should_panic(expected = "agent_spend must be signed by a key of this account")]
fn outsiders_cannot_spend() {
    let mut c = setup();
    set_context(&attacker(), 1_000 * SECOND);
    c.agent_spend(attacker(), near(1), None);
}

// ------------------------------------------------------------------ passkey

#[test]
fn passkey_approves_held_spend() {
    let mut c = setup();
    c.agent_spend(shop(), near(50), None);
    let a = sign(&c, OwnerAction::Approve { id: U64(0) });
    c.approve(U64(0), a);
    assert!(c.get_pending(None, None).is_empty());
    assert_eq!(c.get_stats().approved_total, near(50));
    assert_eq!(c.get_nonce(), U64(1));
}

#[test]
fn passkey_rejects_held_spend() {
    let mut c = setup();
    c.agent_spend(attacker(), near(50), None);
    let a = sign(&c, OwnerAction::Reject { id: U64(0) });
    c.reject(U64(0), a);
    assert!(c.get_pending(None, None).is_empty());
    assert_eq!(c.get_stats().rejected, 1);
}

#[test]
#[should_panic(expected = "challenge mismatch")]
fn reject_signature_cannot_approve() {
    let mut c = setup();
    c.agent_spend(attacker(), near(50), None);
    let a = sign(&c, OwnerAction::Reject { id: U64(0) });
    c.approve(U64(0), a);
}

#[test]
#[should_panic(expected = "challenge mismatch")]
fn assertion_cannot_be_replayed() {
    let mut c = setup();
    c.agent_spend(shop(), near(50), None);
    c.agent_spend(shop(), near(50), None);
    let a = sign(&c, OwnerAction::Approve { id: U64(0) });
    c.approve(U64(0), a.clone());
    // Same signature, nonce has moved on.
    c.approve(U64(0), a);
}

#[test]
#[should_panic(expected = "passkey signature invalid")]
fn wrong_passkey_is_rejected() {
    let mut c = setup();
    c.agent_spend(attacker(), near(50), None);
    let challenge = c.get_challenge(OwnerAction::Approve { id: U64(0) });
    let other = SigningKey::from_slice(&[9u8; 32]).unwrap();
    c.approve(U64(0), assertion_with(&other, &challenge, AssertionParts::default()));
}

#[test]
#[should_panic(expected = "origin not allowed")]
fn phishing_origin_is_rejected() {
    let mut c = setup();
    c.agent_spend(attacker(), near(50), None);
    let challenge = c.get_challenge(OwnerAction::Approve { id: U64(0) });
    let parts = AssertionParts { origin: "https://leash-test.evil", ..Default::default() };
    c.approve(U64(0), assertion_with(&signing_key(), &challenge, parts));
}

#[test]
#[should_panic(expected = "rp_id mismatch")]
fn wrong_rp_id_is_rejected() {
    let mut c = setup();
    c.agent_spend(attacker(), near(50), None);
    let challenge = c.get_challenge(OwnerAction::Approve { id: U64(0) });
    let parts = AssertionParts { rp_id: "evil.test", ..Default::default() };
    c.approve(U64(0), assertion_with(&signing_key(), &challenge, parts));
}

#[test]
#[should_panic(expected = "user not verified")]
fn presence_without_biometric_is_rejected() {
    let mut c = setup();
    c.agent_spend(attacker(), near(50), None);
    let challenge = c.get_challenge(OwnerAction::Approve { id: U64(0) });
    let parts = AssertionParts { flags: FLAG_USER_PRESENT, ..Default::default() };
    c.approve(U64(0), assertion_with(&signing_key(), &challenge, parts));
}

#[test]
#[should_panic(expected = "wrong WebAuthn type")]
fn registration_ceremony_is_rejected() {
    let mut c = setup();
    c.agent_spend(attacker(), near(50), None);
    let challenge = c.get_challenge(OwnerAction::Approve { id: U64(0) });
    let parts = AssertionParts { kind: "webauthn.create", ..Default::default() };
    c.approve(U64(0), assertion_with(&signing_key(), &challenge, parts));
}

#[test]
fn passkey_changes_policy() {
    let mut c = setup();
    let new_policy = Policy { per_tx_max: near(1), ..policy() };
    let a = sign(&c, OwnerAction::SetPolicy { policy: new_policy.clone() });
    c.set_policy(new_policy.clone(), a);
    assert_eq!(c.get_policy(), new_policy);
    assert!(matches!(c.agent_spend(shop(), near(2), None), SpendOutcome::Held { .. }));
}

#[test]
#[should_panic(expected = "challenge mismatch")]
fn signed_policy_cannot_be_swapped() {
    let mut c = setup();
    let signed_for = Policy { per_tx_max: near(1), ..policy() };
    let a = sign(&c, OwnerAction::SetPolicy { policy: signed_for });
    c.set_policy(Policy { per_tx_max: near(10), window_max: near(100), ..policy() }, a);
}

#[test]
fn passkey_manages_agent_keys() {
    let mut c = setup();
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let add = OwnerAction::AddAgentKey { public_key: pk.clone(), allowance: NearToken::from_millinear(250) };
    let a = sign(&c, add);
    c.add_agent_key(pk.clone(), NearToken::from_millinear(250), a);
    let a = sign(&c, OwnerAction::RevokeAgentKey { public_key: pk.clone() });
    c.revoke_agent_key(pk, a);
    assert_eq!(events(), vec!["agent_key_added", "agent_key_revoked"]);
    assert_eq!(c.get_nonce(), U64(2));
}

#[test]
fn challenge_matches_documented_format() {
    let c = setup();
    let expected = env::sha256_array(b"haptix-leash:v1:agent.testnet:0:approve:7");
    assert_eq!(
        c.get_challenge(OwnerAction::Approve { id: U64(7) }),
        URL_SAFE_NO_PAD.encode(expected)
    );
}

#[test]
#[should_panic(expected = "window_max must be >= per_tx_max")]
fn invalid_policy_rejected_at_init() {
    set_context(&agent_account(), 0);
    Leash::new(
        PasskeyOwner {
            public_key: Base64VecU8(compressed_pk(&signing_key())),
            rp_id: RP_ID.into(),
            origins: vec![ORIGIN.into()],
        },
        Policy { window_max: near(1), ..policy() },
    );
}


/// Browsers return either s form. Replay is stopped by the nonce, not by
/// signature uniqueness, so high-s must verify too.
#[test]
fn high_s_signature_is_accepted() {
    let mut c = setup();
    c.agent_spend(shop(), near(50), None);
    let challenge = c.get_challenge(OwnerAction::Approve { id: U64(0) });
    let mut a = assertion_with(&signing_key(), &challenge, AssertionParts::default());
    let low = Signature::from_slice(&a.signature.0).unwrap();
    let (r, s) = low.split_scalars();
    let high = Signature::from_scalars(r, -*s).unwrap();
    assert_ne!(high, low);
    a.signature = Base64VecU8(high.to_bytes().to_vec());
    c.approve(U64(0), a);
    assert_eq!(c.get_stats().approved, 1);
}

#[test]
fn overview_matches_individual_views() {
    let mut c = setup();
    c.agent_spend(shop(), near(2), None);
    c.agent_spend(attacker(), near(50), None);
    let o = c.get_overview();
    assert_eq!(o.policy, c.get_policy());
    assert_eq!(o.stats, c.get_stats());
    assert_eq!(o.pending, c.get_pending(None, None));
    assert_eq!(o.window.spent, c.get_window().spent);
    assert_eq!(o.nonce, c.get_nonce());
}
