import { arbitrum, avalanche, base, bsc, mainnet, optimism, polygon } from 'viem/chains';
import type { Chain } from 'viem';

/**
 * The viem `Chain` object for a catalog `chainId`.
 *
 * The native SDK's `dynamicClient.viem.createWalletClient({ wallet, chain })`
 * requires a real `Chain` (confirmed against
 * `@dynamic-labs/legacy-viem-extension`'s own `WalletClientConfigDynamic`
 * type, where `chain` is non-optional) — unlike the web SDK's
 * `primaryWallet.getWalletClient(chainId)`, which resolves the chain itself
 * from just an id. Supplying that object is the single thing that was
 * missing for native execution; everything downstream is ordinary viem.
 *
 * Covers exactly the EVM entries in `MAJOR_CHAIN_IDS` (api/catalog.ts) —
 * the chains this app's catalog actually surfaces tokens for. Solana is
 * deliberately absent: it isn't EVM and has no viem `Chain`.
 */
const VIEM_CHAINS: Record<string, Chain> = {
  '1': mainnet,
  '8453': base,
  '56': bsc,
  '137': polygon,
  '42161': arbitrum,
  '10': optimism,
  '43114': avalanche,
};

export function viemChainForId(chainId: string): Chain | null {
  return VIEM_CHAINS[chainId.trim()] ?? null;
}

/**
 * The exact EVM chains this app supports, as a list — used to build
 * Dynamic's `settings.overrides.evmNetworks` (see DynamicRoot.web.tsx) so
 * the wallet-connect network switcher matches what the app can actually
 * do, instead of whatever's configured on the Dynamic dashboard for this
 * environment (which is a near-empty "Ethereum + some testnets" default,
 * unrelated to this catalog).
 */
export const SUPPORTED_EVM_CHAINS: readonly Chain[] = Object.values(VIEM_CHAINS);
