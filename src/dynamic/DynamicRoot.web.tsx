import type { ReactNode } from 'react';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { SolanaWalletConnectors } from '@dynamic-labs/solana';

import { DYNAMIC_ENVIRONMENT_ID } from '../config/env';

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
      settings={{
        environmentId: DYNAMIC_ENVIRONMENT_ID,
        walletConnectors: [EthereumWalletConnectors, SolanaWalletConnectors],
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
