import { act, renderHook } from '@testing-library/react-native';

import { useSwapQuote } from '../useSwapQuote';
import { DEFAULT_FROM_TOKEN, DEFAULT_TO_TOKEN, GHS_MOMO_TOKEN } from '../data/tokens';

const mockFetchSwapQuote = jest.fn();
jest.mock('../../../api/quotes', () => ({
  fetchSwapQuote: (...args: unknown[]) => mockFetchSwapQuote(...args),
}));

const ETH = DEFAULT_FROM_TOKEN;
const USDC = DEFAULT_TO_TOKEN;
const GHS = GHS_MOMO_TOKEN;

const GOOD_QUOTE = {
  quoteId: 'q1',
  // A real quote's own actual validity window (~30s, see useSwapQuote.ts's
  // own doc) — not a far-future placeholder. This hook now schedules a real
  // background refresh off this timestamp, so it has to be realistic rather
  // than something that'd schedule 70+ years out (harmless — clamped — but
  // not what a real quote ever sends).
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
  exchangeRate: '2400',
  input: { amount: '1', currency: 'ETH', chain: '1' },
  output: { amount: '2400', currency: 'USDC', chain: '1' },
  fees: { networkFee: '0', platformFee: '0', totalFee: '0' },
};

const BAD_AMOUNT = 999999;

// Real timers here rather than jest's fake ones — the debounce plus a
// couple of promise rejections/resolutions interacting with React's act()
// batching across re-renders turned out fragile under fake-timer
// advancement in this RTL/React version; a real ~400ms debounce wait per
// step is cheap enough and far more reliable for what this test actually
// needs to prove.
async function waitForDebounce() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });
}

type Props = { toToken: typeof USDC | typeof GHS; amount: number };

describe('useSwapQuote', () => {
  it('keeps a same-pair error from wiping the last good quote, but clears it the moment the pair itself changes', async () => {
    // Keyed on the request itself rather than call order, so this doesn't
    // depend on exactly how many times React happens to invoke the effect.
    mockFetchSwapQuote.mockImplementation(({ inputAmount, outputCurrency }) => {
      if (outputCurrency === 'GHS') return new Promise(() => {}); // never resolves
      if (inputAmount === String(BAD_AMOUNT)) return Promise.reject(new Error('Minimum sell amount is 50 GHS'));
      return Promise.resolve(GOOD_QUOTE);
    });

    const { result, rerender } = await renderHook(
      ({ toToken, amount }: Props) => useSwapQuote({ fromToken: ETH, toToken, amount, inputSide: 'from' }),
      { initialProps: { toToken: USDC, amount: 1 } },
    );

    await waitForDebounce();
    expect(result.current.quote?.exchangeRate).toBe('2400');

    // Same pair, a bad amount — the backend rejects it, but the rate that
    // was already resolved for this pair is still real and shouldn't
    // disappear just because the latest request failed.
    await rerender({ toToken: USDC, amount: BAD_AMOUNT });
    await waitForDebounce();
    expect(result.current.error).toBe('Minimum sell amount is 50 GHS');
    expect(result.current.quote?.exchangeRate).toBe('2400');

    // A genuinely different pair (ETH -> GHS is offramp, not this same
    // ETH -> USDC swap) has no business showing over ETH -> USDC's rate
    // while its own quote is still in flight.
    await rerender({ toToken: GHS, amount: 1 });
    expect(result.current.quote).toBeNull();
  });

  it('counts down from the real expiresAt once a quote lands', async () => {
    mockFetchSwapQuote.mockResolvedValue(GOOD_QUOTE);

    const { result, unmount } = await renderHook(() => useSwapQuote({ fromToken: ETH, toToken: USDC, amount: 1, inputSide: 'from' }));
    try {
      expect(result.current.secondsUntilExpiry).toBeNull(); // nothing landed yet
      await waitForDebounce();

      // GOOD_QUOTE expires 30s from whenever it was constructed (module
      // load time) — some of that's already elapsed by now, but it should
      // still read as a real, close-to-30 countdown, not null/0/something
      // wildly off (e.g. the 70-year placeholder this used to be would
      // report ~2.2 billion).
      expect(result.current.secondsUntilExpiry).not.toBeNull();
      expect(result.current.secondsUntilExpiry as number).toBeGreaterThan(20);
      expect(result.current.secondsUntilExpiry as number).toBeLessThanOrEqual(30);
    } finally {
      unmount();
    }
  });

  it('backs off instead of retrying every second when refresh keeps failing', async () => {
    // Regression for a real bug: the recovery nudge fired on every 1s tick
    // once a quote was 3s past its own expiry, with nothing to stop it once
    // a failed retry left `expiresAt` unchanged (see useSwapQuote.ts's own
    // comment on `RECOVERY_RETRY_FLOOR_MS`) — against a slow real backend
    // this piled up overlapping in-flight requests and the quote never
    // visibly updated, which is exactly what a user reported as "quote
    // doesn't refresh." Real timers (this file's own established
    // convention, see `waitForDebounce`'s doc) rather than fake ones. A
    // single long `act(async () => { await sleep(9000) })` turned out
    // unreliable here — React doesn't necessarily flush effects scheduled
    // mid-span until the next `act` boundary — so this waits in the same
    // short steps `waitForDebounce` already uses, chained until the window
    // is covered.
    let callCount = 0;
    mockFetchSwapQuote.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        // Expires almost immediately — puts both the primary scheduled
        // refresh and the -3000ms fallback within a short, real-time-testable
        // window instead of the real ~30s one.
        return Promise.resolve({ ...GOOD_QUOTE, expiresAt: new Date(Date.now() + 2000).toISOString() });
      }
      return Promise.reject(new Error('backend is down'));
    });

    const { unmount } = await renderHook(() => useSwapQuote({ fromToken: ETH, toToken: USDC, amount: 1, inputSide: 'from' }));
    try {
      await waitForDebounce(); // lands call 1
      expect(callCount).toBe(1);

      // ~5s of continued failure: the primary scheduled refresh (fires
      // almost immediately since the quote's own lead time already exceeds
      // its 2s validity) is the only retry that should land here. Without
      // the fix, the -3000ms fallback alone would have fired on every one
      // of the one-second ticks in this window — a growing count instead
      // of a bounded one.
      for (let i = 0; i < 20; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
        });
      }
      expect(callCount).toBe(3);
    } finally {
      unmount();
    }
  }, 15000);
});
