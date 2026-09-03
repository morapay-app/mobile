import { useDynamicContext } from '@dynamic-labs/sdk-react-core';

/**
 * Web build of wallet-connect state — real Dynamic web SDK
 * (`@dynamic-labs/sdk-react-core`), the same package the checkout web app
 * already uses, wrapped around `<DynamicContextProvider>` in DynamicRoot.web.tsx.
 * Metro picks this file over the bare `useWallet.ts` automatically on web
 * (platform-specific extension resolution) — no runtime Platform check
 * needed, and native's bundle never has to resolve this web-only package.
 */
export function useWallet() {
  const { primaryWallet } = useDynamicContext();

  return {
    connected: Boolean(primaryWallet),
    address: primaryWallet?.address ?? null,
    loading: false,
  };
}
