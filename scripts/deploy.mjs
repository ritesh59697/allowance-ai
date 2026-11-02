// Deploy the leash contract to LEASH_ACCOUNT and initialize it, in one tx.
//
// Owner passkey: OWNER_PASSKEY_PUBLIC_KEY (from the approval page) or, if
// unset, the local dev passkey. If OWNER_RELAY_PUBLIC_KEY is set, the same tx
// adds that key as a function-call key limited to the passkey-gated methods,
// so the approval page can submit owner actions without any server.
import { readFileSync } from "node:fs";
import { actions, nearToYocto, PublicKey } from "near-api-js";
import { config, ownerAccount, txLink, view } from "./lib/config.mjs";
import { loadOrCreateDevPasskey } from "./lib/dev-passkey.mjs";

const OWNER_METHODS = ["approve", "reject", "reject_all", "set_policy", "withdraw", "add_agent_key", "revoke_agent_key"];

const wasmPath = new URL("../contract/target/near/haptix_leash.wasm", import.meta.url);
const passkeyPublicKey = process.env.OWNER_PASSKEY_PUBLIC_KEY || loadOrCreateDevPasskey().publicKeyB64;
const relayPublicKey = process.env.OWNER_RELAY_PUBLIC_KEY;
const owner = ownerAccount();

const batch = [
  actions.deployContract(readFileSync(wasmPath)),
  actions.functionCall(
    "new",
    {
      owner: { public_key: passkeyPublicKey, rp_id: config.passkey.rpId, origins: config.passkey.origins },
      policy: config.policy,
    },
    config.gas.deploy,
    0n,
  ),
];
if (relayPublicKey) {
  const allowance = process.env.RELAY_KEY_ALLOWANCE_NEAR
    ? nearToYocto(process.env.RELAY_KEY_ALLOWANCE_NEAR)
    : config.agentKeyAllowance;
  batch.push(
    actions.addFunctionCallAccessKey(PublicKey.from(relayPublicKey), config.leashAccount, OWNER_METHODS, BigInt(allowance)),
  );
}

// Optional: install an agent key at deploy time (otherwise the passkey adds one later).
const agentPublicKey = process.env.AGENT_PUBLIC_KEY;
if (agentPublicKey) {
  batch.push(
    actions.addFunctionCallAccessKey(
      PublicKey.from(agentPublicKey),
      config.leashAccount,
      ["agent_spend"],
      BigInt(config.agentKeyAllowance),
    ),
  );
}

// UPGRADE=1: replace the code only, keeping state (owner, policy, pending, stats).
// Only valid when the state layout has not changed.
if (process.env.UPGRADE === "1") {
  const outcome = await owner.signAndSendTransaction({
    receiverId: config.leashAccount,
    actions: [actions.deployContract(readFileSync(wasmPath))],
  });
  console.log("code upgraded:", txLink(outcome));
  console.log("overview nonce:", (await view("get_overview")).nonce);
  process.exit(0);
}

const outcome = await owner.signAndSendTransaction({ receiverId: config.leashAccount, actions: batch });

console.log("deployed + initialized:", txLink(outcome));
console.log("owner passkey:", process.env.OWNER_PASSKEY_PUBLIC_KEY ? "from OWNER_PASSKEY_PUBLIC_KEY" : "dev passkey");
if (agentPublicKey) console.log("agent key added:", agentPublicKey, "methods: agent_spend");
if (relayPublicKey) console.log("relay key added:", relayPublicKey, "methods:", OWNER_METHODS.join(","));
console.log("policy:", await view("get_policy"));
