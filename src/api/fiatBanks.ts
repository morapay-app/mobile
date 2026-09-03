import { apiGet } from './client';

/**
 * Paystack's own bank catalog and account resolver — `GET
 * /api/public/fiat/banks` / `GET /api/public/fiat/banks/resolve`, confirmed
 * against core/src/routes/api/paystack-banks.ts (`listBanks`/
 * `resolveBankAccount` in core/src/services/paystack.service.ts). This is a
 * genuinely different bank-code space from `api/rampBanks.ts`'s
 * `/api/public/ramp/banks` (Quidax's own institution list, used for the
 * offramp payout account) — the two providers don't share codes, so a code
 * from one is not valid input to the other. This module exists specifically
 * for `POST /api/public/requests`'s `payoutFiat.bank_code`, which Core
 * resolves/pays out via Paystack (see `payment-request-create.service.ts`'s
 * own "verified via Paystack resolve/validate" comment on that field).
 */

export type FiatBank = {
  id: number;
  name: string;
  code: string;
  slug: string;
  country: string;
  currency: string;
  type: string;
};

export function fetchFiatBanks(country: 'nigeria' | 'ghana'): Promise<FiatBank[]> {
  return apiGet<{ banks: FiatBank[] }>('/api/public/fiat/banks', { country }).then((result) => result.banks);
}

export type ResolvedBankAccount = {
  account_number: string;
  account_name: string;
};

/** Real NUBAN → account-name resolution — the account holder name a
 * `payoutFiat.account_name` actually has to carry, not something the user
 * types blind. */
export function resolveFiatBankAccount(accountNumber: string, bankCode: string): Promise<ResolvedBankAccount> {
  return apiGet<ResolvedBankAccount>('/api/public/fiat/banks/resolve', {
    account_number: accountNumber,
    bank_code: bankCode,
  });
}
