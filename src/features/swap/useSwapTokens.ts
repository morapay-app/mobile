import { useEffect, useRef, useState } from 'react';

import { fetchSwapTokens } from '../../api/catalog';
import { BOOTSTRAP_TOKENS, type SwapToken } from './data/tokens';

/**
 * Starts with the small, verified-real bootstrap list so the swap card has
 * something to render immediately, then swaps in the full live catalog
 * once it loads — the current from/to selection stays valid either way,
 * since the bootstrap entries are a subset of the live one.
 */
export function useSwapTokens() {
  const [tokens, setTokens] = useState<SwapToken[]>(BOOTSTRAP_TOKENS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
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
    return () => {
      mounted.current = false;
    };
  }, []);

  return { tokens, loading, error };
}
