import { ApiError, apiGet, apiPost } from './client';

/**
 * The RECEIVER's side of a payment — redeeming money someone sent to their
 * email or phone number. Backed by Core's real `/api/claims/*` routes
 * (core/src/routes/api/claims.ts), proxied here as `/api/public/claims/*`
 * (backend/src/routes/register.ts) the same unauthenticated-platform-proxy
 * way every other `/api/public/*` call in this app works.
 *
 * One route set serves TWO real, distinct claim origins — verified live by
 * reading the actual handlers, not assumed from naming:
 *   - "request": a real Postgres `Claim` row, created when someone pays a
 *     payment REQUEST this app's own Receive flow generated.
 *   - "custodial": Redis-only (no DB row), created when someone sends
 *     crypto directly to a contact's email/phone (see api/appTransfer.ts's
 *     `notifyCustodialSend`) — same claim UX, different backing store.
 * `by-link`'s own `source` field tells the caller which one a given link
 * is, but every other route below resolves DB-first/Redis-fallback
 * internally, so the client never needs to branch on it itself.
 *
 * Redemption is two sequential factors, not alternatives — proving control
 * of the recipient's own contact (OTP), THEN a separate 6-character code
 * the SENDER was given to relay out-of-band (claim code). Only after both
 * succeed does `verify-claim-code` mint an `unlock_token`, which is what
 * `unlocked`/`settlement-selection`/`claim` all require.
 *
 * A PHONE recipient now genuinely receives their OTP + claim code by SMS for
 * both claim origins — Core added the SMS branch to both
 * `custodial-send-notify.service.ts` and `request-claim-notify.service.ts`
 * (previously only email worked; confirmed fixed by reading both services
 * directly). The redeem screen's phone support was already real on this
 * client's side; it just couldn't promise the SMS actually went out before.
 */

export class ClaimError extends Error {
  readonly code?: string;
  readonly status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'ClaimError';
    this.code = code;
    this.status = status;
  }
}

async function claimsCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) throw new ClaimError(err.message, err.code, err.status);
    throw err;
  }
}

export type ClaimByLink = {
  claim_link_id: string;
  source: 'request' | 'custodial';
  /** Partially masked contact (e.g. `am***@example.com`) — see
   * `maskRecipientHint` in Core — enough to help the right person recognize
   * a link is theirs without exposing the full contact to anyone who has
   * it. */
  recipient_hint: string;
};

/** `GET /api/public/claims/by-link/:claimLinkId` — the claim's public,
 * pre-auth metadata. A 404 means the link is genuinely invalid/expired or
 * consumed (custodial payloads are deleted from Redis once claimed). */
export function getClaimByLink(claimLinkId: string): Promise<ClaimByLink> {
  return claimsCall(() => apiGet<ClaimByLink>(`/api/public/claims/by-link/${encodeURIComponent(claimLinkId)}`));
}

/** `POST /api/public/claims/verify-recipient` — confirms the typed
 * email/phone is actually this claim's beneficiary, before an OTP is even
 * sent anywhere. `code: 'SELF_CLAIM_NOT_ALLOWED'` is real: Core refuses a
 * claim whose payer and recipient are the same contact. */
export function verifyClaimRecipient(claimLinkId: string, recipient: string): Promise<{ ok: true }> {
  return claimsCall(() =>
    apiPost<{ ok: true }>('/api/public/claims/verify-recipient', { claim_link_id: claimLinkId, recipient }),
  );
}

/** `POST /api/public/claims/verify-otp` — the first redemption factor.
 * `message: 'Already verified'` on a repeat call is a real success case,
 * not an error — Core returns 200 for it. */
export function verifyClaimOtp(input: {
  claimLinkId: string;
  recipient: string;
  otp: string;
}): Promise<{ verified: true; message: string }> {
  return claimsCall(() =>
    apiPost<{ verified: true; message: string }>('/api/public/claims/verify-otp', {
      claim_link_id: input.claimLinkId,
      recipient: input.recipient,
      otp: input.otp,
    }),
  );
}

/** `POST /api/public/claims/verify-claim-code` — the second redemption
 * factor, gated on the OTP step above (`code: 'OTP_NOT_VERIFIED'` if
 * attempted first). Success mints the `unlock_token` every later step
 * needs. `code: 'ALREADY_VERIFIED'` means this session already unlocked —
 * a real, if unlikely, double-submit case, not a hard failure. */
export function verifyClaimCode(input: {
  claimLinkId: string;
  recipient: string;
  code: string;
}): Promise<{ verified: true; unlock_token: string }> {
  return claimsCall(() =>
    apiPost<{ verified: true; unlock_token: string }>('/api/public/claims/verify-claim-code', {
      claim_link_id: input.claimLinkId,
      recipient: input.recipient,
      code: input.code,
    }),
  );
}

export type UnlockedClaim = {
  claim_link_id: string;
  kind: 'db' | 'custodial';
  transaction_id: string;
  value: string;
  token: string;
  payer_identifier?: string;
  to_identifier: string;
  payout_type_hint: 'crypto' | 'fiat';
  f_chain: string;
  f_token: string;
  f_amount: string;
  t_chain: string;
  t_token: string;
  t_amount: string;
  sent_summary: string;
  sender_paid_fiat: boolean;
  claim_fiat_allowed: boolean;
  claim_crypto_allowed: boolean;
  crypto_payout_allowed: boolean;
};

/** `GET /api/public/claims/unlocked/:token` — the real claim details, only
 * reachable with a valid `unlock_token` from `verify-claim-code`. This is
 * the single source of truth for what payout this claim can actually take
 * (`claim_crypto_allowed`/`claim_fiat_allowed`) — see `claim-payout-policy`
 * on the Core side for why a sender's own funding rail constrains it. */
export function getUnlockedClaim(unlockToken: string): Promise<UnlockedClaim> {
  return claimsCall(() => apiGet<UnlockedClaim>(`/api/public/claims/unlocked/${encodeURIComponent(unlockToken)}`));
}

export type ClaimResult = {
  claimed: true;
  transaction_id: string;
  payout_type: 'crypto' | 'fiat';
  sent: true;
  message: string;
};

/**
 * `POST /api/public/claims/claim` — the real, synchronous payout. Core
 * awaits an actual on-chain send or Paystack transfer inside this one
 * request; there is no queued job to poll afterward. A 429
 * (`CLAIM_IN_PROGRESS`) means a concurrent claim attempt already holds
 * Core's own dedupe lock — safe to retry shortly, not a failure to report
 * as one. Only crypto payout (a wallet address) is wired up client-side
 * today; see `ClaimScreen`'s doc for why fiat payout isn't built yet.
 */
export function claimCryptoPayout(input: {
  unlockToken: string;
  recipient: string;
  payoutTarget: string;
}): Promise<ClaimResult> {
  return claimsCall(() =>
    apiPost<ClaimResult>('/api/public/claims/claim', {
      unlock_token: input.unlockToken,
      recipient: input.recipient,
      payout_type: 'crypto',
      payout_target: input.payoutTarget,
    }),
  );
}
