import { apiPost } from './client';

export type FiatViaUsdQuote = {
  /** Converted amount, in `to`'s currency. */
  amount: number;
  /** `amount / requestAmount` — a plain FX rate, independent of the amount
   * requested (the USD-pivot table underneath is a static rate table, not a
   * priced/liquidity quote), so this is safe to reuse for either direction
   * of the same pair rather than re-fetching per keystroke. */
  rate: number;
  from: string;
  to: string;
};

/** Fiat<->fiat conversion via a USD pivot (e.g. GHS -> USD -> NGN) — the same
 * table `core`'s commerce Paystack payer-fiat validation uses, exposed
 * publicly at `/api/public/rates/fiat/via-usd` (backend proxies straight to
 * Core's `/api/rates/fiat/via-usd`, confirmed live, no auth required). This
 * is a genuinely different rail from `/api/public/quotes` (SWAP/ONRAMP/
 * OFFRAMP) — there is no fiat<->fiat action on that endpoint; a currency
 * pair with no live corridor between them (e.g. GHS<->NGN) still gets a
 * real, if approximate, rate here. */
export function getFiatQuoteViaUsd(from: string, to: string, amount: number): Promise<FiatViaUsdQuote> {
  return apiPost<FiatViaUsdQuote>('/api/public/rates/fiat/via-usd', { from, to, amount });
}
