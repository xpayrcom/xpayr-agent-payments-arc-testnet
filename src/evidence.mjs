const txPattern = /^0x[a-fA-F0-9]{64}$/;

export function verifyExecutionEvidence({ intent, decision, walletAddress, transactionHash, receipt, payment }) {
  const findings = [];
  if (decision?.decision !== "ALLOW") findings.push("intent_was_not_allowed");
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress || "")) findings.push("invalid_agent_wallet");
  if (!txPattern.test(transactionHash || "")) findings.push("invalid_transaction_hash");
  if (!receipt || receipt.status !== "0x1" || String(receipt.transactionHash).toLowerCase() !== String(transactionHash).toLowerCase()) findings.push("unconfirmed_transaction");
  if (payment?.network !== "arc-testnet" || payment?.currency !== "USDC") findings.push("payment_rail_mismatch");
  if (payment?.status !== "completed") findings.push("payment_not_completed");
  if (String(payment?.amount) !== String(intent?.amount)) findings.push("amount_mismatch");
  return { valid: findings.length === 0, findings, evidence: { intent_id: intent?.id, agent_wallet: walletAddress, tx_hash: transactionHash, payment_id: payment?.id } };
}
