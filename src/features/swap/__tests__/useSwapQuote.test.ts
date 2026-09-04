import { act, renderHook } from '@testing-library/react-native';

import { __clearQuoteCacheForTests, useSwapQuote } from '../useSwapQuote';
import { DEFAULT_FROM_TOKEN, DEFAULT_TO_TOKEN, GHS_MOMO_TOKEN } from '../data/tokens';

const mockFetchSwapQuote = jest.fn();
jest.mock('../../../api/quotes', () => ({
  fetchSwapQuote: (...args: unknown[]) => mockFetchSwapQuote(...args),
}));

// The request-level cache is module-level by design (see its own doc) —
// without clearing it, a quote landed by one test leaks into the next one
// that happens to ask the same pair/amount. `mockFetchSwapQuote` itself is
// also shared across every test in this file — without clearing its own
// call history too, a `toHaveBeenCalledTimes` assertion would count calls
// left over from whichever test ran before it.
beforeEach(() => {
  __clearQuoteCacheForTests();
  mockFetchSwapQuote.mockClear();
});

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

  it('collapses several rapid keystrokes into exactly one network call, with the skeleton flag held instantly and continuously', async () => {
    // The "dual-state debounce" guarantee (instant skeleton on the very
    // first keystroke, exactly one API call per settled input, no network
    // thrashing) — already true here via a single `loading` flag rather
    // than a separate `inputValue`/`debouncedValue` pair: `setLoading(true)`
    // runs synchronously the moment the amount changes (before the debounce
    // timer even starts), and nothing clears it until either a cache hit
    // resolves or the real fetch's own `.finally()` runs — so it stays true
    // across an entire burst of rapid amount changes, not just the first.
    mockFetchSwapQuote.mockResolvedValue(GOOD_QUOTE);
    const { result, rerender } = await renderHook(
      ({ amount }: { amount: number }) => useSwapQuote({ fromToken: ETH, toToken: USDC, amount, inputSide: 'from' }),
      { initialProps: { amount: 5 } },
    );
    expect(result.current.loading).toBe(true); // instant — before any debounce/network wait

    await rerender({ amount: 50 });
    expect(result.current.loading).toBe(true);
    await rerender({ amount: 500 });
    expect(result.current.loading).toBe(true);

    await waitForDebounce();

    expect(mockFetchSwapQuote).toHaveBeenCalledTimes(1);
    expect(mockFetchSwapQuote).toHaveBeenCalledWith(expect.objectContaining({ inputAmount: '500' }));
    expect(result.current.loading).toBe(false);
  });

  it('reuses an already-fetched quote for the exact same request instead of hitting the network again', async () => {
    // Regression test: every amount change used to re-fetch unconditionally,
    // even one already answered seconds ago (retyping a digit, bouncing
    // between quick-amount pills) — wasteful against a backend that takes
    // 6-14s per real quote, and piled up overlapping in-flight requests.
    let callCount = 0;
    mockFetchSwapQuote.mockImplementation(({ inputAmount }: { inputAmount: string }) => {
      callCount += 1;
      return Promise.resolve({ ...GOOD_QUOTE, exchangeRate: inputAmount === '1' ? '2400' : '3000' });
    });

    const { result, rerender } = await renderHook(
      ({ amount }: { amount: number }) => useSwapQuote({ fromToken: ETH, toToken: USDC, amount, inputSide: 'from' }),
      { initialProps: { amount: 1 } },
    );

    await waitForDebounce();
    expect(callCount).toBe(1);
    expect(result.current.quote?.exchangeRate).toBe('2400');

    await rerender({ amount: 2 });
    await waitForDebounce();
    expect(callCount).toBe(2);
    expect(result.current.quote?.exchangeRate).toBe('3000');

    // Back to the amount already quoted above — reused from cache, no
    // additional network call, and no loading flicker in between (a cache
    // hit resolves synchronously within the same effect run).
    await rerender({ amount: 1 });
    expect(callCount).toBe(2);
    expect(result.current.quote?.exchangeRate).toBe('2400');
    expect(result.current.loading).toBe(false);
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

  it('never starts a retry while the previous one is still in flight, no matter how many ticks pass', async () => {
    // Regression for a real production incident: BOB -> USDC (Base) kept
    // failing every retry, and — because the recovery tick had no check for
    // "is a fetch already running" — a slow/hung attempt didn't stop the
    // NEXT scheduled retry from firing anyway, piling up concurrent
    // requests against the backend. Simulated here with a retry that never
    // settles at all (the most extreme case): if the guard works, nothing
    // after the first retry ever calls the backend again, no matter how
    // long this waits.
    let callCount = 0;
    mockFetchSwapQuote.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({ ...GOOD_QUOTE, expiresAt: new Date(Date.now() + 2000).toISOString() });
      }
      return new Promise(() => {}); // hangs forever — call 2 never settles
    });

    const { unmount } = await renderHook(() => useSwapQuote({ fromToken: ETH, toToken: USDC, amount: 1, inputSide: 'from' }));
    try {
      await waitForDebounce(); // lands call 1
      expect(callCount).toBe(1);

      // ~16s: comfortably past several RECOVERY_RETRY_FLOOR_MS (5s) windows
      // — without the in-flight guard, this would have produced several
      // more calls on top of the one hung retry.
      for (let i = 0; i < 32; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
        });
      }
      expect(callCount).toBe(2); // the initial fetch, plus exactly one retry — permanently in flight, nothing piled on top
    } finally {
      unmount();
    }
  }, 20000);

  it('gives up automatically after enough failed retries, instead of hammering the backend forever', async () => {
    // The other half of the same incident: even one-at-a-time, a pair that
    // NEVER succeeds would otherwise retry every RECOVERY_RETRY_FLOOR_MS
    // (5s) indefinitely for as long as the screen stayed open. This proves
    // the hard cap — after MAX_RECOVERY_ATTEMPTS failures, it stops trying
    // altogether rather than retrying forever.
    let callCount = 0;
    mockFetchSwapQuote.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.resolve({ ...GOOD_QUOTE, expiresAt: new Date(Date.now() + 2000).toISOString() });
      }
      return Promise.reject(new Error('this pair can never be routed'));
    });

    const { unmount } = await renderHook(() => useSwapQuote({ fromToken: ETH, toToken: USDC, amount: 1, inputSide: 'from' }));
    try {
      await waitForDebounce(); // lands call 1
      expect(callCount).toBe(1);

      // Long enough real wait to exhaust every retry: the primary scheduled
      // refresh (fires almost immediately, its own lead time already
      // exceeding this quote's 2s validity) plus MAX_RECOVERY_ATTEMPTS (5)
      // recovery retries every 5s after that — comfortably covered by ~32s.
      for (let i = 0; i < 64; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
        });
      }
      const callsAfterExhaustion = callCount;
      // 1 initial success + 1 failed primary refresh + up to 5 failed
      // recovery retries = 7 at most; the exact number only matters in
      // that it's bounded, not open-ended.
      expect(callsAfterExhaustion).toBeLessThanOrEqual(7);
      expect(callsAfterExhaustion).toBeGreaterThan(1);

      // The real proof: waiting even longer never produces another call —
      // it has genuinely stopped, not just slowed down.
      for (let i = 0; i < 12; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
        });
      }
      expect(callCount).toBe(callsAfterExhaustion);
    } finally {
      unmount();
    }
  }, 60000);
});
