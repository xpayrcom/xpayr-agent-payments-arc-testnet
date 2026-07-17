import { readFile } from "node:fs/promises";
import { evaluateIntent } from "../src/policy.mjs";
import { submitIntent } from "../src/xpayr-agent-api.mjs";

const policy = JSON.parse(await readFile(new URL("../config/policy.example.json", import.meta.url)));
const intent = { amount: "12.500000", token: "USDC", network: "arc-testnet", recipient: policy.recipient_allowlist[0], target_ref: "order_demo_1001", category: "merchant_checkout" };
const localDecision = evaluateIntent(policy, intent, { spent_today: "20.000000", retry_count: 0, route_changed: false });
console.log(JSON.stringify({ stage: "local_policy", ...localDecision }, null, 2));

if (localDecision.decision === "ALLOW") {
  // XPayr evaluates its authoritative server-side policy again.
  const response = await submitIntent(process.env.XPAYR_AGENT_KEY, intent);
  console.log(JSON.stringify({ stage: "xpayr_intent", response }, null, 2));
}
