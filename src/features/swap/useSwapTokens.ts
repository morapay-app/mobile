import { useEffect, useRef, useState } from 'react';

import { fetchSwapTokens } from '../../api/catalog';
import { BOOTSTRAP_TOKENS, type SwapToken } from './data/tokens';

// `InteractionManager` (React Native's traditional "wait until animations
// settle" API) is deprecated as of this app's own RN version — its own
// source now warns "will be removed in a future release... use
// 'requestIdleCallback' instead." That's a real, polyfilled global on both
// native (a native module, `NativeIdleCallbacks`) and web (the browser's
// own, or RN-web's shim) in this Expo SDK — see setUpTimers.js — so no
// Platform.OS branch is needed to get the same "don't compete with the
// first frame" behavior everywhere.
function deferUntilIdle(task: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(task);
    return () => cancelIdleCallback(handle);
  }
  // Fallback for a test/SSR environment with neither RN's native module nor
  // a browser global — still async (doesn't run inline during render/mount),
  // just not idle-aware.
  const timeout = setTimeout(task, 0);
  return () => clearTimeout(timeout);
}

/**
 * Starts with the small, verified-real bootstrap list so the swap card has
 * something to render immediately, then swaps in the full live catalog
 * once it loads — the current from/to selection stays valid either way,
 * since the bootstrap entries are a subset of the live one.
 *
 * The fetch itself is deferred to the browser/device's idle time (see
 * `deferUntilIdle`) rather than fired the instant this hook mounts —
 * this runs at the app's very first paint, so an eager network call here
 * would otherwise compete with the initial screen's own layout/animation
 * work for the same main thread.
 */
export function useSwapTokens() {
  const [tokens, setTokens] = useState<SwapToken[]>(BOOTSTRAP_TOKENS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const cancelIdle = deferUntilIdle(() => {
      fetchSwapTokens()
        .then((fetched) => {
          if (mounted.current && fetched.length > 0) setTokens(fetched);
        })
        .catch((err) => {
          if (mounted.current) setError(err instanceof Error ? err.message : "We couldn't load tokens. Try again.");
        })
        .finally(() => {
          if (mounted.current) setLoading(false);
        });
    });
    return () => {
      mounted.current = false;
      cancelIdle();
    };
  }, []);

  return { tokens, loading, error };
}
