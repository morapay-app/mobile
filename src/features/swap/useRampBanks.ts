import { useEffect, useState } from 'react';

import { fetchRampBanks, type RampInstitution } from '../../api/rampBanks';
import type { RampCurrency } from './paymentRail';

export type RampBanksState = {
  mobileMoney: RampInstitution[];
  banks: RampInstitution[];
  loading: boolean;
};

const IDLE: RampBanksState = { mobileMoney: [], banks: [], loading: false };

/** Real GHS mobile-money institutions / NGN banks, fetched live —
 * deliberately no hardcoded fallback list. Guessing an institution code
 * client-side (the exact bug this replaces: sending the brand string
 * "MTN" where the backend expects Quidax's own code "0004") is worse than
 * just not having one yet, so this starts empty and only ever reflects
 * what the backend actually returned. */
export function useRampBanks(currency: RampCurrency | null): RampBanksState {
  const [state, setState] = useState<RampBanksState>(IDLE);

  useEffect(() => {
    if (!currency) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState({ mobileMoney: [], banks: [], loading: true });
    fetchRampBanks(currency)
      .then((result) => {
        if (!cancelled) setState({ mobileMoney: result.mobileMoney, banks: result.banks, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ mobileMoney: [], banks: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  return state;
}
