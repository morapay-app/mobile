/**
 * Token model + a couple of bootstrap entries. The full picker list is no
 * longer hardcoded here — it's fetched live from the real backend's Squid
 * catalog (see `../api/catalog.ts`) so it's not just currently-real, but
 * stays real. The shape still lines up with what the real morapay stack
 * models:
 *   - frontend/apps/app/src/types/token.ts        (Chain, Token)
 *   - backend/src/lib/interfaces/squid.types.ts    (BalanceItem)
 *   - core/prisma/schema.prisma                    (SupportedToken)
 *
 * The one 'fiat' entry (GHS) stands in for morapay's real mobile-money rail
 * — the backend's `/api/moolre/*` route does bank/momo validation for Ghana
 * — settled by phone number instead of a wallet address. It isn't part of
 * Squid's bridging catalog, so it's kept as a fixed local entry rather than
 * fetched.
 */

export const FLAG_CDN = 'https://flagcdn.com/w80';

export type SwapToken = {
  id: string;
  symbol: string;
  name: string;
  chainName: string;
  /** Squid/EVM chain id ("1", "8453", ...) or "solana-mainnet-beta" — what
   * the balances and quotes APIs actually key on. Empty for the fiat rail,
   * which doesn't have one. */
  chainId: string;
  /** Contract address, or 'native' for a chain's gas token. */
  address: string;
  logoUri: string;
  /** 'fiat' settles over a mobile-money/bank rail instead of a chain. */
  type: 'crypto' | 'fiat';
  /** On-chain decimal precision (18 for ETH, 6 for USDC, ...) — drives how
   * many decimal places the amount field accepts for this token, so typing
   * a small crypto amount (e.g. 0.0003 ETH) isn't clamped to cents-style
   * 2-decimal entry. 2 for the fiat momo rail, same as any other currency. */
  decimals: number;
};

/** Only currencies this app actually has a real, working settlement path
 * for today — GHS over the momo rail (`momoNetwork.ts`'s real Quidax
 * institution codes), NGN over Paystack bank resolution (`useFiatBanks`/
 * `useResolveBankAccount`), both wired end-to-end in
 * `ReceiveDestinationCard.tsx`, and BOB over the Pollar peso bridge
 * (`core/src/services/bridge-pesos-ghs.service.ts`, corridor list in
 * `frontend/apps/app/src/lib/fiat-corridor.ts`). `isFiatInvoiceCurrency`
 * (frontend/apps/checkout/src/lib/commerce-invoice-currency.ts) recognizes
 * a much longer list platform-wide, but listing one here with no real
 * settlement mechanism behind it would just be a picker entry that dead-ends
 * — trimmed to what's genuinely supported "for now" rather than the full
 * platform list. Add an entry here only once its own real rail exists. */
const FIAT_DEFINITIONS: { symbol: string; name: string; country: string; momo?: boolean }[] = [
  { symbol: 'GHS', name: 'Ghana Cedi', country: 'gh', momo: true },
  { symbol: 'NGN', name: 'Nigerian Naira', country: 'ng' },
  { symbol: 'BOB', name: 'Bolivian Boliviano', country: 'bo' },
];

// GHS keeps its original id (`ghs-momo`, predating this list) — referenced
// by testIDs and the mock USD-price table elsewhere.
const FIAT_ID_OVERRIDES: Record<string, string> = { GHS: 'ghs-momo' };

export const FIAT_TOKENS: SwapToken[] = FIAT_DEFINITIONS.map((fiat) => ({
  id: FIAT_ID_OVERRIDES[fiat.symbol] ?? `${fiat.symbol.toLowerCase()}-fiat`,
  symbol: fiat.symbol,
  name: fiat.momo ? `${fiat.name} (Mobile Money)` : fiat.name,
  chainName: fiat.momo ? 'Mobile Money' : 'Fiat',
  chainId: '',
  address: 'native',
  logoUri: `${FLAG_CDN}/${fiat.country}.png`,
  type: 'fiat',
  decimals: 2,
}));

export const GHS_MOMO_TOKEN: SwapToken = FIAT_TOKENS[0];

/** Renders instantly, before the live catalog fetch resolves — real,
 * verified-live entries (checked directly against `/api/squid/tokens`),
 * not placeholders. The full catalog fetch below expands the picker's
 * options around these; it doesn't replace them. */
export const BOOTSTRAP_TOKENS: SwapToken[] = [
  {
    id: 'eth-native',
    symbol: 'ETH',
    name: 'Ethereum',
    chainName: 'Ethereum',
    chainId: '1',
    address: 'native',
    logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    type: 'crypto',
    decimals: 18,
  },
  {
    id: 'usdc-ethereum',
    symbol: 'USDC',
    name: 'USDC',
    chainName: 'Ethereum',
    chainId: '1',
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    type: 'crypto',
    decimals: 6,
  },
  {
    id: 'eth-base',
    symbol: 'ETH',
    name: 'Ethereum',
    chainName: 'Base',
    chainId: '8453',
    address: 'native',
    logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    type: 'crypto',
    decimals: 18,
  },
  {
    id: 'usdc-base',
    symbol: 'USDC',
    name: 'USDC',
    chainName: 'Base',
    chainId: '8453',
    address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    logoUri:
      'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913/logo.png',
    type: 'crypto',
    decimals: 6,
  },
  GHS_MOMO_TOKEN,
];

// Base is where morapay's own real ramp corridor settles (see
// rampCorridor.ts's BASE_USDC_RAMP_CORRIDOR) and where onramp/offramp
// traffic actually lands — defaulting the swap card to the same chain
// means a first-time user's very first quote doesn't need a chain switch
// before it's useful.
export const DEFAULT_FROM_TOKEN = BOOTSTRAP_TOKENS[3]; // USDC on Base
export const DEFAULT_TO_TOKEN = BOOTSTRAP_TOKENS[2]; // ETH on Base

/** Quick-pick row across the top of the sheet — shown once these ids are
 * present in whatever token list is currently loaded. */
export const QUICK_PICK_IDS = ['eth-native', 'usdc-ethereum', 'usdt-ethereum', 'weth-ethereum', 'sol-native'];

export function findToken(tokens: SwapToken[], id: string): SwapToken | undefined {
  return tokens.find((token) => token.id === id);
}

export function shortenAddress(address: string): string | null {
  if (address === 'native') return null;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
