// Shared config for dev scripts. Every value comes from scripts/.env
// (see .env.example); nothing network- or account-specific lives in code.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Account, JsonRpcProvider, KeyPairSigner, nearToYocto } from "near-api-js";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in scripts/.env (see .env.example)`);
  return value;
}

export const config = {
  network: required("NEAR_NETWORK"),
  rpcUrl: required("NEAR_RPC_URL"),
  explorerTxUrl: required("NEAR_EXPLORER_TX_URL"),
  leashAccount: required("LEASH_ACCOUNT"),
  credentialsDir: process.env.NEAR_CREDENTIALS_DIR || join(homedir(), ".near-credentials"),
  passkey: {
    rpId: required("PASSKEY_RP_ID"),
    origins: required("PASSKEY_ORIGINS").split(",").map((o) => o.trim()),
  },
  policy: {
    per_tx_max: nearToYocto(required("POLICY_PER_TX_MAX_NEAR")).toString(),
    window_max: nearToYocto(required("POLICY_WINDOW_MAX_NEAR")).toString(),
    window_secs: Number(required("POLICY_WINDOW_SECS")),
    max_pending: Number(required("POLICY_MAX_PENDING")),
    max_memo_bytes: Number(required("POLICY_MAX_MEMO_BYTES")),
  },
  agentKeyAllowance: nearToYocto(required("AGENT_KEY_ALLOWANCE_NEAR")).toString(),
  gas: {
    call: BigInt(required("GAS_CALL_TGAS")) * 10n ** 12n,
    deploy: BigInt(required("GAS_DEPLOY_TGAS")) * 10n ** 12n,
  },
};

export const provider = new JsonRpcProvider({ url: config.rpcUrl });

/** The account's full-access key, as saved by `near ... save-to-legacy-keychain`. */
export function ownerAccount() {
  const file = join(config.credentialsDir, config.network, `${config.leashAccount}.json`);
  const { private_key } = JSON.parse(readFileSync(file, "utf8"));
  return new Account(config.leashAccount, provider, KeyPairSigner.fromSecretKey(private_key));
}

/** The same account, signing with a function-call key only. */
export function agentAccount(secretKey) {
  return new Account(config.leashAccount, provider, KeyPairSigner.fromSecretKey(secretKey));
}

export function view(method, args = {}) {
  return provider.callFunction({ contractId: config.leashAccount, method, args });
}

export function txLink(outcome) {
  return `${config.explorerTxUrl}${outcome.transaction.hash}`;
}
