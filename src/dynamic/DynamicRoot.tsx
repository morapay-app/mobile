import type { ReactNode } from 'react';

import { dynamicClient } from './dynamicClient';

/**
 * Native build (default — Metro only prefers `.web.tsx` on web). Required
 * at the app root per Dynamic's own docs — this is where the SDK's real
 * auth/wallet-connect UI actually lives and runs (a real browser engine),
 * not a React Native component tree. Auth flows silently do nothing
 * without it mounted.
 */
export function DynamicRoot({ children }: { children: ReactNode }) {
  return (
    <>
      <dynamicClient.reactNative.WebView />
      {children}
    </>
  );
}
