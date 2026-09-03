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
  expiresAt: '2099-01-01T00:00:00Z',
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
});
