import type { SwapToken } from './data/tokens';

export type ChainMeta = {
  chainId: string;
  name: string;
  logoUri: string;
  /** The token-standard label real wallets/exchanges show next to a
   * network — derived from the chain family, not fetched from anywhere
   * (there's no morapay endpoint for this). "Native" for a chain's own gas
   * asset (nothing to standardize — it isn't a contract), "SPL" for a
   * non-native Solana token, "ERC-20"-style for everything else (every
   * chain here is EVM, and EVM contract tokens are ERC-20 by definition
   * regardless of which chain hosts them — Base/Arbitrum/Optimism/Polygon
   * don't have their own distinct standard name the way BNB Chain's
   * "BEP-20" is a BSC-specific rebrand of the same ERC-20 interface). */
  protocolLabel: (token: Pick<SwapToken, 'address'>) => string;
  /** Rough, illustrative typical confirmation time for this chain — NOT
   * measured or backend-verified (morapay has no endpoint for this), just
   * the generally-known ballpark for each chain's own block time. Shown
   * so the network picker isn't missing the field entirely, but never
   * treated as a real SLA anywhere in this app. */
  estimatedArrival: string;
};

const EVM_ERC20 = () => 'ERC-20';
const NATIVE_OR = (label: string) => (token: Pick<SwapToken, 'address'>) => (token.address === 'native' ? 'Native' : label);

/** Keyed by the same `chainId` values `SwapToken`/Squid's catalog use.
 * Only covers `MAJOR_CHAIN_IDS` (catalog.ts) — the chains this app's
 * catalog actually surfaces tokens for; an unlisted chainId falls back to
 * a generic entry in `getChainMeta` below rather than crashing. */
const CHAIN_META: Record<string, ChainMeta> = {
  '1': {
    chainId: '1',
    name: 'Ethereum',
    logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    protocolLabel: NATIVE_OR('ERC-20'),
    estimatedArrival: '~2 min',
  },
  '8453': {
    chainId: '8453',
    name: 'Base',
    logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
    protocolLabel: NATIVE_OR('ERC-20'),
    estimatedArrival: '~1 min',
  },
  '56': {
    chainId: '56',
    name: 'BNB Smart Chain',
    logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
    protocolLabel: NATIVE_OR('BEP-20'),
    estimatedArrival: '~1 min',
  },
  '42161': {
    chainId: '42161',
    name: 'Arbitrum',
    logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
    protocolLabel: NATIVE_OR('ERC-20'),
    estimatedArrival: '~1 min',
  },
  '137': {
    chainId: '137',
    name: 'Polygon',
    logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
    protocolLabel: NATIVE_OR('ERC-20'),
    estimatedArrival: '~1 min',
  },
  '43114': {
    chainId: '43114',
    name: 'Avalanche',
    logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
    protocolLabel: NATIVE_OR('ERC-20'),
    estimatedArrival: '~1 min',
  },
  '10': {
    chainId: '10',
    name: 'Optimism',
    logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
    protocolLabel: NATIVE_OR('ERC-20'),
    estimatedArrival: '~1 min',
  },
  'solana-mainnet-beta': {
    chainId: 'solana-mainnet-beta',
    name: 'Solana',
    logoUri: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
    protocolLabel: NATIVE_OR('SPL'),
    estimatedArrival: '~30 sec',
  },
};

/** Falls back to the token's own `chainName`/`logoUri` for a chain not in
 * the table above rather than throwing — keeps this additive as the
 * catalog's `MAJOR_CHAIN_IDS` grows, instead of a hard dependency the rest
 * of the app breaks without. */
export function getChainMeta(chainId: string, fallback: { chainName: string; logoUri: string }): ChainMeta {
  return (
    CHAIN_META[chainId] ?? {
      chainId,
      name: fallback.chainName,
      logoUri: fallback.logoUri,
      protocolLabel: EVM_ERC20,
      estimatedArrival: '~1-2 min',
    }
  );
}
