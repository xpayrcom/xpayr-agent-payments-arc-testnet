export function parseUsdc(value) {
  const text = String(value);
  const match = text.match(/^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/);
  if (!match) throw new TypeError("USDC amount must be a non-negative decimal with at most 6 places");
  return BigInt(match[1]) * 1_000_000n + BigInt((match[2] || "").padEnd(6, "0"));
}

export function formatUsdc(units) {
  const whole = units / 1_000_000n;
  const fraction = String(units % 1_000_000n).padStart(6, "0");
  return `${whole}.${fraction}`;
}
