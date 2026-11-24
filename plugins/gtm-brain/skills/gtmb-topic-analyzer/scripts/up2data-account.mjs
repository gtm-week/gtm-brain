// Free account check only. Never emit provider text, account IDs or webhook secrets.
import { pathToFileURL } from 'node:url';
export async function checkAccount({ key = process.env.UP2DATA_API_KEY, fetchImpl = globalThis.fetch } = {}) {
  if (!key?.trim()) return { status: 'missing_credential', authenticated: false };
  try {
    const response = await fetchImpl('https://api.up2data.ai/v1/account', {
      method: 'GET', headers: { 'X-API-Key': key.trim(), Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return { status: response.status === 401 ? 'invalid_credential' : response.status === 429 ? 'rate_limited' : 'http_error', authenticated: false, http_status: response.status };
    const { data } = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Number.isFinite(data.credits_remaining) || data.credits_remaining < 0) return { status: 'invalid_response', authenticated: false };
    const result = { status: 'connected', authenticated: true };
    for (const field of ['credits_remaining', 'credits_used_this_month', 'price_per_1k_credits_usd']) {
      if (typeof data[field] === 'number' && Number.isFinite(data[field]) && data[field] >= 0) result[field] = data[field];
    }
    return result;
  } catch {
    return { status: 'connection_or_response_error', authenticated: false };
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] || 'check';
  if (!['check', 'status'].includes(mode) || process.argv.length > 3) {
    console.error('Usage: node up2data-account.mjs [status|check]; supply credentials through the environment, never arguments.');
    process.exitCode = 2;
  } else {
    const result = mode === 'status' ? { credential_available: !!process.env.UP2DATA_API_KEY?.trim() } : await checkAccount();
    console.log(JSON.stringify(result));
    if (mode === 'check' && !result.authenticated) process.exitCode = 1;
  }
}
