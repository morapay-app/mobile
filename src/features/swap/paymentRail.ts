import type { SwapToken } from './data/tokens';

/**
 * The real settlement rail for a given asset — this is what makes "how do
 * you want to receive"/"how are you paying" driven by the actual token
 * type/currency instead of hardcoded per-direction assumptions. A crypto
 * token always settles on-chain (the connected/typed wallet address); a
 * fiat token settles over whichever rail is real for that currency today.
 *
 * The fiat rails below are not a user choice, and not a speculative
 * multi-country matrix — confirmed directly against the backend:
 * `RampFiatCode` in core/src/lib/ramp/ramp-limits.ts is exactly
 * `'ngn' | 'ghs'`, nothing else is a real ramp currency (KES/ZAR/etc.
 * only exist as *commerce invoice* currencies, an unrelated subsystem).
 * The rail per currency is hardcoded on the backend too: GHS always
 * collects/pays out over mobile money (Quidax push, Moolre USSD fallback
 * — core/src/services/quidax-ramp.service.ts), NGN always collects/pays
 * out over a real bank account (a provider-issued deposit account for
 * onramp, a real bank + account number for offramp). There is no NGN
 * mobile-money path and no GHS bank-transfer path anywhere in the real
 * system. Adding a currency the backend actually supports later is one
 * line in `FIAT_RAILS`, not a new scattered set of conditionals.
 */
export type PaymentRailMethod = 'momo' | 'bank' | 'crypto';
export type RampCurrency = 'GHS' | 'NGN';

export type FiatPaymentRail = {
  assetType: 'fiat';
  currency: RampCurrency;
  method: 'momo' | 'bank';
};

export type CryptoPaymentRail = {
  assetType: 'crypto';
  method: 'crypto';
};

export type PaymentRail = FiatPaymentRail | CryptoPaymentRail;

const FIAT_RAILS: Record<RampCurrency, FiatPaymentRail> = {
  GHS: { assetType: 'fiat', currency: 'GHS', method: 'momo' },
  NGN: { assetType: 'fiat', currency: 'NGN', method: 'bank' },
};

/** `null` for a fiat currency that isn't a real ramp currency today (e.g.
 * KES) — callers should treat that as "not supported yet," not guess at a
 * rail. Crypto never returns `null`: every crypto leg already has a real,
 * working settlement path (the connected wallet), regardless of chain. */
export function getPaymentRail(token: Pick<SwapToken, 'type' | 'symbol'>): PaymentRail | null {
  if (token.type === 'crypto') return { assetType: 'crypto', method: 'crypto' };
  const key = token.symbol.trim().toUpperCase();
  return key === 'GHS' || key === 'NGN' ? FIAT_RAILS[key] : null;
}
