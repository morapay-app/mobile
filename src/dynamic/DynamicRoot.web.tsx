import type { ReactNode } from 'react';
import { DynamicContextProvider, RemoveWallets, type EvmNetwork, type RecommendedWallet } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { SolanaWalletConnectors } from '@dynamic-labs/solana';
import type { Chain } from 'viem';

import { DYNAMIC_ENVIRONMENT_ID } from '../config/env';
import { SUPPORTED_EVM_CHAINS } from './viemChains';

function viemChainToDynamicEvmNetwork(chain: Chain): EvmNetwork {
  const http = chain.rpcUrls.default.http;
  const explorerUrl = chain.blockExplorers?.default?.url;
  return {
    name: chain.name,
    chainId: chain.id,
    networkId: chain.id,
    nativeCurrency: {
      name: chain.nativeCurrency.name,
      symbol: chain.nativeCurrency.symbol,
      decimals: chain.nativeCurrency.decimals,
    },
    rpcUrls: [...http],
    iconUrls: [],
    blockExplorerUrls: explorerUrl ? [explorerUrl] : [],
  };
}

/** Curated to exactly the chains `viemChains.ts` supports (what this app's
 * own catalog surfaces tokens for), same reasoning and same mapping
 * frontend/apps/app's evm-chains.ts already uses for its own Dynamic
 * override — without this, Dynamic falls back to whatever's configured on
 * the dashboard for this environment, which is a near-empty default list
 * (just Ethereum mainnet + a couple of testnets) that has nothing to do
 * with what this app can actually swap/send. */
const EVM_NETWORKS: EvmNetwork[] = SUPPORTED_EVM_CHAINS.map(viemChainToDynamicEvmNetwork);

/** `argentxmobile` (Ready/Argent mobile) isn't in Dynamic's wallet book and
 * just spams console warnings — same exclusion frontend/apps/app applies. */
const EXCLUDED_WALLET_KEYS = ['argentxmobile'] as const;

/** Surfaced first in the connect modal — matches this app's own real
 * wallet scope (EVM + Solana only, see chainMeta.ts's own doc on why
 * Stellar/Bitcoin/etc. connectors aren't registered below at all), not
 * frontend/apps/app's full multi-chain list. */
const RECOMMENDED_WALLETS: RecommendedWallet[] = [
  { walletKey: 'metamask', label: 'EVM' },
  { walletKey: 'walletconnect', label: 'WalletConnect' },
  { walletKey: 'phantom', label: 'Solana' },
  { walletKey: 'solflare', label: 'Solana' },
];

/**
 * Web build — Dynamic's real web SDK (`@dynamic-labs/sdk-react-core`),
 * the same package + environment the checkout web app already uses. No
 * `<DynamicWidget>` needed: this app drives the connect flow with its own
 * "Connect Wallet" button via `setShowAuthFlow(true)` (see
 * useWalletConnectActions.web.ts) — the same custom-trigger pattern
 * checkout's own components use instead of the pre-built widget.
 */
export function DynamicRoot({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      theme="light"
      settings={{
        environmentId: DYNAMIC_ENVIRONMENT_ID,
        walletConnectors: [EthereumWalletConnectors, SolanaWalletConnectors],
        recommendedWallets: RECOMMENDED_WALLETS,
        walletsFilter: RemoveWallets([...EXCLUDED_WALLET_KEYS]),
        overrides: { evmNetworks: EVM_NETWORKS },
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
