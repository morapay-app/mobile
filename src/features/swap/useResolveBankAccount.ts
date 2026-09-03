import { useEffect, useRef, useState } from 'react';

import { resolveFiatBankAccount } from '../../api/fiatBanks';

const DEBOUNCE_MS = 400;
const NUBAN_LENGTH = 10;

export type BankAccountResolution = {
  accountName: string | null;
  loading: boolean;
  /** True once a lookup has run and come back without a resolvable name —
   * same distinction `useValidateMomo` makes, for the same reason (so the
   * UI can say "couldn't verify" instead of sitting blank). */
  failed: boolean;
};

const IDLE: BankAccountResolution = { accountName: null, loading: false, failed: false };

/** Real NUBAN → account-name resolution via Paystack (`api/fiatBanks.ts`),
 * debounced on the account number — only fires once it's a full 10-digit
 * NUBAN and a bank is picked. Read-only, same as `useValidateMomo`. */
export function useResolveBankAccount(accountNumber: string, bankCode: string | null): BankAccountResolution {
  const [state, setState] = useState<BankAccountResolution>(IDLE);
  const requestId = useRef(0);

  useEffect(() => {
    const digits = accountNumber.trim();
    if (!bankCode || digits.length !== NUBAN_LENGTH) {
      requestId.current += 1;
      setState(IDLE);
      return;
    }

    const id = ++requestId.current;
    setState({ accountName: null, loading: true, failed: false });
    const timer = setTimeout(() => {
      resolveFiatBankAccount(digits, bankCode)
        .then((result) => {
          if (requestId.current !== id) return;
          if (result.account_name) {
            setState({ accountName: result.account_name, loading: false, failed: false });
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
  }, [accountNumber, bankCode]);

  return state;
}
