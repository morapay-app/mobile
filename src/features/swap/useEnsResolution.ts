import { useEffect, useRef, useState } from 'react';

import { resolveEnsName } from '../../api/ens';

const DEBOUNCE_MS = 400;

export type EnsResolutionState = {
  /** The address this name resolves to, once resolved. */
  address: string | null;
  /** The avatar ENS has on record, when it has one. */
  avatar: string | null;
  loading: boolean;
  /** True once a lookup has run and the name turned out not to resolve —
   * distinct from idle/loading so the UI can say "that name doesn't resolve"
   * rather than leaving an enabled button that does nothing. */
  failed: boolean;
};

const IDLE: EnsResolutionState = { address: null, avatar: null, loading: false, failed: false };

/**
 * Real ENS resolution against `/api/ens/address`, debounced on the typed
 * name — the same shape and lifecycle as `useValidateMomo` (monotonic
 * request id so a slow earlier lookup can't overwrite a newer one's result).
 *
 * Only runs when the caller has already classified the value as an ENS name
 * (`detectDestination` → `kind: 'ens'`); passing `null` parks it at idle, so
 * typing an ordinary address never fires a lookup.
 */
export function useEnsResolution(ensName: string | null): EnsResolutionState {
  const [state, setState] = useState<EnsResolutionState>(IDLE);
  const requestId = useRef(0);

  useEffect(() => {
    const name = ensName?.trim();
    if (!name) {
      requestId.current += 1;
      setState(IDLE);
      return;
    }

    const id = ++requestId.current;
    setState({ address: null, avatar: null, loading: true, failed: false });
    const timer = setTimeout(() => {
      resolveEnsName(name)
        .then((result) => {
          if (requestId.current !== id) return;
          if (result) {
            setState({ address: result.address, avatar: result.avatar, loading: false, failed: false });
          } else {
            setState({ address: null, avatar: null, loading: false, failed: true });
          }
        })
        .catch(() => {
          if (requestId.current !== id) return;
          setState({ address: null, avatar: null, loading: false, failed: true });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [ensName]);

  return state;
}
