import { apiGet } from './client';

/** Real onramp/offramp min/max — `/api/public/ramp/limits`, the same route
 * frontend/apps/app's `useRampLimits` hook calls (via its own
 * `/api/core/ramp/limits` proxy). Only GHS/NGN are actually configured on
 * the backend today — same scope the reference app limits itself to. */
export type RampLimitsPayload = {
  currency: string;
  buy?: { minFiat: number; maxFiat: number };
  sell?: { minToken: number; maxToken: number };
};

export type RampLimitsCurrency = 'ghs' | 'ngn';

/** Client fallbacks if `/ramp/limits` is slow — same numbers as
 * frontend/apps/app's `RAMP_LIMIT_FALLBACKS` (kept in sync with Core's own
 * ramp-limits.ts there), so there's still a sane minimum to check against
 * before the network round trip finishes. */
export const RAMP_LIMIT_FALLBACKS: Record<RampLimitsCurrency, RampLimitsPayload> = {
  ghs: { currency: 'ghs', buy: { minFiat: 50, maxFiat: 2900 }, sell: { minToken: 3, maxToken: 7000 } },
  ngn: { currency: 'ngn', buy: { minFiat: 3000, maxFiat: 5_000_000 }, sell: { minToken: 3, maxToken: 7000 } },
};

export function fetchRampLimits(currency: RampLimitsCurrency): Promise<RampLimitsPayload> {
  return apiGet<RampLimitsPayload>('/api/public/ramp/limits', { currency, client_channel: 'browser' });
}
