import { useEffect, useState } from 'react';

import { fetchRampLimits, RAMP_LIMIT_FALLBACKS, type RampLimitsCurrency, type RampLimitsPayload } from '../../api/rampLimits';

const SUPPORTED: ReadonlySet<string> = new Set(['ghs', 'ngn']);

/** Real onramp/offramp min/max for a fiat currency — same source and
 * fallback-then-refresh pattern as frontend/apps/app's `useRampLimits`.
 * `null` while unsupported (any fiat besides GHS/NGN — the only two the
 * backend actually has limits configured for) or before anything's loaded. */
export function useRampLimits(currency: string | null): RampLimitsPayload | null {
  const key = currency?.trim().toLowerCase() ?? null;
  const supported = key != null && SUPPORTED.has(key);
  const [limits, setLimits] = useState<RampLimitsPayload | null>(supported ? RAMP_LIMIT_FALLBACKS[key as RampLimitsCurrency] : null);

  useEffect(() => {
    if (!supported || !key) {
      setLimits(null);
      return;
    }
    let cancelled = false;
    setLimits(RAMP_LIMIT_FALLBACKS[key as RampLimitsCurrency]);
    fetchRampLimits(key as RampLimitsCurrency)
      .then((data) => {
        if (!cancelled) setLimits(data);
      })
      .catch(() => {
        // Keep the fallback already set — same behavior as the real app.
      });
    return () => {
      cancelled = true;
    };
  }, [key, supported]);

  return limits;
}

/** Matches frontend/apps/app's `rampAmountBelowMin` exactly — same message
 * copy ("Minimum buy is 50 GHS."), same min/max checks either direction. */
export function rampAmountBelowMin(
  amountMajor: number,
  limits: RampLimitsPayload | null,
  mode: 'onramp' | 'offramp',
  tokenSymbol = 'USDC',
): string | null {
  if (!limits || !Number.isFinite(amountMajor) || amountMajor <= 0) return null;
  const currency = (limits.currency || '').toUpperCase() || 'GHS';
  const token = tokenSymbol.trim().toUpperCase() || 'USDC';
  if (mode === 'onramp' && limits.buy?.minFiat != null && amountMajor < limits.buy.minFiat) {
    return `Minimum buy is ${limits.buy.minFiat.toLocaleString()} ${currency}.`;
  }
  if (mode === 'onramp' && limits.buy?.maxFiat != null && amountMajor > limits.buy.maxFiat) {
    return `Maximum buy is ${limits.buy.maxFiat.toLocaleString()} ${currency}.`;
  }
  if (mode === 'offramp' && limits.sell?.minToken != null && amountMajor < limits.sell.minToken) {
    return `Minimum sell is ${limits.sell.minToken} ${token}.`;
  }
  if (mode === 'offramp' && limits.sell?.maxToken != null && amountMajor > limits.sell.maxToken) {
    return `Maximum sell is ${limits.sell.maxToken.toLocaleString()} ${token}.`;
  }
  return null;
}
