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
 * `/api/squid/tokens` is Squid's full bridging catalog — verified live,
 * 11,158 entries across ~90 chains, almost all of them either irrelevant
 * (dozens of Cosmos chains, XRPL, random EVM L2s) or outright junk (anyone
 * can list an ERC-20 with any name/symbol on Squid's index — this is not a
 * curated marketplace). The real morapay web app never shows that raw feed
 * either: `frontend/packages/react/src/catalog.ts`
 * (`SELECTOR_CHAIN_IDS`/`SELECTOR_SYMBOLS_BY_CHAIN`) is the actual,
 * shared source of truth for "which chains and symbols are real, tradeable
 * morapay assets" — confirmed by reading that file directly and by fetching
 * `app.morapay.io`'s own `/api/squid/tokens` response live (same raw feed,
 * same 11k+ count) and comparing it against what the app's own token picker
 * actually renders.
 *
 * This app can't just import that package (private, lives in the separate
 * `morapay-web` monorepo — this is a standalone repo per this app's own
 * CLAUDE.md), so `SELECTOR_CHAIN_IDS`/`SELECTOR_SYMBOLS_BY_CHAIN`/
 * `NATIVE_SYMBOLS_BY_CHAIN` below are a deliberate, trimmed mirror of it —
 * copied verbatim for the chains this app surfaces. The canonical list also
 * covers Bitcoin, Sui, and Tron; those are deliberately NOT mirrored here —
 * this app has no wallet/signing path for any of them (`dynamic/
 * viemChains.ts` is EVM-only, no non-EVM extension beyond Solana).
 *
 * Stellar IS included below, for picker parity with the real web app, even
 * though this app can't sign for it yet either — safe to show because every
 * real execution path already blocks it gracefully on its own, the same way
 * it already blocks Solana-same-chain swaps today: `useSwapExecution`/
 * `useTokenTransfer` both `Number.parseInt` the chain id and refuse a NaN
 * result ("This pair/chain isn't supported yet"), and
 * `contactSendBlockedReason` explicitly checks `viemChainForId`. Nothing
 * needed to change in any of those to make adding this chain safe — this
 * comment just records why that's true, so it isn't re-litigated later.
 * Re-derive this whole list from the real source whenever the canonical
 * catalog changes; don't let it silently drift.
 */
const MAJOR_CHAIN_IDS = new Set(['1', '8453', '56', '42161', '137', '43114', '10', 'solana-mainnet-beta', 'stellar-mainnet']);

/** Native/gas symbols per chain — always allowed when Squid actually returns
 * them. Mirrors `NATIVE_SYMBOLS_BY_CHAIN` in the canonical catalog, trimmed
 * to `MAJOR_CHAIN_IDS`. */
const NATIVE_SYMBOLS_BY_CHAIN: Readonly<Record<string, readonly string[]>> = {
  '1': ['ETH'],
  '8453': ['ETH'],
  '42161': ['ETH', 'ARB'],
  '10': ['ETH', 'OP'],
  '137': ['MATIC', 'POL'],
  '56': ['BNB'],
  '43114': ['AVAX'],
  'solana-mainnet-beta': ['SOL'],
  'stellar-mainnet': ['XLM'],
};

/** Extra symbols per chain, beyond native + USDC/USDT (handled separately —
 * see `isSelectorStableSymbol`). Mirrors `SELECTOR_SYMBOLS_BY_CHAIN` in the
 * canonical catalog, trimmed to `MAJOR_CHAIN_IDS`. */
const SELECTOR_SYMBOLS_BY_CHAIN: Readonly<Record<string, readonly string[]>> = {
  '1': ['ETH', 'USDT', 'USDC', 'WBTC', 'LINK', 'UNI', 'AAVE', 'LDO', 'MANA', 'SAND', 'APE', 'SHIB', 'PEPE', 'WXRP', 'TURBO', 'MOG'],
  '8453': ['ETH', 'USDC', 'AERO', 'DEGEN', 'BRETT', 'TOSHI', 'NORMIE'],
  '42161': ['ARB', 'GMX', 'MAGIC', 'ETH', 'USDC'],
  '10': ['OP', 'VELO', 'USDC'],
  '137': ['POL', 'MATIC', 'USDC'],
  '56': ['BNB', 'CAKE', 'FLOKI', 'BABYDOGE', 'USDC', 'USDT'],
  '43114': ['AVAX', 'JOE', 'USDC'],
  'solana-mainnet-beta': [
    'SOL', 'JUP', 'RAY', 'JITO', 'PYTH', 'BONK', 'WIF', 'POPCAT', 'PNUT', 'PENGU', 'FARTCOIN', 'MEW', 'TRUMP', 'USDC', 'USDT',
  ],
  'stellar-mainnet': ['XLM', 'USDC'],
};

/** USDC/USDT and common bridged variants (USDC.e, USDbC, USDT0, etc.) —
 * verbatim copy of `isSelectorStableSymbol` from the canonical filter. */
function isSelectorStableSymbol(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  if (s === 'USDC' || s === 'USDT') return true;
  if (s === 'USDBC' || s === 'USDCE') return true;
  if (/^USDC[._-]/.test(s)) return true;
  if (/^USDT([._-]|0)/.test(s)) return true;
  return false;
}

/** Real allowlist check — a token only surfaces in the picker if it's this
 * chain's native asset, a recognized USDC/USDT variant, or explicitly named
 * in `SELECTOR_SYMBOLS_BY_CHAIN`. Mirrors `isTokenAllowedInSelector`,
 * trimmed to the chains/symbols this app actually mirrors above. */
function isTokenAllowedInCatalog(chainId: string, symbol: string): boolean {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return false;
  const extras = SELECTOR_SYMBOLS_BY_CHAIN[chainId];
  if (!extras) return false;
  if (isSelectorStableSymbol(sym)) {
    const wantsUsdc = sym === 'USDC' || sym === 'USDBC' || sym === 'USDCE' || /^USDC[._-]/.test(sym);
    const wantsUsdt = sym === 'USDT' || /^USDT([._-]|0)/.test(sym);
    if (wantsUsdc) return extras.some((listed) => listed === 'USDC' || listed.startsWith('USDC'));
    if (wantsUsdt) return extras.some((listed) => listed === 'USDT' || listed.startsWith('USDT'));
    return extras.includes(sym);
  }
  if (NATIVE_SYMBOLS_BY_CHAIN[chainId]?.includes(sym)) return true;
  return extras.includes(sym);
}

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

  // Everything else — real, allowlisted tokens only (see
  // `isTokenAllowedInCatalog`'s doc for why "every raw Squid token on a
  // major chain" was wrong), well-known ones first (by the curated
  // popularity list above), alphabetical within/after that — so scrolling
  // (or the batches useSwapTokens loads incrementally) surfaces recognizable
  // tokens before obscure ones instead of just API/alpha order.
  const rest = raw
    .filter(
      (token) =>
        MAJOR_CHAIN_IDS.has(token.chainId) &&
        !namedKeys.has(keyOf(token.chainId, token.address)) &&
        isTokenAllowedInCatalog(token.chainId, token.symbol),
    )
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
