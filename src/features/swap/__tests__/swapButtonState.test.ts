import { getSwapButtonState, isStableToken } from '../swapButtonState';
import type { SwapToken } from '../data/tokens';

function token(overrides: Partial<SwapToken>): SwapToken {
  return {
    id: 'test-token',
    symbol: 'TEST',
    name: 'Test',
    chainName: 'Ethereum',
    chainId: '1',
    address: '0x0',
    logoUri: '',
    type: 'crypto',
    decimals: 18,
    ...overrides,
  };
}

const ETH = token({ id: 'eth-native', symbol: 'ETH' });
const SOL = token({ id: 'sol-native', symbol: 'SOL', chainId: 'solana-mainnet-beta' });
// A real stablecoin the old hardcoded id list never covered — Solana's
// USDC, not one of the three Ethereum/Base entries previously special-cased.
const USDC_SOLANA = token({ id: '0xusdc-sol', symbol: 'USDC', chainId: 'solana-mainnet-beta' });
const DAI_ETHEREUM = token({ id: '0xdai', symbol: 'DAI' });
const GHS = token({ id: 'ghs-momo', symbol: 'GHS', type: 'fiat', decimals: 2 });

describe('isStableToken', () => {
  it('recognizes any real stablecoin by symbol, not just the three originally hardcoded ids', () => {
    expect(isStableToken(USDC_SOLANA)).toBe(true);
    expect(isStableToken(DAI_ETHEREUM)).toBe(true);
  });

  it('does not treat fiat currencies as dollar-pegged, even though they have a real USD value', () => {
    expect(isStableToken(GHS)).toBe(false);
  });

  it('does not treat a plain volatile token as stable', () => {
    expect(isStableToken(SOL)).toBe(false);
  });
});

describe('getSwapButtonState — low-liquidity gating with a broader stablecoin set', () => {
  it('does not flag a stablecoin (even one outside the old hardcoded id list) paired with SOL as low-liquidity', () => {
    const state = getSwapButtonState({
      walletConnected: true,
      isSwapping: false,
      amount: 100,
      balance: 1000,
      fromToken: USDC_SOLANA,
      toToken: SOL,
    });
    expect(state).toBe('ready');
  });

  it('still flags two genuinely obscure/volatile tokens as low-liquidity', () => {
    const OBSCURE_A = token({ id: 'obscure-a', symbol: 'FOO' });
    const OBSCURE_B = token({ id: 'obscure-b', symbol: 'BAR' });
    const state = getSwapButtonState({
      walletConnected: true,
      isSwapping: false,
      amount: 100,
      balance: 1000,
      fromToken: OBSCURE_A,
      toToken: OBSCURE_B,
    });
    expect(state).toBe('low-liquidity');
  });

  it('still recognizes ETH itself as major even though it is not a stablecoin', () => {
    const OBSCURE = token({ id: 'obscure', symbol: 'FOO' });
    const state = getSwapButtonState({
      walletConnected: true,
      isSwapping: false,
      amount: 1,
      balance: 1000,
      fromToken: ETH,
      toToken: OBSCURE,
    });
    expect(state).toBe('ready');
  });
});
