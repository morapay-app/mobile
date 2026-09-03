/**
 * Same leak patterns and precedence as frontend/apps/app's
 * `src/lib/public-api-errors.ts`: prefer the backend's raw `error` message
 * (it's the specific, useful one — "This token needs a slightly larger
 * buy. Try about 498 GHS.") over the generic `displayMessage`/`safeMessage`
 * boilerplate, but only once it's been checked against these patterns so
 * env/ops/catalog/provider internals never reach the UI verbatim.
 */

const ENV_LEAK_PATTERN = /BACKEND_API_URL|NEXT_PUBLIC_|CORE_URL|CORE_API_KEY|localhost:\d+|Set [A-Z_]+ to /i;

const OPS_LEAK_PATTERN =
  /settlement wallet is not configured|Provision ops wallets|pool destination|not configured\. Provision|Infisical|PlatformOpsWallet|quidax|DATABASE_URL/i;

const CATALOG_LEAK_PATTERN =
  /Unsupported token pair|SupportedToken|Use a symbol from|from chain \d+|to chain \d+|not found \(from chain|token list not available|Invalid swap rate|EXCHANGERATE_API_KEY|Fiat pivot unavailable/i;

const PROVIDER_LEAK_PATTERN =
  /allbridge|squid|lifi|\b0x supports|does not list|stables only|no routes found|no provider returned|no executable swap|request failed with status|timed out after \d+ms|\bsquid:|\blifi:|\ballbridge:/i;

// Not tied to any specific vendor/env name (the patterns above already
// cover those) — this catches the *shape* of a technical message instead:
// API paths, raw HTTP status text, JS error class names, network error
// codes, stack/parse-error fragments, and viem's own standard error-report
// sections (`Details:`, `Version: viem@…`, `Request Arguments:`, `Docs:`,
// `Contract Call:` — every raw viem/wallet error carries at least one of
// these, so this line alone is what keeps an unmapped wallet error's full
// dump — JSON-RPC payloads, calldata, gas values included — off the
// screen, on top of the specific rejection/insufficient-funds/reverted
// cases useSwapExecution.web.ts already recognizes by name). This is what
// stops something like a raw `/api/public/quotes failed (500)` fallback,
// or an unrelated `TypeError: Cannot read properties of undefined`, from
// ever reaching a user even if it doesn't happen to mention a known vendor
// name.
const GENERIC_TECHNICAL_PATTERN =
  /\/api\/|https?:\/\/|\bfailed \(\d+\)|\b[A-Z][a-zA-Z]*Error\b|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|internal server error|bad gateway|gateway timeout|cannot read propert|unexpected token|stack trace|version: viem@|\bdetails:|request arguments:|\bdocs:|contract call:/i;

function looksLikeInternalLeak(message: string): boolean {
  return (
    ENV_LEAK_PATTERN.test(message) ||
    OPS_LEAK_PATTERN.test(message) ||
    CATALOG_LEAK_PATTERN.test(message) ||
    PROVIDER_LEAK_PATTERN.test(message) ||
    GENERIC_TECHNICAL_PATTERN.test(message)
  );
}

/** Same leak check as `pickApiErrorMessage`, exposed directly for strings
 * that don't come wrapped in a `{error, displayMessage, ...}` envelope —
 * e.g. a ramp transaction's own `errorMessage` field, which is real data
 * in an otherwise-successful response, not something that ever passes
 * through `client.ts`'s error-response handling at all. */
export function sanitizeMessage(raw: string | null | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  if (trimmed && !looksLikeInternalLeak(trimmed)) return trimmed;
  return fallback;
}

/** Picks the best user-facing message from a backend error envelope —
 * `error` when it's safe to show, falling back to `displayMessage`/
 * `safeMessage`, then a generic message. */
export function pickApiErrorMessage(body: Record<string, unknown> | null, fallback: string): string {
  const rawError = typeof body?.error === 'string' ? body.error.trim() : '';
  if (rawError && !looksLikeInternalLeak(rawError)) return rawError;

  const displayMessage = typeof body?.displayMessage === 'string' ? body.displayMessage.trim() : '';
  if (displayMessage) return displayMessage;

  const safeMessage = typeof body?.safeMessage === 'string' ? body.safeMessage.trim() : '';
  if (safeMessage) return safeMessage;

  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (message && !looksLikeInternalLeak(message)) return message;

  return fallback;
}
