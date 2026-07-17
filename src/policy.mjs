import { formatUsdc, parseUsdc } from "./amounts.mjs";

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const outcome = (decision, reason, context = {}) => Object.freeze({ decision, reason, ...context });

export function evaluateIntent(policy, intent, state = {}) {
  try {
    const amount = parseUsdc(intent.amount);
    const spentToday = parseUsdc(state.spent_today || "0");
    const maxTransaction = parseUsdc(policy.max_transaction);
    const dailyLimit = parseUsdc(policy.daily_limit);
    const approvalThreshold = parseUsdc(policy.human_approval_above);
    const recipient = String(intent.recipient || "").toLowerCase();
    const allowlist = (policy.recipient_allowlist || []).map((entry) => String(entry).toLowerCase());

    if (policy.frozen) return outcome("DENY", "policy_frozen");
    if (intent.network !== "arc-testnet" || !(policy.allowed_networks || []).includes(intent.network)) return outcome("DENY", "network_not_allowed");
    if (intent.token !== "USDC" || !(policy.allowed_tokens || []).includes(intent.token)) return outcome("DENY", "token_not_allowed");
    if (!addressPattern.test(recipient) || !allowlist.includes(recipient)) return outcome("DENY", "recipient_not_allowed");
    if (amount <= 0n) return outcome("DENY", "amount_not_positive");
    if (amount > maxTransaction) return outcome("DENY", "transaction_limit_exceeded", { amount: formatUsdc(amount), limit: formatUsdc(maxTransaction) });
    if (amount + spentToday > dailyLimit) return outcome("DENY", "daily_limit_exceeded", { projected_daily_total: formatUsdc(amount + spentToday), limit: formatUsdc(dailyLimit) });
    if (state.route_changed === true) return outcome("HOLD", "recipient_or_route_changed");
    if (Number(state.retry_count || 0) > Number(policy.max_retries ?? 0)) return outcome("HOLD", "retry_loop_detected");
    if (amount > approvalThreshold) return outcome("HOLD", "human_approval_required", { amount: formatUsdc(amount), threshold: formatUsdc(approvalThreshold) });
    return outcome("ALLOW", "policy_passed", { amount: formatUsdc(amount), projected_daily_total: formatUsdc(amount + spentToday) });
  } catch (error) {
    return outcome("DENY", "invalid_intent", { detail: error.message });
  }
}
