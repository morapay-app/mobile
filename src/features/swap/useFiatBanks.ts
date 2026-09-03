import { useEffect, useState } from 'react';

import { fetchFiatBanks, type FiatBank } from '../../api/fiatBanks';

export type FiatBanksState = {
  banks: FiatBank[];
  loading: boolean;
};

const IDLE: FiatBanksState = { banks: [], loading: false };

/** Real Paystack bank list for a country — no hardcoded fallback, same
 * "starts empty, only ever reflects what the backend actually returned"
 * rule `useRampBanks` follows. */
export function useFiatBanks(country: 'nigeria' | 'ghana' | null): FiatBanksState {
  const [state, setState] = useState<FiatBanksState>(IDLE);

  useEffect(() => {
    if (!country) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState({ banks: [], loading: true });
    fetchFiatBanks(country)
      .then((banks) => {
        if (!cancelled) setState({ banks, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ banks: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [country]);

  return state;
}
