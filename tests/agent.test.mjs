import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyExecutionEvidence } from "../src/evidence.mjs";
import { evaluateIntent } from "../src/policy.mjs";

const policy = JSON.parse(await readFile(new URL("../config/policy.example.json", import.meta.url)));
const recipient = policy.recipient_allowlist[0];
const base = { amount: "10.000000", token: "USDC", network: "arc-testnet", recipient };

test("returns ALLOW for a bounded intent", () => assert.equal(evaluateIntent(policy, base, { spent_today: "5" }).decision, "ALLOW"));
test("returns HOLD for approval threshold, route mutation, and retry loop", () => {
  assert.equal(evaluateIntent(policy, { ...base, amount: "75" }).decision, "HOLD");
  assert.equal(evaluateIntent(policy, base, { route_changed: true }).reason, "recipient_or_route_changed");
  assert.equal(evaluateIntent(policy, base, { retry_count: 2 }).reason, "retry_loop_detected");
});
test("returns DENY for freeze, limits, or foreign recipient", () => {
  assert.equal(evaluateIntent({ ...policy, frozen: true }, base).reason, "policy_frozen");
  assert.equal(evaluateIntent(policy, { ...base, amount: "101" }).reason, "transaction_limit_exceeded");
  assert.equal(evaluateIntent(policy, { ...base, recipient: "0x2222222222222222222222222222222222222222" }).reason, "recipient_not_allowed");
});
test("requires the complete agent-wallet-chain-XPayr evidence chain", () => {
  const tx = `0x${"a".repeat(64)}`;
  const result = verifyExecutionEvidence({ intent: { ...base, id: "agi_test" }, decision: { decision: "ALLOW" }, walletAddress: recipient, transactionHash: tx, receipt: { status: "0x1", transactionHash: tx }, payment: { id: "ps_test", amount: "10.000000", currency: "USDC", network: "arc-testnet", status: "completed" } });
  assert.equal(result.valid, true);
  assert.equal(verifyExecutionEvidence({ intent: base, decision: { decision: "HOLD" }, walletAddress: recipient, transactionHash: tx, receipt: {}, payment: {} }).valid, false);
});
