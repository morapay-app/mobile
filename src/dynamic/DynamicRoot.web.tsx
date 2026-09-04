import type { ReactNode } from 'react';
import { DynamicContextProvider, RemoveWallets, type RecommendedWallet } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { SolanaWalletConnectors } from '@dynamic-labs/solana';

import { DYNAMIC_ENVIRONMENT_ID } from '../config/env';

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
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
