import { ApiError, apiPost } from './client';

/**
 * Real "send crypto to an email or phone" execution — `POST
 * /api/public/app-transfer/intent`, which proxies Core's own
 * `/api/app-transfer/intent` (core/src/routes/api/app-transfer.ts). This is
 * crypto-funded ONLY — confirmed live by reading the actual handler: it
 * always validates the funding address against a real on-chain ecosystem
 * and always returns crypto pool-deposit calldata, with no fiat/mobile-
 * money-funded branch anywhere in it (or anywhere else in Core). Paying
 * with mobile money to fund a send to a contact genuinely isn't possible
 * today — see `contactSendBlockedReason` below, which is why that case is
 * blocked rather than attempted.
 *
 * How the flow actually works, since it isn't a direct wallet-to-wallet
 * send: naming a `recipient_email`/`recipient_phone` makes Core open a SELL
 * against the platform liquidity pool with `toType` EMAIL/NUMBER, and hand
 * back the calldata for depositing the funds INTO that pool. The sender
 * signs that deposit and confirms it (`POST /api/public/offramp/confirm`) —
 * but confirming the deposit does NOT by itself notify anyone or create
 * anything claimable. A separate step, `notifyCustodialSend` below, is
 * required to actually generate the claim code/OTP and email both parties;
 * skipping it (confirmed live: nothing in this app called it before) means
 * the money moves into custody with no way for the recipient to ever find
 * out. This is Redis-backed custody (`custodial-send-notify.service.ts`),
 * not a Postgres `Claim` row the way a payment REQUEST's claim is — but
 * both origins are served by the same `/api/public/claims/*` routes (see
 * `api/claims.ts`), which branch internally on which store actually has
 * the id.
 *
 * Field names below match `IntentBodySchema` in that route exactly.
 */

/** Core's EVM pool-deposit instruction (`EvmErc20TransferInstruction` in
 * core/src/services/payment-instruction.service.ts). `amount` is a
 * human-readable decimal string in the token's own units, and
 * `tokenAddress` is always a real ERC-20 contract — Core rejects a native
 * placeholder address for a pool deposit outright, so a native gas token
 * can never reach this path (see `isEligibleForContactSend`). */
export type EvmPoolDepositCalldata = {
  kind: 'evm_erc20_transfer';
  toAddress: string;
  chainId: number;
  chain: string;
  token: string;
  tokenAddress: string;
  amount: string;
  decimals: number;
  message?: string;
};

/** The other instruction kinds Core can return for non-EVM ecosystems. This
 * app has no signing path for any of them, so they're modelled only well
 * enough to be recognized and refused rather than half-executed. */
type NonEvmCalldata = {
  kind: 'solana_spl_transfer' | 'stellar_payment' | 'bitcoin_utxo' | 'unsupported';
  message?: string;
  unsupportedReason?: string;
};

export type PoolDepositCalldata = EvmPoolDepositCalldata | NonEvmCalldata;

export type AppTransferIntent = {
  transaction_id: string;
  calldata: PoolDepositCalldata;
  next_step?: string;
};

export class AppTransferError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AppTransferError';
    this.code = code;
  }
}

export function isEvmPoolDeposit(calldata: PoolDepositCalldata): calldata is EvmPoolDepositCalldata {
  return calldata.kind === 'evm_erc20_transfer';
}

async function appTransferCall<T>(path: string, body: unknown): Promise<T> {
  try {
    return await apiPost<T>(path, body);
  } catch (err) {
    if (err instanceof ApiError) throw new AppTransferError(err.message, err.code);
    throw err;
  }
}

export type CreateContactTransferInput = {
  /** What the sender is paying with. `chainSlug` comes from
   * `coreChainSlug` — Core resolves either a name slug or a numeric id. */
  fromChainSlug: string;
  fromTokenSymbol: string;
  /** Human-readable amount in the from-token's own units. */
  fromAmount: string;
  toChainSlug: string;
  toTokenSymbol: string;
  toAmount: string;
  /** The SENDER's own connected wallet — this is the on-chain identity for
   * the deposit, not where the money ends up (the recipient claims it).
   * Core validates it against the paying chain's ecosystem. */
  senderAddress: string;
  /** Exactly one of these identifies the beneficiary. */
  recipientEmail?: string;
  recipientPhone?: string;
  /** The SENDER's own email — stored on the transaction as `fromIdentifier`
   * and required for `notifyCustodialSend` below to do anything at all
   * (confirmed live: `notifyCustodialSellAfterDeposit` hard-fails with
   * "Payer email is missing" without it). Nothing else in this app ever
   * collects an email for a connect-only wallet session, so the send-to-
   * contact form has to ask for it directly. */
  payerEmail: string;
};

export function createContactTransferIntent(input: CreateContactTransferInput): Promise<AppTransferIntent> {
  return appTransferCall<AppTransferIntent>('/api/public/app-transfer/intent', {
    f_chain_slug: input.fromChainSlug,
    f_token: input.fromTokenSymbol,
    f_amount: input.fromAmount,
    t_chain_slug: input.toChainSlug,
    t_token: input.toTokenSymbol,
    t_amount: input.toAmount,
    receiver_address: input.senderAddress,
    recipient_email: input.recipientEmail,
    recipient_phone: input.recipientPhone,
    payer_email: input.payerEmail,
  });
}

/**
 * The step that actually makes a send-to-contact reachable by its
 * recipient — `POST /api/public/app-transfer/custodial-notify`
 * (`notifyCustodialSellAfterDeposit` in Core), which generates the claim
 * code + OTP + claim link, emails the payer their own copy (the code to
 * relay to the recipient if needed), and sends the recipient theirs directly
 * — EMAIL via `sendClaimNotification`'s email channel, PHONE via its SMS
 * channel (added in Core; previously phone recipients got nothing — that gap
 * is closed). Idempotent server-side — safe to call more than once for the
 * same transaction.
 */
export function notifyCustodialSend(transactionId: string): Promise<{ notified: boolean }> {
  return appTransferCall('/api/public/app-transfer/custodial-notify', { transaction_id: transactionId });
}

/**
 * Confirms the pool deposit landed — `POST /api/public/offramp/confirm`,
 * the same route the intent's own `next_step` names. Core verifies the hash
 * on-chain (matching token, pool address and amount), books the deposit into
 * inventory, and marks the transaction COMPLETED, which is what releases the
 * recipient's claim. Deliberately the public, unauthenticated variant: that
 * route treats auth as optional precisely so a client can confirm its own
 * deposit.
 */
export function confirmPoolDeposit(input: { transactionId: string; txHash: string }): Promise<unknown> {
  return appTransferCall('/api/public/offramp/confirm', {
    transaction_id: input.transactionId,
    tx_hash: input.txHash,
  });
}
