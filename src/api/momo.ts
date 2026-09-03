import { apiPost } from './client';

export type ValidateMomoRequest = {
  receiver: string;
  /** e.g. 'MTN', 'VODAFONE', 'AIRTELTIGO' — matches the backend's
   * MOMO_PROVIDER_CHANNEL map (src/controllers/moolre.controller.ts). */
  provider: string;
  currency?: string;
};

export type ValidateMomoResponse = {
  success: boolean;
  accountName: string | null;
};

/** Real momo account-name lookup — `/api/public/validate/momo`, backed by
 * Moolre. Read-only: resolves the name registered to a number so the user
 * can confirm it's who they think it is before anything gets sent — it
 * doesn't move money or initiate a charge. */
export function validateMomoAccount(request: ValidateMomoRequest): Promise<ValidateMomoResponse> {
  return apiPost<ValidateMomoResponse>('/api/public/validate/momo', request);
}
