import { useEffect, useRef, useState } from 'react';

import { fetchSwapQuote, type QuoteAction, type SwapQuoteResponse } from '../../api/quotes';
import type { SwapToken } from './data/tokens';

export type UseSwapQuoteParams = {
  fromToken: SwapToken;
  toToken: SwapToken;
  /** The amount actually typed — in whichever token `inputSide` names, not
   * always fromToken. */
  amount: number;
  /** Which side `amount` describes. Confirmed live: the backend only
   * supports `'to'` for SWAP (crypto<->crypto) — ONRAMP rejects it outright
   * ("not supported for hub-swap onramp targets yet"), and OFFRAMP accepts
   * it but truncates the computed crypto side to 2 decimals (e.g. a real
   * 0.0038 ETH comes back as "0.00"), which is worse than not answering at
   * all. Callers should only ever pass `'to'` for a SWAP pair. */
  inputSide: 'from' | 'to';
};

// Same debounce the real checkout app's useTransferQuote uses — re-fetch on
// input/selection change, not on an interval.
const DEBOUNCE_MS = 400;

// Same idea as the real checkout app's useTransferQuote (`staleTime` via
// react-query) — reusing an already-fetched quote for the exact same
// request instead of hitting the network again every time an amount comes
// back around (retyping a previous digit, toggling between quick-amount
// pills, etc.). Kept comfortably under the real ~30s validity window (see
// REFRESH_LEAD_MS's own doc) so a cache hit is never an already-expired
// quote. Module-level (not per-hook-instance) so it survives a re-render
// or even a remount the same way react-query's cache does — the whole
// point is "don't ask the backend something it already told us."
const QUOTE_CACHE_TTL_MS = 20_000;
type QuoteCacheEntry = { result: SwapQuoteResponse; fetchedAt: number };
const quoteCache = new Map<string, QuoteCacheEntry>();

/** Test-only escape hatch — this cache is module-level (deliberately, see
 * its own doc), so without this a quote cached by one test leaks into the
 * next one that happens to ask the same pair/amount. Not meant for use
 * outside tests. */
export function __clearQuoteCacheForTests(): void {
  quoteCache.clear();
}

function quoteCacheKey(params: {
  action: QuoteAction;
  inputAmount: string;
  inputCurrency: string;
  outputCurrency: string;
  chain: string;
  toChain?: string;
  inputSide: 'from' | 'to';
}): string {
  return [
    params.action,
    params.inputAmount,
    params.inputCurrency,
    params.outputCurrency,
    params.chain,
    params.toChain ?? '',
    params.inputSide,
  ].join('|');
}

// A quote's real, server-set validity window — `QUOTE_VALIDITY_SECONDS` in
// core/src/services/public-quote.service.ts, confirmed live at 30s and
// echoed back verbatim as `expiresAt` on every quote response (SwapToken's
// own `SwapQuoteResponse` type already carried this field; nothing read it
// until now). Refreshing is driven off that real timestamp, not a locally
// guessed 30s timer — correct even if the debounce, network latency, or a
// slow device pushes the actual quote-received time later than expected.
const REFRESH_LEAD_MS = 5000;

/** SWAP (both crypto), ONRAMP (fiat -> crypto), OFFRAMP (crypto -> fiat) —
 * mirrors the mode detection in frontend/apps/app/src/hooks/useTransferQuote.ts.
 * Fiat -> fiat has no rail and never fires a quote. */
function actionFor(fromToken: SwapToken, toToken: SwapToken): QuoteAction | null {
  if (fromToken.type === 'crypto' && toToken.type === 'crypto') return 'SWAP';
  if (fromToken.type === 'crypto' && toToken.type === 'fiat') return 'OFFRAMP';
  if (fromToken.type === 'fiat' && toToken.type === 'crypto') return 'ONRAMP';
  return null;
}

/**
 * Real quote from `/api/public/quotes` — the same unified endpoint and
 * `action` field the real app (frontend/apps/app) uses for swap, onramp, and
 * offramp alike, backed by morapay's own pricing engine (Quidax for the
 * fiat leg, confirmed live). Callers should fall back to their own estimate
 * while `quote` is null (loading, ineligible, or the request failed).
 */
export function useSwapQuote({ fromToken, toToken, amount, inputSide }: UseSwapQuoteParams) {
  const [quote, setQuote] = useState<SwapQuoteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whole seconds until `quote.expiresAt`, ticking down once a second — for
  // a caller that wants to show a live countdown next to the rate. `null`
  // whenever there's no live quote to count down at all.
  const [secondsUntilExpiry, setSecondsUntilExpiry] = useState<number | null>(null);
  const requestId = useRef(0);
  // Tracks which pair `quote` currently belongs to, so a same-pair request
  // that fails (e.g. "amount too low/high") can leave the last GOOD quote
  // in place — see the comment in the catch handler below for why.
  const quotePairRef = useRef<string | null>(null);
  // Bumped to force a re-fetch of the SAME pair/amount — the countdown
  // effect below is the only thing that ever does this (approaching the
  // real quote's own expiry), but it's a plain dependency, not a special
  // case: the main fetch effect below can't tell "the pair changed" from
  // "someone asked for a fresh one" apart, and doesn't need to.
  const [refreshNonce, setRefreshNonce] = useState(0);
  // Mirrors `loading` for the countdown effect below to read without
  // depending on it directly (that would tear down and rebuild the
  // countdown's own interval/timers on every loading flicker) — see the
  // recovery-retry logic's own doc for why this matters: it's what stops a
  // retry from firing while the previous one is still in flight.
  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  // A refresh-triggered run must always hit the network — reusing the
  // cache here would very likely just re-serve the SAME quote that's
  // expiring in the next few seconds, defeating the entire point of
  // refreshing early. Compared against on every run so a refresh is only
  // ever "this run's refreshNonce differs from last run's", not a value
  // read once.
  const prevRefreshNonceRef = useRef(refreshNonce);

  const action = actionFor(fromToken, toToken);
  const cryptoChainId = fromToken.type === 'crypto' ? fromToken.chainId : toToken.chainId;
  const eligible = action !== null && amount > 0 && Boolean(cryptoChainId);

  useEffect(() => {
    const pairKey = `${fromToken.id}:${toToken.id}`;
    const pairChanged = quotePairRef.current !== pairKey;
    quotePairRef.current = pairKey;

    if (!eligible || !action) {
      requestId.current += 1;
      setQuote(null);
      setError(null);
      setLoading(false);
      return;
    }

    // A genuinely different pair has no business showing the old pair's
    // rate while its own first quote is in flight.
    if (pairChanged) setQuote(null);

    const isRefreshTriggered = prevRefreshNonceRef.current !== refreshNonce;
    prevRefreshNonceRef.current = refreshNonce;

    const requestParams = {
      action,
      inputAmount: amount.toString(),
      inputCurrency: fromToken.symbol,
      outputCurrency: toToken.symbol,
      // The fiat side has no chain — always key `chain` off whichever
      // side is actually crypto, and only pass `toChain` for a real
      // crypto<->crypto bridge.
      chain: cryptoChainId,
      toChain: action === 'SWAP' ? toToken.chainId : undefined,
      inputSide,
    };

    // Reuse an already-fetched quote for this exact request instead of
    // hitting the network again — the previous behavior re-fetched on
    // every single amount change, even one already seen seconds ago
    // (retyping a digit, bouncing between quick-amount pills), which both
    // wastes calls against a backend that already takes 6-14s per quote
    // and piles up overlapping in-flight requests. See QUOTE_CACHE_TTL_MS's
    // own doc for why a refresh-triggered run always skips this.
    if (!isRefreshTriggered) {
      const cached = quoteCache.get(quoteCacheKey(requestParams));
      if (cached && Date.now() - cached.fetchedAt < QUOTE_CACHE_TTL_MS) {
        requestId.current += 1; // invalidate any fetch still in flight for a different amount
        setQuote(cached.result);
        setError(null);
        setLoading(false);
        return;
      }
    }

    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchSwapQuote(requestParams)
        .then((result) => {
          // Cached even for a superseded request (the user already moved
          // on to a different amount before this one resolved) — the fetch
          // itself is still real, and against a backend that takes 6-14s
          // per quote, throwing away a completed answer just because it
          // arrived "late" relative to the current UI state means it can
          // never end up cached at all, defeating this cache's whole
          // purpose for exactly the amounts most likely to get revisited
          // (the ones a user paused on before moving away from).
          quoteCache.set(quoteCacheKey(requestParams), { result, fetchedAt: Date.now() });
          if (requestId.current !== id) return;
          setQuote(result);
          setError(null);
        })
        .catch((err) => {
          if (requestId.current !== id) return;
          // Deliberately NOT clearing `quote` here. A validation error for
          // the amount just typed (below the minimum, above a liquidity
          // cap, etc.) doesn't mean the pair's last good rate stopped being
          // real — clearing it made every derived amount collapse to zero
          // and silently block typing into the "to" field or USD unit
          // (both only convert through a live, non-zero rate). The error
          // itself is still surfaced via `error` for the caller to show.
          setError(err instanceof Error ? err.message : "We couldn't get a rate. Try again.");
        })
        .finally(() => {
          if (requestId.current === id) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [eligible, action, fromToken.id, fromToken.symbol, toToken.id, toToken.symbol, cryptoChainId, amount, inputSide, refreshNonce]);

  // Countdown + auto-refresh, both driven off the real `expiresAt` the
  // quote itself carries — not a locally-guessed 30s timer, so this stays
  // correct even if the debounce or a slow network pushed the actual
  // quote-received moment later than expected. Refreshing happens
  // `REFRESH_LEAD_MS` before the real expiry (matching "approaching 30s, or
  // 25s, request a new one" rather than waiting for the old one to go
  // stale first) by bumping `refreshNonce`, which the fetch effect above
  // treats exactly like any other dependency change — same debounce, same
  // "keep the last good quote visible while `loading`" behavior, so this
  // is what gives the caller its skeleton-over-the-rate refresh for free.
  useEffect(() => {
    if (!quote?.expiresAt) {
      setSecondsUntilExpiry(null);
      return;
    }
    const expiresAtMs = new Date(quote.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      setSecondsUntilExpiry(null);
      return;
    }

    // How often the fallback below may re-nudge `refreshNonce` while stuck
    // on a dead quote. Without a floor here, `tick` would call it on every
    // single 1s interval tick once past the -3000ms mark — since a FAILED
    // refresh never changes `quote.expiresAt`, this effect never re-runs to
    // reset that state, so nothing stopped it from re-firing every second
    // forever. Against a slow backend (real quotes here can take 6-12s)
    // that turned into an ever-growing pile of overlapping in-flight
    // requests, each superseding the last before it could land — the exact
    // "quote never updates" symptom this was meant to prevent, not fix.
    const RECOVERY_RETRY_FLOOR_MS = 5000;
    // Real incident: a pair the backend genuinely can't route (BOB -> USDC
    // on Base) kept failing every retry forever — with no cap, that meant
    // one real request every RECOVERY_RETRY_FLOOR_MS, indefinitely, for as
    // long as the screen stayed open. This is the hard stop: after this
    // many failed attempts, give up automatically. The user's own next real
    // action (retyping the amount, switching pairs) is what starts a fresh
    // attempt — this hook has no way to distinguish "transient blip" from
    // "this pair will never work," so it doesn't try to guess past a
    // reasonable number of tries.
    const MAX_RECOVERY_ATTEMPTS = 5;
    let nextRecoveryAttemptMs = expiresAtMs;
    let recoveryAttempts = 0;

    const tick = () => {
      const now = Date.now();
      const remainingMs = expiresAtMs - now;
      setSecondsUntilExpiry(Math.max(0, Math.round(remainingMs / 1000)));
      // The scheduled refresh below should have landed a fresh quote (a new
      // `expiresAt`, re-running this effect) well before this point — if
      // it hasn't, the last attempt was lost (a transient failure, or the
      // app was backgrounded through it) rather than left permanently
      // stuck on a dead quote. Never fires while a fetch (this retry or any
      // other) is already in flight — a fixed 5s cadence with no such guard
      // is exactly what let failed/slow attempts pile up concurrently
      // during the BOB/USDC incident instead of staying one at a time.
      if (
        remainingMs <= -3000 &&
        now >= nextRecoveryAttemptMs &&
        !loadingRef.current &&
        recoveryAttempts < MAX_RECOVERY_ATTEMPTS
      ) {
        recoveryAttempts += 1;
        nextRecoveryAttemptMs = now + RECOVERY_RETRY_FLOOR_MS;
        setRefreshNonce((n) => n + 1);
      }
    };
    tick();
    const secondsInterval = setInterval(tick, 1000);

    // Clamped, not just floored at 0 — a real quote is only ever valid for
    // ~30s, so a `expiresAt` further out than a minute is already not worth
    // trusting blindly (a backend bug, bad clock, or a stale/placeholder
    // value), and an unclamped one large enough overflows `setTimeout`'s
    // 32-bit delay outright (Node/browsers silently fire it almost
    // immediately instead — confusing, not a real safeguard).
    const MAX_REFRESH_DELAY_MS = 60_000;
    const refreshDelayMs = Math.min(MAX_REFRESH_DELAY_MS, Math.max(0, expiresAtMs - REFRESH_LEAD_MS - Date.now()));
    // Also skipped if something's already in flight — this is a one-shot
    // timer (not a recurring interval like the recovery retry above), but
    // there's no reason to let it queue a second concurrent request either
    // if the regular debounced fetch from a keystroke just happened to
    // still be running at this exact moment.
    const refreshTimer = setTimeout(() => {
      if (!loadingRef.current) setRefreshNonce((n) => n + 1);
    }, refreshDelayMs);

    return () => {
      clearInterval(secondsInterval);
      clearTimeout(refreshTimer);
    };
  }, [quote?.expiresAt]);

  return { quote, loading, error, secondsUntilExpiry };
}
