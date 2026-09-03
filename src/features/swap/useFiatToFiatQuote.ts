import { useEffect, useState } from 'react';

import { getFiatQuoteViaUsd } from '../../api/fiatRates';

/**
 * Fiat<->fiat rate (e.g. GHS<->NGN, NGN<->BOB) via the USD-pivot table —
 * see `api/fiatRates.ts`. Unlike `useSwapQuote`, this only depends on the
 * currency pair, not the typed amount: the underlying table is a static
 * rate, not a priced/liquidity quote, so one fetch per pair is enough and
 * both directions (`from` typed or `to` typed) can be computed locally off
 * the same `rate` — there's no reverse-quote estimation dance to get wrong
 * here (see `SwapScreen.tsx`'s `lastRateRef` comment for the equivalent
 * problem on the crypto side, which this sidesteps entirely).
 *
 * This only gets quotes working — executing a real fiat<->fiat transfer is
 * a separate, not-yet-built rail (see `core`'s pesos<->GHS Stellar bridge
 * for the one fiat<->fiat corridor that IS wired end-to-end today, which
 * this deliberately does not touch).
 */
export function useFiatToFiatQuote(fromCurrency: string, toCurrency: string, enabled: boolean) {
  const [rate, setRate] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();

  useEffect(() => {
    if (!enabled || !from || !to) {
      setRate(0);
      setError(null);
      setLoading(false);
      return;
    }
    if (from === to) {
      setRate(1);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      getFiatQuoteViaUsd(from, to, 1)
        .then((quote) => {
          if (cancelled) return;
          setRate(quote.rate > 0 ? quote.rate : 0);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setRate(0);
          setError(err instanceof Error ? err.message : 'Could not get a rate for this pair.');
          setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, from, to]);

  return { rate, loading, error };
}
