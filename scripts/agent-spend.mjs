// Spend as the agent: signs agent_spend with the agent's function-call key.
//   node --env-file=.env agent-spend.mjs <receiver> <amountNEAR> [memo]
import { readFileSync } from "node:fs";
import { nearToYocto } from "near-api-js";
import { agentAccount, config, txLink } from "./lib/config.mjs";

const [receiver, amountNear, ...memoWords] = process.argv.slice(2);
if (!receiver || !amountNear) throw new Error("usage: agent-spend.mjs <receiver> <amountNEAR> [memo]");

const { secret } = JSON.parse(readFileSync(new URL("./.dev-agent-key.json", import.meta.url), "utf8"));
const outcome = await agentAccount(secret).callFunctionRaw({
  contractId: config.leashAccount,
  methodName: "agent_spend",
  args: { receiver_id: receiver, amount: nearToYocto(amountNear).toString(), memo: memoWords.join(" ") || null },
  gas: config.gas.call,
});
const result = JSON.parse(Buffer.from(outcome.status.SuccessValue, "base64").toString());
console.log(`${amountNear} NEAR -> ${receiver}:`, result, txLink(outcome));
