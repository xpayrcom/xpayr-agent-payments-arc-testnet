# Agent decision to Arc Testnet settlement

This reference makes every trust boundary visible:

1. **Agent decision:** a deterministic local policy classifies the proposed payment as `ALLOW`, `HOLD`, or `DENY`.
2. **XPayr intent:** the agent submits the intent with an `ag_test_*` key. XPayr applies the authoritative merchant policy again.
3. **Human approval:** `HOLD` remains in the merchant approval queue. No wallet prompt is produced until approval.
4. **Agent wallet:** an external wallet or smart account signs the Arc Testnet transaction. This repository never receives a private key.
5. **Arc Testnet USDC:** the transaction settles on chain ID `5042002` using the current Testnet rail.
6. **Reconciliation:** XPayr correlates the intent, payment session, transaction receipt, and webhook state.
7. **Evidence:** `verifyExecutionEvidence` checks the chain receipt and completed XPayr state before presenting the flow as complete.

The local policy is defense in depth, not a substitute for XPayr’s server-side guard. Arc is infrastructure; XPAYR remains the payment product.

Arc is a trademark of Circle Internet Group, Inc. and/or its affiliates.
