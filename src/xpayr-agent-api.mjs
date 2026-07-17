async function request(agentKey, method, path, body, { baseUrl = "https://xpayr.com/api/v1", fetch: fetchImpl = globalThis.fetch } = {}) {
  if (!agentKey?.startsWith("ag_test_")) throw new Error("Arc Testnet examples require an ag_test_* agent key");
  const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}${path}`, { method, headers: { Accept: "application/json", Authorization: `Bearer ${agentKey}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `XPayr returned ${response.status}`);
  return payload;
}

export function submitIntent(agentKey, intent, options) { return request(agentKey, "POST", "/agent-intents", intent, options); }
export function getIntent(agentKey, intentId, options) { return request(agentKey, "GET", `/agent-intents/${encodeURIComponent(intentId)}`, undefined, options); }
export function bridgeIntent(agentKey, intentId, evidence, options) { return request(agentKey, "POST", `/agent-intents/${encodeURIComponent(intentId)}/bridge`, evidence, options); }
