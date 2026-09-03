import { apiGet } from './client';

export type RampInstitutionKind = 'mobile_money' | 'bank';

export type RampInstitution = {
  code: string;
  name: string;
  kind: RampInstitutionKind;
};

export type RampBanksResponse = {
  currency: 'ngn' | 'ghs';
  country: 'NG' | 'GH';
  institutions: RampInstitution[];
  mobileMoney: RampInstitution[];
  banks: RampInstitution[];
};

/**
 * Real institution list for a ramp currency — `GET /api/public/ramp/banks`,
 * confirmed directly against core/src/routes/api/public-ramp.ts and the
 * shape core/src/services/quidax-ramp.service.ts's `listRampBanks` actually
 * returns. For GHS this includes mobile money networks *inside* the same
 * institution list Quidax returns for banks — each with a real institution
 * code (`GHS_QUIDAX_MOMO_CODES`: MTN "0004", Airtel "0005", Vodafone
 * "0006", Tigo "0009") — which is what the offramp `bank_code` field
 * actually expects for GHS, not the plain brand name string.
 */
export function fetchRampBanks(currency: 'GHS' | 'NGN'): Promise<RampBanksResponse> {
  return apiGet<RampBanksResponse>('/api/public/ramp/banks', { currency: currency.toLowerCase() });
}
