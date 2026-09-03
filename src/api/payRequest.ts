import { ApiError, apiGet, apiPost } from './client';

/**
 * The PAY side of a payment request — the counterpart to
 * `paymentRequests.ts`'s create flow. Three real, public Core-backed
 * endpoints (core/src/routes/api/requests.ts), all proxied the same way
 * (`/api/public/...`, HMAC-signed server-side as the platform, so no
 * per-request auth needed client-side even though Core's own routes sit
 * behind `requirePermission` — the backend proxy satisfies that as the
 * platform key, same as every other `/api/public/*` call this app makes):
 *
 *   - `GET /api/public/requests/by-link/:linkId` — looks up the request by
 *     the `linkId` a real `payLink` encodes (`.../pay/request/<linkId>`).
 *     IMPORTANT, verified live against the deployed backend (not just the
 *     repo source, which implies a richer shape): the response actually
 *     returned today is thin —
 *     `{ linkId, transaction: { t_amount, t_token, t_chain, toIdentifier } }`
 *     — no `id`, `transactionId`, `status`, or `claim`. Every field below
 *     beyond `linkId` and the four `transaction` fields shown is typed
 *     optional for that reason; do not assume any of them are present.
 *     Practically, that means `by-link` alone cannot currently tell a payer
 *     whether a request is already paid, or supply the `transactionId`
 *     `calldata` needs — see `usePayRequest`'s own doc for how this app
 *     works around that (threading `transactionId` through its own deep
 *     link for requests created in-app) and never guesses at it otherwise.
 *   - `GET /api/public/requests/calldata?transaction_id=...` — the real
 *     payment instruction for that transaction (core/src/services/
 *     payment-instruction.service.ts:`buildPaymentInstructionForPoolDeposit`).
 *     Only `kind: "evm_erc20_transfer"` is completable in-app today — every
 *     other kind is a real, currently-unimplemented gap (confirm-crypto 501s
 *     `REQUEST_CONFIRM_NOT_IMPLEMENTED` for non-EVM instructions), not
 *     something this client tries to route around. `amount` is already a
 *     human-readable decimal string (the transaction's own `t_amount`/
 *     `f_amount`, passed through as-is — verified against the real service
 *     code, not multiplied/divided by `decimals`), and `decimals` is always
 *     a real number on the wire (Core defaults it to 18 server-side if the
 *     pool token record is missing one — never actually sent as absent).
 *     A 400 here has at least two real, distinct causes verified live
 *     (`transaction_id is required` when none was supplied, `Request
 *     already paid` when it's genuinely COMPLETED, and `Transaction must be
 *     REQUEST` for the wrong type) — treating every 400 as "already paid"
 *     is wrong and was a real bug; see `usePayRequest`'s handling.
 *   - `POST /api/public/requests/confirm-crypto` — submits the on-chain tx
 *     hash once sent; the backend independently re-verifies the transfer
 *     (amount/recipient/token + a clock-skew check) before marking the
 *     transaction COMPLETED and settling to the requester. Not a rubber
 *     stamp — a wrong or forged hash is rejected server-side.
 */

export type PayRequestTransaction = {
  id?: string;
  type?: string;
  /** Only `"COMPLETED"` is branched on client-side; every other value just
   * means "not yet paid" (Core has more granular statuses than this client
   * needs to distinguish). Verified live: the deployed by-link response
   * does not currently include this field at all — treat its absence as
   * "unknown," never as "not completed." */
  status?: string;
  f_chain: string | null;
  f_token: string | null;
  f_amount?: string | null;
  t_chain: string | null;
  t_token: string | null;
  t_amount: string | null;
  receiveSummary?: string | null;
  createdAt?: string;
  toIdentifier?: string;
};

export type PayRequestClaim = {
  id: string;
  status: string;
  value: string;
  token: string;
  toIdentifier: string;
  code: string;
  claimLinkId: string;
};

export type PaymentRequestByLink = {
  id?: string;
  code?: string;
  linkId: string;
  /** Verified live: not present in the deployed by-link response today —
   * see this file's own doc. `usePayRequest` gets it from the deep link's
   * own `transactionId` param for requests this app created, not from here. */
  transactionId?: string;
  payoutTarget?: string | null;
  payoutFiat?: Record<string, unknown> | null;
  transaction: PayRequestTransaction;
  claim?: PayRequestClaim;
};

/** Only this kind is completable in-app today — see this file's own doc. */
export type EvmErc20TransferInstruction = {
  kind: 'evm_erc20_transfer';
  chainId: number;
  chain: string;
  token: string;
  toAddress: string;
  tokenAddress: string;
  /** Human-readable decimal amount, e.g. `"10"` — not raw base units. */
  amount: string;
  decimals: number;
  message: string;
};

/** Any other instruction kind (non-EVM chains) — typed loosely since this
 * client can't act on one anyway, just detect it isn't the supported kind. */
export type UnsupportedPaymentInstruction = { kind: string; [key: string]: unknown };

export type PaymentInstruction = EvmErc20TransferInstruction | UnsupportedPaymentInstruction;

export type ConfirmCryptoResult = {
  confirmed: true;
  transaction_id: string;
  tx_hash: string;
  message: string;
};

export class PayRequestError extends Error {
  readonly code?: string;
  readonly status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'PayRequestError';
    this.code = code;
    this.status = status;
  }
}

export async function getPaymentRequestByLink(linkId: string): Promise<PaymentRequestByLink> {
  try {
    return await apiGet<PaymentRequestByLink>(`/api/public/requests/by-link/${encodeURIComponent(linkId)}`);
  } catch (err) {
    if (err instanceof ApiError) throw new PayRequestError(err.message, err.code, err.status);
    throw err;
  }
}

export async function getPaymentInstruction(transactionId: string): Promise<PaymentInstruction> {
  try {
    return await apiGet<PaymentInstruction>('/api/public/requests/calldata', { transaction_id: transactionId });
  } catch (err) {
    if (err instanceof ApiError) throw new PayRequestError(err.message, err.code, err.status);
    throw err;
  }
}

export async function confirmCryptoPayment(transactionId: string, txHash: string): Promise<ConfirmCryptoResult> {
  try {
    return await apiPost<ConfirmCryptoResult>('/api/public/requests/confirm-crypto', {
      transaction_id: transactionId,
      tx_hash: txHash,
    });
  } catch (err) {
    if (err instanceof ApiError) throw new PayRequestError(err.message, err.code, err.status);
    throw err;
  }
}

export function isEvmErc20TransferInstruction(instruction: PaymentInstruction): instruction is EvmErc20TransferInstruction {
  return instruction.kind === 'evm_erc20_transfer';
}
