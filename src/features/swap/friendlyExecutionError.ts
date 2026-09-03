import { sanitizeMessage } from '../../api/sanitizeApiError';

/** Maps a raw wallet/viem/network error to short, plain-English copy —
 * this is the one place in the swap-execution path that actually knows
 * what a viem or wallet error looks like, so nothing upstream (SwapScreen)
 * has to. Checked by error name/code first (works regardless of exact
 * wording or locale), then falls back to `sanitizeMessage`, which catches
 * anything else that still looks like a raw library dump (viem's own
 * `Details:`/`Version: viem@…` footers, JSON-RPC payloads, calldata) and
 * swaps it for a generic message instead of ever showing it. Our own
 * thrown messages in `useSwapExecution.web.ts` are already short and
 * plain, so they pass through `sanitizeMessage` unchanged — there's no
 * need to special-case them.
 *
 * Kept in its own module (no `@dynamic-labs/sdk-react-core` import) so it
 * can be unit-tested directly — that package reads `window.location` at
 * import time, which fails outside a real browser-like test environment. */
export function friendlyExecutionError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code: unknown }).code : undefined;
  const message = err instanceof Error ? err.message : String(err);

  if (code === 4001 || name === 'UserRejectedRequestError' || /user rejected|user denied/i.test(message)) {
    return 'You rejected the transaction.';
  }
  if (name === 'InsufficientFundsError' || /insufficient funds/i.test(message)) {
    return "You don't have enough to cover this, including network fees.";
  }
  if (name === 'ExecutionRevertedError' || /reverted/i.test(message)) {
    return "This transaction can't go through right now. Try again.";
  }
  return sanitizeMessage(message, 'Could not complete this swap. Please try again.');
}
