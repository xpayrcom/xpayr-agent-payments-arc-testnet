import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Interface, JsonRpcProvider, getAddress } from "ethers";

const evidence = JSON.parse(await readFile(new URL("../evidence/arc-testnet-agent-payment.json", import.meta.url), "utf8"));
assert.equal(evidence.network, "arc-testnet");
assert.equal(evidence.chain_id, 5042002);
assert.equal(evidence.mainnet_used, false);

const provider = new JsonRpcProvider("https://rpc.testnet.arc.network", evidence.chain_id, { staticNetwork: true });
const iface = new Interface([
  "event PaymentSplit(bytes32 indexed paymentId,address indexed payer,address indexed token,uint256 amount,uint256 platformAmount,uint256 vendorAmount,address platformWallet,address vendorWallet)",
]);

try {
  const receipt = await provider.getTransactionReceipt(evidence.transaction_hash);
  assert.ok(receipt, "Known Arc Testnet receipt is unavailable");
  assert.equal(receipt.status, 1);
  assert.equal(receipt.blockNumber, evidence.block_number);
  assert.equal(receipt.blockHash.toLowerCase(), evidence.block_hash.toLowerCase());
  assert.equal(getAddress(receipt.from), getAddress(evidence.agent_wallet));
  assert.equal(getAddress(receipt.to), getAddress(evidence.splitter_contract));

  const event = receipt.logs.map((log) => {
    try { return iface.parseLog(log); } catch { return null; }
  }).find((entry) => entry?.name === "PaymentSplit");
  assert.ok(event, "PaymentSplit event is unavailable");
  assert.equal(event.args.paymentId.toLowerCase(), evidence.payment_id.toLowerCase());
  assert.equal(getAddress(event.args.payer), getAddress(evidence.agent_wallet));
  assert.equal(getAddress(event.args.token), getAddress(evidence.token));
  assert.equal(event.args.amount.toString(), evidence.amount_units);
  assert.equal(event.args.platformAmount.toString(), evidence.platform_amount_units);
  assert.equal(event.args.vendorAmount.toString(), evidence.merchant_amount_units);
  assert.equal(getAddress(event.args.platformWallet), getAddress(evidence.platform_wallet));
  assert.equal(getAddress(event.args.vendorWallet), getAddress(evidence.merchant_wallet));

  const response = await fetch(`https://xpayr.com/api/v1/payments/${encodeURIComponent(evidence.session_id)}/status`, {
    headers: { "User-Agent": "XPayr-Known-Arc-Agent-Payment-Verifier/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200);
  const payment = await response.json();
  assert.equal(payment.status, "completed");

  console.log(JSON.stringify({
    ok: true,
    transaction_hash: evidence.transaction_hash,
    block_number: receipt.blockNumber,
    payment_status: payment.status,
    amount_units: event.args.amount.toString(),
    platform_amount_units: event.args.platformAmount.toString(),
    merchant_amount_units: event.args.vendorAmount.toString(),
  }));
} finally {
  provider.destroy();
}
