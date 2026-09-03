import { apiGet } from './client';
import { FIAT_TOKENS, type SwapToken } from '../features/swap/data/tokens';

type SquidTokenRaw = {
  chainId: string;
  networkName: string;
  address: string;
  symbol: string;
  decimals: number;
  name: string;
  logoURI?: string;
};

// Squid's own placeholder address for a chain's native gas token (not a
// morapay convention — this exact value is what `/api/squid/tokens`
// actually returns for ETH/SOL/POL/BNB native entries).
export const NATIVE_PLACEHOLDER = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

/**
 * `/api/squid/tokens` is Squid's full bridging catalog — 11,000+ entries
 * across ~100 chains, most of them obscure (ThaiChain, Ubiq, Expanse...).
 * This narrows to the chains that actually matter (verified live: these
 * seven cover 2,681 EVM tokens plus Solana's 6,139), rather than either
 * "8 hand-picked tokens" or "literally everything Squid has ever indexed."
 */
const MAJOR_CHAIN_IDS = new Set(['1', '8453', '56', '42161', '137', '43114', '10', 'solana-mainnet-beta']);

/** These get a stable, human-readable id (referenced elsewhere — defaults,
 * quick-picks, the major/stable-token checks in swapButtonState.ts) instead
 * of the generic `chainId:address` one every other token gets. Everything
 * else about them (name, symbol, decimals, logo) still comes live from the
 * API, same as any other token — only *which* id it's filed under is fixed. */
const NAMED: { chainId: string; address: string; id: string }[] = [
  { chainId: '1', address: NATIVE_PLACEHOLDER, id: 'eth-native' },
  { chainId: '1', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', id: 'weth-ethereum' },
  { chainId: '1', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', id: 'usdc-ethereum' },
  { chainId: '8453', address: NATIVE_PLACEHOLDER, id: 'eth-base' },
  { chainId: '8453', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', id: 'usdc-base' },
  { chainId: '1', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', id: 'usdt-ethereum' },
  { chainId: 'solana-mainnet-beta', address: NATIVE_PLACEHOLDER, id: 'sol-native' },
  { chainId: '137', address: NATIVE_PLACEHOLDER, id: 'pol-native' },
  { chainId: '56', address: NATIVE_PLACEHOLDER, id: 'bnb-native' },
];

function keyOf(chainId: string, address: string): string {
  return `${chainId}:${address.toLowerCase()}`;
}

/** Squid's catalog carries no volume/market-cap field to sort "everything
 * else" by, so popularity here is this curated symbol list (roughly by
 * real-world market cap/name recognition) — ranked tokens sort first, in
 * this order; everything else falls back to alphabetical, same as before. */
const POPULAR_SYMBOLS = [
  'BTC', 'WBTC', 'ETH', 'WETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE',
  'ADA', 'TRX', 'AVAX', 'LINK', 'DOT', 'MATIC', 'POL', 'SHIB', 'DAI', 'LTC',
  'BCH', 'UNI', 'ICP', 'NEAR', 'APT', 'ARB', 'OP', 'ATOM', 'XLM', 'FIL',
  'ETC', 'AAVE', 'MKR', 'RNDR', 'HBAR', 'VET', 'INJ', 'GRT', 'ALGO', 'SAND',
];
const POPULARITY_RANK = new Map(POPULAR_SYMBOLS.map((symbol, index) => [symbol, index]));

function popularityRank(symbol: string): number {
  return POPULARITY_RANK.get(symbol.toUpperCase()) ?? POPULAR_SYMBOLS.length;
}

function toSwapToken(raw: SquidTokenRaw, id: string): SwapToken {
  return {
    id,
    symbol: raw.symbol,
    name: raw.name,
    chainName: raw.networkName,
    chainId: raw.chainId,
    address: raw.address.toLowerCase() === NATIVE_PLACEHOLDER ? 'native' : raw.address,
    logoUri: raw.logoURI || '',
    type: 'crypto',
    decimals: raw.decimals,
  };
}

/** Unwraps the couple of shapes these squid routes are known to return
 * (`[...]`, `{ chains: [...] }`, `{ data: { chains: [...] } }`), same
 * defensive handling the real checkout app's own mappers use. */
function unwrapList<T>(payload: unknown, key: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj[key])) return obj[key] as T[];
    const nested = obj.data as Record<string, unknown> | undefined;
    if (nested && Array.isArray(nested[key])) return nested[key] as T[];
  }
  return [];
}

export async function fetchSwapTokens(): Promise<SwapToken[]> {
  const payload = await apiGet<unknown>('/api/squid/tokens');
  const raw = unwrapList<SquidTokenRaw>(payload, 'tokens');

  const namedKeys = new Set(NAMED.map((n) => keyOf(n.chainId, n.address)));
  const byKey = new Map(raw.map((token) => [keyOf(token.chainId, token.address), token]));

  const tokens: SwapToken[] = [];

  // Named tokens first, in the order above, so they anchor the top of the
  // list regardless of how the rest sorts.
  for (const named of NAMED) {
    const found = byKey.get(keyOf(named.chainId, named.address));
    if (found) tokens.push(toSwapToken(found, named.id));
  }

  // Everything else on a major chain: well-known tokens first (by the
  // curated popularity list above), alphabetical within/after that — so
  // scrolling (or the batches useSwapTokens loads incrementally) surfaces
  // recognizable tokens before obscure ones instead of just API/alpha order.
  const rest = raw
    .filter((token) => MAJOR_CHAIN_IDS.has(token.chainId) && !namedKeys.has(keyOf(token.chainId, token.address)))
    .sort((a, b) => {
      const rankDiff = popularityRank(a.symbol) - popularityRank(b.symbol);
      return rankDiff !== 0 ? rankDiff : a.symbol.localeCompare(b.symbol);
    });
  for (const token of rest) {
    tokens.push(toSwapToken(token, keyOf(token.chainId, token.address)));
  }

  tokens.push(...FIAT_TOKENS);
  return tokens;
}
