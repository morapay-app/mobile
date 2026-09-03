import { apiGet } from './client';
import { NATIVE_PLACEHOLDER } from './catalog';
import type { SwapToken } from '../features/swap/data/tokens';

export type BalanceItem = {
  chainId: string;
  networkName: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenName: string;
  tokenLogoURI?: string;
  /** Human-readable decimal string, e.g. "1.02". */
  balance: string;
  balanceRaw: string;
};

/**
 * Without a `tokenAddress` filter this returns *every* token the address
 * has ever held a nonzero balance of on that chain — including dust/spam
 * tokens with no real value. Callers match against a specific SwapToken's
 * address (see `findTokenBalance`) rather than rendering this list as-is.
 */
export async function fetchChainBalances(address: string, chainId: string): Promise<BalanceItem[]> {
  return apiGet<BalanceItem[]>('/api/balances/multicall', { address, chainId });
}

function normalizeAddress(address: string): string {
  return (address === 'native' ? NATIVE_PLACEHOLDER : address).toLowerCase();
}

export function findTokenBalance(items: BalanceItem[], token: SwapToken): number {
  const target = normalizeAddress(token.address);
  const match = items.find((item) => normalizeAddress(item.tokenAddress) === target);
  return match ? parseFloat(match.balance) : 0;
}
