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
  const requestId = useRef(0);
  // Tracks which pair `quote` currently belongs to, so a same-pair request
  // that fails (e.g. "amount too low/high") can leave the last GOOD quote
  // in place — see the comment in the catch handler below for why.
  const quotePairRef = useRef<string | null>(null);

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
  }, [eligible, action, fromToken.id, fromToken.symbol, toToken.id, toToken.symbol, cryptoChainId, amount, inputSide]);

  return { quote, loading, error };
}
