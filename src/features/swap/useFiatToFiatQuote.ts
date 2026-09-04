import { useEffect, useState } from 'react';

import { getFiatQuoteViaUsd } from '../../api/fiatRates';

// The USD-pivot table has no real `expiresAt`/validity window the way a
// real swap quote does (see api/fiatRates.ts's own doc — it's a static FX
// table, not a priced/liquidity quote), so this is a client-chosen refresh
// cadence, not a server-enforced one. Matches useSwapQuote's own real
// QUOTE_VALIDITY_SECONDS purely for a consistent countdown/refresh feel
// across both quote types, not because this rate is provably stale after
// exactly 30s.
const REFRESH_INTERVAL_MS = 30_000;

/**
 * Fiat<->fiat rate (e.g. GHS<->NGN, NGN<->BOB) via the USD-pivot table —
 * see `api/fiatRates.ts`. Unlike `useSwapQuote`, this only depends on the
 * currency pair, not the typed amount: the underlying table is a static
 * rate, not a priced/liquidity quote, so one fetch per pair is enough and
 * both directions (`from` typed or `to` typed) can be computed locally off
 * the same `rate` — there's no reverse-quote estimation dance to get wrong
 * here (see `SwapScreen.tsx`'s `lastRateRef` comment for the equivalent
 * problem on the crypto side, which this sidesteps entirely). Typing a new
 * amount never triggers a fetch — only the pair changing, or the periodic
 * refresh below, does.
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
  // Whole seconds until the next periodic refresh — purely a UI countdown
  // (see REFRESH_INTERVAL_MS's own doc for why there's no real expiry to
  // measure against). `null` whenever there's no live rate to count down.
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState<number | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshNonce is a plain re-fetch trigger, not a real input
  }, [enabled, from, to, refreshNonce]);

  // Periodic refresh + its own countdown — decoupled from the fetch effect
  // above so bumping `refreshNonce` here is a plain dependency change to
  // it, the same way useSwapQuote's own refresh cycle works. Resets
  // whenever the pair changes (new `from`/`to`), not on every render.
  useEffect(() => {
    if (!enabled || !from || !to || from === to) {
      setSecondsUntilRefresh(null);
      return;
    }
    let remaining = REFRESH_INTERVAL_MS;
    setSecondsUntilRefresh(Math.round(remaining / 1000));
    const tick = setInterval(() => {
      remaining -= 1000;
      if (remaining <= 0) {
        setRefreshNonce((n) => n + 1);
        remaining = REFRESH_INTERVAL_MS;
      }
      setSecondsUntilRefresh(Math.round(remaining / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [enabled, from, to]);

  return { rate, loading, error, secondsUntilRefresh };
}
