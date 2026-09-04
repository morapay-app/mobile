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

    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchSwapQuote({
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
      })
        .then((result) => {
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
    let nextRecoveryAttemptMs = expiresAtMs;

    const tick = () => {
      const now = Date.now();
      const remainingMs = expiresAtMs - now;
      setSecondsUntilExpiry(Math.max(0, Math.round(remainingMs / 1000)));
      // The scheduled refresh below should have landed a fresh quote (a new
      // `expiresAt`, re-running this effect) well before this point — if
      // it hasn't, the last attempt was lost (a transient failure, or the
      // app was backgrounded through it) rather than left permanently
      // stuck on a dead quote.
      if (remainingMs <= -3000 && now >= nextRecoveryAttemptMs) {
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
    const refreshTimer = setTimeout(() => setRefreshNonce((n) => n + 1), refreshDelayMs);

    return () => {
      clearInterval(secondsInterval);
      clearTimeout(refreshTimer);
    };
  }, [quote?.expiresAt]);

  return { quote, loading, error, secondsUntilExpiry };
}
