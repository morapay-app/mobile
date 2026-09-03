import { useReactiveClient } from '@dynamic-labs/legacy-react-hooks';

import { dynamicClient } from './dynamicClient';

/**
 * Real wallet-connect state from the actual React Native SDK. `connectOnly`
 * mode (see dynamicClient.ts) means a connected wallet isn't necessarily an
 * authenticated session — exactly what this app needs, since balances/
 * quotes only require an address to read, not proof of ownership.
 *
 * `wallet.chain` isn't a documented literal union in this package (its
 * connectors are loaded at runtime inside the SDK's own WebView, not
 * bundled here) — matched case-insensitively against "evm" rather than an
 * exact string this app can't fully verify ahead of a real device test.
 */
export function useWallet() {
  const { wallets } = useReactiveClient(dynamicClient);
  // `?.` on `chain`, not a bare `.toLowerCase()` — a wallet object pushed
  // into the reactive store mid-connect (e.g. right after the user signs,
  // before every field has actually populated) can have `chain` still
  // unset. Without the guard this throws during render, and with no
  // ErrorBoundary anywhere in the app (see App.tsx), that's an uncaught
  // crash right at the exact moment a real connect attempt completes —
  // consistent with reports of native connect failing right after signing
  // while the separate web integration (useWallet.web.ts, which reads
  // `primaryWallet` directly instead of scanning for a chain match) never
  // hits this code path at all. `useWalletConnectActions.ts` already
  // guards the same field this way.
  const evmWallet = wallets.userWallets.find((wallet) => wallet.chain?.toLowerCase().includes('evm')) ?? null;

  return {
    connected: Boolean(evmWallet),
    address: evmWallet?.address ?? null,
    loading: false,
  };
}
