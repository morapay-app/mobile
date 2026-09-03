import { useEffect, useRef, useState } from 'react';

import { validateMomoAccount } from '../../api/momo';
import { isCompleteMomoNumber, toMomoReceiver, type MomoNetwork } from './momoNetwork';

const DEBOUNCE_MS = 400;

export type MomoValidationState = {
  /** The name registered to this number, once resolved. */
  accountName: string | null;
  loading: boolean;
  /** True once a lookup has run and come back without a resolvable name —
   * distinct from `loading`/idle so the UI can show "couldn't verify that
   * number" instead of just sitting on a blank state. */
  failed: boolean;
};

const IDLE: MomoValidationState = { accountName: null, loading: false, failed: false };

/** Real account-name lookup against `/api/public/validate/momo`, debounced
 * on the phone number — only fires once the number is complete and a
 * network is recognized (no point calling out for an obviously-wrong
 * number). Read-only: never initiates a charge. */
export function useValidateMomo(phone: string, network: MomoNetwork | null | undefined): MomoValidationState {
  const [state, setState] = useState<MomoValidationState>(IDLE);
  const requestId = useRef(0);

  useEffect(() => {
    if (!network || !isCompleteMomoNumber(phone)) {
      requestId.current += 1;
      setState(IDLE);
      return;
    }

    const id = ++requestId.current;
    setState({ accountName: null, loading: true, failed: false });
    const timer = setTimeout(() => {
      validateMomoAccount({ receiver: toMomoReceiver(phone), provider: network })
        .then((result) => {
          if (requestId.current !== id) return;
          if (result.success && result.accountName) {
            setState({ accountName: result.accountName, loading: false, failed: false });
          } else {
            setState({ accountName: null, loading: false, failed: true });
          }
        })
        .catch(() => {
          if (requestId.current !== id) return;
          setState({ accountName: null, loading: false, failed: true });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [phone, network]);

  return state;
}
