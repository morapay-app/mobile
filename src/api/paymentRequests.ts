import { ApiError, apiPost } from './client';

/**
 * Real payment requests — `POST /api/public/requests`, which proxies Core's
 * own `/api/requests` (core/src/routes/api/requests.ts →
 * `createPaymentRequest`). This is the "normal payment request" flow in
 * core/md/onramp-offramp-integration.md §4.1: Core creates a REQUEST
 * transaction plus a `Request` row, notifies the payer over the channel(s)
 * given, and returns a real pay link the payer opens to settle it. The
 * matching `Claim` is raised at the same time, so the requester can redeem
 * once it's paid.
 *
 * Field names and requirements below match `CreatePaymentRequestBodySchema`
 * in core/src/services/payment-request-create.service.ts exactly, including
 * the two that aren't obvious:
 *   - `toIdentifier` is the REQUESTER (whoever gets paid — i.e. this app's
 *     own user), and Core derives its `toType` purely from whether the
 *     string contains "@" (EMAIL) or not (NUMBER). A wallet address would be
 *     silently filed as a phone number, so callers must pass a real email or
 *     phone here, never an address.
 *   - `payerEmail`/`payerPhone` is who is being ASKED to pay; at least one is
 *     required, and it's what the notification is actually sent to.
 */

export type PaymentRequestChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

/** Real settlement destination — `payoutTarget`/`payoutFiat` on Core's
 * `Request` row, consumed by `onRequestPaymentSettled`
 * (core/src/services/request-settlement.service.ts) once the payer's
 * payment lands. `bank_code` is a REAL provider code either way, never a
 * brand string: Paystack's own bank code for `nuban` (see
 * api/fiatBanks.ts), Quidax's real institution code for `mobile_money`
 * (see momoNetwork.ts's `resolveGhsInstitution`) — same "no guessed
 * brand-string codes" rule the offramp payout account already follows.
 *
 * Known real gap, not something this client can paper over: Core's own
 * `payment-request-create.service.ts` hardcodes the transaction's `t_chain`
 * to "BASE"/`t_token` to "USDC" whenever the payer pays over the fiat
 * pay-link (this app's only payer flow today) — its own comment calls this
 * out as a TODO ("FX vs fiat amount"). That makes `onRequestPaymentSettled`
 * always take the crypto branch, so a `payoutFiat` destination here is
 * real, stored, and schema-correct, but won't auto-settle until that
 * backend gap closes — it currently falls back to a manual claim instead
 * of a silent failure, which is why this is still worth collecting now. */
export type PayoutFiat = {
  type: 'nuban' | 'mobile_money';
  account_name: string;
  account_number: string;
  bank_code?: string;
  currency: string;
};

export type CreatePaymentRequestInput = {
  /** Who should pay — exactly one of these, and it drives the notification. */
  payerEmail?: string;
  payerPhone?: string;
  /** Who gets paid: this app's user, as an email or phone (not an address). */
  requesterIdentifier: string;
  /** What the requester wants to receive. */
  amount: string;
  tokenSymbol: string;
  /** Core's own chain code (see `coreChainCode`), not a numeric chain id. */
  chainCode: string;
  /** Short human summary of what's being received, shown in the request. */
  receiveSummary: string;
  channels?: PaymentRequestChannel[];
  /** A real wallet address — settles automatically once payment lands. */
  payoutTarget?: string;
  /** A real, resolved bank/momo account — see the type's own doc for the
   * current auto-settlement gap. */
  payoutFiat?: PayoutFiat;
  /** Stores the request with a real payer contact but skips actually
   * messaging them — for the "generate a QR/link, I'll share it myself"
   * delivery option (PaymentRequestDeliverySheet). Core still requires a
   * real payerEmail/payerPhone either way; this only suppresses the send —
   * see payment-request-create.service.ts's `skipPaymentRequestNotification`
   * handling. */
  skipPaymentRequestNotification?: boolean;
};

export type CreatedPaymentRequest = {
  id: string;
  code: string;
  linkId: string;
  transactionId: string;
  claimId: string;
  claimCode: string;
  claimLinkId: string;
  /** The real, shareable URL the payer opens to pay this request — this is
   * what a share sheet should hand out. */
  payLink: string;
  notification?: Record<string, unknown>;
};

export class PaymentRequestError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'PaymentRequestError';
    this.code = code;
  }
}

export async function createPaymentRequest(input: CreatePaymentRequestInput): Promise<CreatedPaymentRequest> {
  try {
    return await apiPost<CreatedPaymentRequest>('/api/public/requests', {
      payerEmail: input.payerEmail,
      payerPhone: input.payerPhone,
      channels: input.channels,
      t_amount: input.amount,
      t_chain: input.chainCode,
      t_token: input.tokenSymbol,
      toIdentifier: input.requesterIdentifier,
      receiveSummary: input.receiveSummary,
      payoutTarget: input.payoutTarget,
      payoutFiat: input.payoutFiat,
      skipPaymentRequestNotification: input.skipPaymentRequestNotification,
    });
  } catch (err) {
    if (err instanceof ApiError) throw new PaymentRequestError(err.message, err.code);
    throw err;
  }
}
