// Deploy the leash contract to LEASH_ACCOUNT and initialize it with the dev
// passkey and the policy from .env. Run once per fresh account.
import { readFileSync } from "node:fs";
import { actions } from "near-api-js";
import { config, ownerAccount, txLink, view } from "./lib/config.mjs";
import { loadOrCreateDevPasskey } from "./lib/dev-passkey.mjs";

const wasmPath = new URL("../contract/target/near/haptix_leash.wasm", import.meta.url);
const passkey = loadOrCreateDevPasskey();
const owner = ownerAccount();

const outcome = await owner.signAndSendTransaction({
  receiverId: config.leashAccount,
  actions: [
    actions.deployContract(readFileSync(wasmPath)),
    actions.functionCall(
      "new",
      {
        owner: { public_key: passkey.publicKeyB64, rp_id: config.passkey.rpId, origins: config.passkey.origins },
        policy: config.policy,
      },
      config.gas.deploy,
      0n,
    ),
  ],
});

console.log("deployed + initialized:", txLink(outcome));
console.log("policy:", await view("get_policy"));
