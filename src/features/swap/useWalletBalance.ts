import { useEffect, useState } from 'react';

import { fetchChainBalances, findTokenBalance } from '../../api/balances';
import type { SwapToken } from './data/tokens';

/** Real balance for one token from `/api/balances/multicall`, scoped to
 * whatever address is currently connected (a manually-pasted test address
 * for now — see TestAddressSheet — until real wallet-connect lands). */
export function useWalletBalance(address: string | null, token: SwapToken) {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address || token.type !== 'crypto' || !token.chainId) {
      setBalance(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchChainBalances(address, token.chainId)
      .then((items) => {
        if (!cancelled) setBalance(findTokenBalance(items, token));
      })
      .catch(() => {
        if (!cancelled) setBalance(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, token.id, token.chainId, token.address, token.type]);

  return { balance, loading };
}
