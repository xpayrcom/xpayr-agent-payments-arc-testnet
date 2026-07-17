# XPayr Agent Payments on Arc Testnet

[![CI](https://github.com/xpayrcom/xpayr-agent-payments-arc-testnet/actions/workflows/ci.yml/badge.svg)](https://github.com/xpayrcom/xpayr-agent-payments-arc-testnet/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-0f766e.svg)](LICENSE)

Reference flow for policy-controlled agent decisions, agent-wallet execution, Arc Testnet USDC settlement, and XPAYR reconciliation.

> **Status:** Arc Testnet reference · no private-key custody

## Purpose

Make the full agent decision → agent wallet → Arc Testnet transaction → XPAYR reconciliation flow inspectable and reproducible.

## Included

- Deterministic ALLOW, HOLD, and DENY policy evaluator
- Agent identity, intent, approval, and bridge API examples
- Execution-evidence verification without storing wallet keys

## Quick start

```bash
cp .env.example .env
npm install
npm test
```

## Reproducible proof path

[`docs/agent-to-settlement.md`](docs/agent-to-settlement.md) defines the complete evidence chain:

`agent decision → XPayr policy → external agent wallet → Arc Testnet USDC transaction → XPayr reconciliation`

The sample policy uses exact six-decimal USDC arithmetic and explicit recipient, network, token, per-transaction, daily, retry, and route-mutation controls. It never auto-approves a `HOLD` and never accepts a private key.

Use an XPayr test key before live credentials. Never expose `sk_test_*`, `sk_live_*`, agent keys, webhook secrets, or wallet private keys in browser code or commits.

## Arc status

This repository supports **Arc Testnet** only. It does not claim Arc Mainnet production availability or endorsement by Circle. Arc is a trademark of Circle Internet Group, Inc. and/or its affiliates.

## Real transaction workflow

`Agent wallet Arc Testnet E2E` is a bounded GitHub Actions workflow backed by a dedicated low-balance Testnet wallet and restricted XPayr test key. It creates a session, consumes the signed splitter authorization on Arc Testnet, submits the receipt to XPayr, verifies the completed public status, and uploads a secret-free evidence artifact. The hard-coded payment ceiling is `0.001000 USDC`, which keeps the transaction small while still exercising non-zero fee splitting; Mainnet and automatic wallet funding are not supported.

The committed [`arc-testnet-agent-payment.json`](evidence/arc-testnet-agent-payment.json) fixture references a real completed `0.01 USDC` payment. The read-only verifier re-fetches its receipt and XPayr status, then checks payer, splitter, token, amount, platform fee, merchant amount, and recipient addresses against the `PaymentSplit` event.

## Documentation

- [Developer Hub](https://xpayr.com/developers)
- [Merchant API documentation](https://xpayr.com/doc-api)
- [Testnet checkout guide](https://xpayr.com/developers/testnet-checkout-api)
- [Webhook signature guide](https://xpayr.com/developers/webhook-signature-guide)

## Security

Read [SECURITY.md](SECURITY.md) before reporting a vulnerability. Payment completion must be based on verified XPayr webhook/API state and canonical on-chain evidence, not browser callbacks alone.

## License

MIT. See [LICENSE](LICENSE).
