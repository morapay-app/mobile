import { act, renderHook } from '@testing-library/react-native';

import { useFiatToFiatQuote } from '../useFiatToFiatQuote';

const mockGetFiatQuoteViaUsd = jest.fn();
jest.mock('../../../api/fiatRates', () => ({
  getFiatQuoteViaUsd: (...args: unknown[]) => mockGetFiatQuoteViaUsd(...args),
}));

beforeEach(() => {
  mockGetFiatQuoteViaUsd.mockReset();
});

async function waitForFetch() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
}

describe('useFiatToFiatQuote', () => {
  it('fetches once per currency pair, not per amount — the caller multiplies locally', async () => {
    // GHS -> NGN never re-fetches just because the typed amount changes;
    // this rate is a static FX table lookup, not a priced quote, so the
    // caller (SwapScreen) computes every derived amount off the same
    // resolved rate instead of asking the backend again per keystroke.
    mockGetFiatQuoteViaUsd.mockResolvedValue({ amount: 5000, rate: 5000, from: 'GHS', to: 'NGN' });

    const { result, rerender } = await renderHook(
      ({ enabled }: { enabled: boolean }) => useFiatToFiatQuote('GHS', 'NGN', enabled),
      { initialProps: { enabled: true } },
    );
    await waitForFetch();
    expect(result.current.rate).toBe(5000);
    expect(mockGetFiatQuoteViaUsd).toHaveBeenCalledTimes(1);

    // Re-rendering with the same enabled/pair (standing in for "the user
    // typed a new amount," which this hook never even takes as a param)
    // does not trigger a second fetch.
    await rerender({ enabled: true });
    expect(mockGetFiatQuoteViaUsd).toHaveBeenCalledTimes(1);
  });

  it('counts down toward its own refresh cadence', async () => {
    // Real timers (this codebase's own established convention for this
    // class of effect — see useSwapQuote.test.ts's own doc: fake timers
    // combined with an effect-driven setInterval/setState turned out
    // unreliable here). A short ~3s real wait is enough to prove the
    // countdown actually ticks, without waiting out the full 30s cycle.
    mockGetFiatQuoteViaUsd.mockResolvedValue({ amount: 5000, rate: 5000, from: 'GHS', to: 'NGN' });

    const { result, unmount } = await renderHook(() => useFiatToFiatQuote('GHS', 'NGN', true));
    try {
      await waitForFetch();
      expect(result.current.secondsUntilRefresh).toBe(30);

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      });
      expect(result.current.secondsUntilRefresh as number).toBeLessThanOrEqual(27);
      expect(result.current.secondsUntilRefresh as number).toBeGreaterThan(20);
      expect(mockGetFiatQuoteViaUsd).toHaveBeenCalledTimes(1); // no early refetch
    } finally {
      unmount();
    }
  });

  it('refetches once the refresh cadence actually elapses', async () => {
    // Real timers, waited in short steps rather than one long span — a
    // single long `act(async () => { await sleep(30_500) })` turned out
    // unreliable here (same lesson useSwapQuote.test.ts's own doc
    // documents: React doesn't necessarily flush effects/interval-driven
    // state scheduled mid-span until the next `act` boundary).
    mockGetFiatQuoteViaUsd.mockResolvedValue({ amount: 5000, rate: 5000, from: 'GHS', to: 'NGN' });

    const { result, unmount } = await renderHook(() => useFiatToFiatQuote('GHS', 'NGN', true));
    try {
      await waitForFetch();
      expect(mockGetFiatQuoteViaUsd).toHaveBeenCalledTimes(1);

      for (let i = 0; i < 62; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
        });
      }

      expect(mockGetFiatQuoteViaUsd).toHaveBeenCalledTimes(2);
      // Countdown restarted — 29 or 30 depending on real-clock tick jitter
      // relative to the loop above, not a meaningful distinction.
      expect(result.current.secondsUntilRefresh as number).toBeGreaterThanOrEqual(29);
    } finally {
      unmount();
    }
  }, 40000);

  it('hides the countdown and skips fetching entirely when disabled or the pair is a no-op', async () => {
    const { result: disabledResult } = await renderHook(() => useFiatToFiatQuote('GHS', 'NGN', false));
    expect(disabledResult.current.secondsUntilRefresh).toBeNull();
    expect(mockGetFiatQuoteViaUsd).not.toHaveBeenCalled();

    const { result: sameCurrencyResult } = await renderHook(() => useFiatToFiatQuote('GHS', 'GHS', true));
    expect(sameCurrencyResult.current.rate).toBe(1);
    expect(sameCurrencyResult.current.secondsUntilRefresh).toBeNull();
    expect(mockGetFiatQuoteViaUsd).not.toHaveBeenCalled();
  });
});
