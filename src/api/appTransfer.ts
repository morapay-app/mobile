import { ApiError, apiPost } from './client';

/**
 * Real "send crypto to an email or phone" execution — `POST
 * /api/public/app-transfer/intent`, which proxies Core's own
 * `/api/app-transfer/intent` (core/src/routes/api/app-transfer.ts).
 *
 * How the flow actually works there, since it isn't a direct wallet-to-
 * wallet send: naming a `recipient_email`/`recipient_phone` makes Core open
 * a SELL against the platform liquidity pool with `toType` EMAIL/NUMBER, and
 * hand back the calldata for depositing the funds INTO that pool. The
 * sender signs that deposit; Core then holds the value in custody, files a
 * payment request on behalf of the recipient, and raises a Claim the
 * recipient redeems (picking their own payout channel — wallet or fiat) via
 * the `/api/public/claims/*` routes. That's the flow documented in
 * core/md/onramp-offramp-integration.md §3.2, not an approximation of it.
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
  });
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
