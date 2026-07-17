import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  formatEther,
  formatUnits,
  getAddress,
} from "ethers";

const CHAIN_ID = 5042002;
const RPC_URL = "https://rpc.testnet.arc.network";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const MAX_AMOUNT_UNITS = 1_000n;
const API_BASE_URL = String(process.env.XPAYR_BASE_URL || "https://xpayr.com/api/v1").replace(/\/+$/, "");
const API_KEY = String(process.env.XPAYR_TEST_SECRET_KEY || "");
const WALLET_KEY = String(process.env.XPAYR_ARC_AGENT_TEST_PRIVATE_KEY || "");
const OUTPUT_PATH = String(process.env.XPAYR_E2E_OUTPUT || "artifacts/arc-testnet-e2e.json");
const EXISTING_PAYMENT_URL = String(process.env.XPAYR_EXISTING_PAYMENT_URL || "");
const RPC_READ_DELAY_MS = 350;

assert.equal(process.env.XPAYR_E2E_ACK, "ARC_TESTNET_ONLY", "XPAYR_E2E_ACK must explicitly select Arc Testnet");
assert.match(API_BASE_URL, /^https:\/\//);
assert.match(API_KEY, /^sk_test_[A-Za-z0-9_-]{32,}$/);
assert.match(WALLET_KEY, /^0x[a-fA-F0-9]{64}$/);
if (EXISTING_PAYMENT_URL) {
  assert.match(
    EXISTING_PAYMENT_URL,
    /^https:\/\/xpayr\.com\/(?:pay|test|test-pay)\/ps_[a-z0-9]+$/,
    "Existing payment URL must be an XPayr Testnet session",
  );
}

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const SPLITTER_ABI = [
  "function payToken(bytes32,address,address,address,uint256,uint16,uint256,bytes)",
  "function usedPaymentIds(bytes32) view returns (bool)",
  "event PaymentSplit(bytes32 indexed paymentId,address indexed payer,address indexed token,uint256 amount,uint256 platformAmount,uint256 vendorAmount,address platformWallet,address vendorWallet)",
];

async function api(method, path, body, { authenticated = true } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(authenticated ? { Authorization: `Bearer ${API_KEY}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      "User-Agent": "XPayr-Agent-Arc-Testnet-E2E/1.0",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${method} ${path} returned invalid JSON (${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status} ${payload?.error?.code || "unknown"})`);
  }
  return payload;
}

function extractAppConfig(html) {
  const match = html.match(/window\.AppConfig\s*=\s*(\{.*?\});\s*<\/script>/s);
  assert.ok(match, "Hosted checkout AppConfig was not found");
  return JSON.parse(match[1]);
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const isRateLimitError = (error) => error?.info?.error?.code === -32011
  || /request limit reached/i.test(String(error?.message || ""));

async function rpcRead(label, operation) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const result = await operation();
      await sleep(RPC_READ_DELAY_MS);
      return result;
    } catch (error) {
      if (!isRateLimitError(error) || attempt === 6) {
        throw new Error(`${label} failed`, { cause: error });
      }
      await sleep(Math.min(1_000 * attempt, 5_000));
    }
  }
  throw new Error(`${label} exhausted its retry budget`);
}

async function prepareAndBroadcast(label, operation) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const safePreBroadcastFailure = ["call", "estimateGas"].includes(error?.action);
      if (!isRateLimitError(error) || !safePreBroadcastFailure || attempt === 4) {
        throw new Error(`${label} failed`, { cause: error });
      }
      await sleep(Math.min(1_500 * attempt, 5_000));
    }
  }
  throw new Error(`${label} exhausted its retry budget`);
}

let session = null;
let paymentUrl = EXISTING_PAYMENT_URL;
if (!paymentUrl) {
  session = await api("POST", "/payments", {
    amount: "0.001000",
    currency: "USDC",
    network: "arc-testnet",
    order_id: `AGENT-CI-${Date.now()}`,
    description: "Bounded agent-wallet Arc Testnet E2E",
    metadata: { source: "github-actions", purpose: "agent-payment-e2e" },
  });
  assert.match(session.id || "", /^ps_[a-z0-9]+$/);
  assert.equal(session.status, "pending");
  assert.equal(session.livemode, false);
  paymentUrl = session.payment_url;
}

const checkoutResponse = await fetch(paymentUrl, {
  headers: { "User-Agent": "XPayr-Agent-Arc-Testnet-E2E/1.0" },
  signal: AbortSignal.timeout(25_000),
});
assert.equal(checkoutResponse.status, 200);
const config = extractAppConfig(await checkoutResponse.text());
assert.equal(config.network, "arc-testnet");
assert.equal(Number(config.networks?.["arc-testnet"]?.chain_id_int), CHAIN_ID);
assert.match(config.sessionId || "", /^ps_[a-z0-9]+$/);
if (session) {
  assert.equal(config.sessionId, session.id);
} else {
  session = {
    id: config.sessionId,
    payment_url: paymentUrl,
    status: "pending",
    livemode: false,
  };
}

const currency = config.paymentCurrencies?.["arc-testnet"]?.USDC;
const authorization = config.marketplaceSplit?.authorization;
assert.ok(currency && authorization, "Signed splitter authorization is missing");
assert.equal(String(currency.token_address).toLowerCase(), USDC_ADDRESS.toLowerCase());
assert.equal(Number(currency.decimals), 6);

const amount = BigInt(authorization.amount);
assert.ok(amount > 0n && amount <= MAX_AMOUNT_UNITS, "E2E amount exceeds the 0.001000 USDC hard limit");

const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID, { staticNetwork: true, batchMaxCount: 1 });
try {
  const network = await rpcRead("network lookup", () => provider.getNetwork());
  assert.equal(Number(network.chainId), CHAIN_ID);
  const wallet = new Wallet(WALLET_KEY, provider);
  const tokenAddress = getAddress(currency.token_address);
  const splitterAddress = getAddress(authorization.splitterContract);
  const platformWallet = getAddress(authorization.platformWallet);
  const merchantWallet = getAddress(authorization.vendorWallet);
  const token = new Contract(tokenAddress, ERC20_ABI, wallet);
  const splitter = new Contract(splitterAddress, SPLITTER_ABI, wallet);

  const nativeBefore = await rpcRead("agent native balance", () => provider.getBalance(wallet.address));
  const payerBefore = await rpcRead("agent USDC balance", () => token.balanceOf(wallet.address));
  const platformBefore = await rpcRead("platform USDC balance", () => token.balanceOf(platformWallet));
  const merchantBefore = await rpcRead("merchant USDC balance", () => token.balanceOf(merchantWallet));
  const allowance = await rpcRead("splitter allowance", () => token.allowance(wallet.address, splitterAddress));
  const used = await rpcRead("payment ID status", () => splitter.usedPaymentIds(authorization.paymentId));
  assert.ok(nativeBefore > 0n, "Agent wallet has no Arc Testnet gas balance");
  assert.ok(payerBefore >= amount, "Agent wallet has insufficient Arc Testnet USDC");
  assert.equal(used, false, "Payment authorization has already been consumed");

  let approvalTx = null;
  if (allowance < amount) {
    const approval = await prepareAndBroadcast("USDC approval", () => token.approve(splitterAddress, amount));
    const approvalReceipt = await approval.wait(1);
    assert.equal(approvalReceipt.status, 1);
    approvalTx = approvalReceipt.hash;
  }

  const payment = await prepareAndBroadcast("split payment", () => splitter.payToken(
      authorization.paymentId,
      tokenAddress,
      platformWallet,
      merchantWallet,
      amount,
      Number(authorization.platformFeeBps),
      BigInt(authorization.deadline),
      authorization.signature,
    ));
  const receipt = await payment.wait(1);
  assert.equal(receipt.status, 1);

  const iface = new Interface(SPLITTER_ABI);
  const split = receipt.logs.map((log) => {
    try { return iface.parseLog(log); } catch { return null; }
  }).find((event) => event?.name === "PaymentSplit");
  assert.ok(split, "PaymentSplit event is missing");
  assert.equal(getAddress(split.args.payer), wallet.address);
  assert.equal(split.args.amount, amount);

  const completed = await api("POST", `/payments/${encodeURIComponent(session.id)}/complete`, {
    tx_hash: receipt.hash,
    from_address: wallet.address,
    chain_id: CHAIN_ID,
    marketplace_split: true,
    split_transactions: [{
      role: "contract_split",
      wallet: splitterAddress,
      amount: amount.toString(),
      tx_hash: receipt.hash,
      payment_id: authorization.paymentId,
      platform_wallet: platformWallet,
      vendor_wallet: merchantWallet,
      platform_fee_bps: Number(authorization.platformFeeBps),
    }],
  }, { authenticated: false });
  assert.equal(completed.status, "completed");

  const status = await api("GET", `/payments/${encodeURIComponent(session.id)}/status`, undefined, { authenticated: false });
  assert.equal(status.status, "completed");

  const payerAfter = await rpcRead("final agent USDC balance", () => token.balanceOf(wallet.address));
  const platformAfter = await rpcRead("final platform USDC balance", () => token.balanceOf(platformWallet));
  const merchantAfter = await rpcRead("final merchant USDC balance", () => token.balanceOf(merchantWallet));
  const nativeAfter = await rpcRead("final agent native balance", () => provider.getBalance(wallet.address));
  assert.equal(platformAfter - platformBefore, split.args.platformAmount);
  assert.equal(merchantAfter - merchantBefore, split.args.vendorAmount);

  const evidence = {
    ok: true,
    verified_at: new Date().toISOString(),
    network: "arc-testnet",
    chain_id: CHAIN_ID,
    session_id: session.id,
    transaction_hash: receipt.hash,
    block_number: receipt.blockNumber,
    approval_transaction_hash: approvalTx,
    agent_wallet: wallet.address,
    splitter_contract: splitterAddress,
    platform_wallet: platformWallet,
    merchant_wallet: merchantWallet,
    amount_usdc: formatUnits(amount, 6),
    platform_amount_usdc: formatUnits(split.args.platformAmount, 6),
    merchant_amount_usdc: formatUnits(split.args.vendorAmount, 6),
    payer_delta_units: (payerAfter - payerBefore).toString(),
    gas_balance_before: formatEther(nativeBefore),
    gas_balance_after: formatEther(nativeAfter),
    backend_status: completed.status,
    public_status: status.status,
    mainnet_used: false,
  };
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(evidence));
} finally {
  provider.destroy();
}
