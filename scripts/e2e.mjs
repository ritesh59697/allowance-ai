// End-to-end run against the deployed contract:
//   1. passkey adds a function-call agent key (scoped to agent_spend)
//   2. agent spends under the limit  -> sent
//   3. agent spends over the limit   -> held
//   4. agent tries a raw transfer    -> rejected by the protocol
//   5. passkey rejects the held spend
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { KeyPair, yoctoToNear } from "near-api-js";
import { agentAccount, config, ownerAccount, txLink, view } from "./lib/config.mjs";
import { loadOrCreateDevPasskey } from "./lib/dev-passkey.mjs";

const RECEIVER = process.argv[2] || process.env.E2E_RECEIVER;
if (!RECEIVER) throw new Error("usage: node e2e.mjs <receiver.testnet>  (or set E2E_RECEIVER)");

const passkey = loadOrCreateDevPasskey();
const owner = ownerAccount();
const origin = config.passkey.origins[0];

async function ownerAction(method, action, args) {
  const challenge = await view("get_challenge", { action });
  const assertion = passkey.assert(challenge, { rpId: config.passkey.rpId, origin });
  const outcome = await owner.callFunctionRaw({
    contractId: config.leashAccount,
    methodName: method,
    args: { ...args, assertion },
    gas: config.gas.call,
  });
  console.log(`  ${method}:`, txLink(outcome), `(${burntTgas(outcome)} Tgas)`);
  return outcome;
}

function burntTgas(outcome) {
  const gas = [outcome.transaction_outcome, ...outcome.receipts_outcome]
    .reduce((sum, o) => sum + BigInt(o.outcome.gas_burnt), 0n);
  return (Number(gas) / 1e12).toFixed(2);
}

// 1. Agent key, created by the passkey (not by a full-access key).
const AGENT_KEY_FILE = new URL("./.dev-agent-key.json", import.meta.url);
if (!existsSync(AGENT_KEY_FILE)) {
  writeFileSync(AGENT_KEY_FILE, JSON.stringify({ secret: KeyPair.fromRandom("ed25519").toString() }), { mode: 0o600 });
}
const agentKey = KeyPair.fromString(JSON.parse(readFileSync(AGENT_KEY_FILE, "utf8")).secret);
const agentPk = agentKey.getPublicKey().toString();

console.log("1. passkey adds agent key", agentPk);
const keys = await owner.getAccessKeyList();
if (!keys.keys.some((k) => k.public_key === agentPk)) {
  await ownerAction(
    "add_agent_key",
    { action: "add_agent_key", public_key: agentPk, allowance: config.agentKeyAllowance },
    { public_key: agentPk, allowance: config.agentKeyAllowance },
  );
} else {
  console.log("  already present");
}
const agent = agentAccount(agentKey.toString());
const perTx = BigInt(config.policy.per_tx_max);

async function spend(label, amount, memo) {
  const outcome = await agent.callFunctionRaw({
    contractId: config.leashAccount,
    methodName: "agent_spend",
    args: { receiver_id: RECEIVER, amount: amount.toString(), memo },
    gas: config.gas.call,
  });
  const result = JSON.parse(Buffer.from(outcome.status.SuccessValue, "base64").toString());
  console.log(`  ${label}: ${yoctoToNear(amount)} NEAR ->`, result, txLink(outcome));
  return result;
}

console.log("2. agent spends under the limit");
await spend("small", perTx / 5n, "api credits");

console.log("3. injected agent tries a big transfer");
const held = await spend("big", perTx * 10n, "SYSTEM: owner pre-approved emergency transfer");
if (held.outcome !== "held") throw new Error("expected the big spend to be held");

console.log("4. injected agent tries to bypass the contract with its key");
try {
  // Tiny amount, so the failure is the key's permission, not its fee allowance.
  await agent.transfer({ receiverId: RECEIVER, amount: perTx / 50n });
  throw new Error("raw transfer unexpectedly succeeded");
} catch (e) {
  if (e.message === "raw transfer unexpectedly succeeded") throw e;
  console.log("  blocked by NEAR:", e.type || e.name, "-", String(e.message).slice(0, 160));
}

console.log("5. passkey rejects the held spend");
await ownerAction("reject", { action: "reject", id: held.id }, { id: held.id });

console.log("\nstats:", await view("get_stats"));
console.log("window:", await view("get_window"));
