import { ApiError, apiGet, apiPost } from './client';

/**
 * Real onramp/offramp execution — `/api/public/ramp/*`, the same backend
 * routes frontend/apps/app's TransferContainer.tsx drives via its
 * `src/lib/app-ramp.ts` (that app proxies through its own `/api/core/ramp/*`
 * BFF route; this app has no such proxy layer, so it calls the backend
 * directly like every other endpoint here). Field names below match that
 * file's request bodies exactly — confirmed live against the backend.
 */

export type PublicRampTransaction = {
  id: string;
  merchantReference: string;
  direction: string;
  fiatCurrency: string;
  status: string;
  token: string;
  network: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: string;
  toAmount: string | null;
  userToAmount?: string | null;
  quotedToAmount?: string | null;
  payoutWalletAddress: string | null;
  settlementMode?: string | null;
  targetChainId?: number | null;
  targetTokenSymbol?: string | null;
  distributionStatus?: string | null;
  swapTxHash?: string | null;
  distributionTxHash?: string | null;
  phoneNumber: string | null;
  networkProvider: string | null;
  accountNumber: string | null;
  accountName: string | null;
  errorMessage: string | null;
};

export class RampRequestError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'RampRequestError';
    this.code = code;
  }
}

async function rampCall<T>(path: string, body?: unknown): Promise<T> {
  try {
    return body === undefined ? await apiGet<T>(`/api/public/ramp/${path}`) : await apiPost<T>(`/api/public/ramp/${path}`, body);
  } catch (err) {
    if (err instanceof ApiError) throw new RampRequestError(err.message, err.code);
    throw err;
  }
}

export function initiateOnramp(input: {
  currency: string;
  fiatAmount: string;
  payoutWalletAddress: string;
  customerName?: string;
  targetChainId?: number;
  targetTokenSymbol?: string;
  targetTokenAddress?: string;
  quotedToAmount?: string;
}): Promise<PublicRampTransaction> {
  return rampCall('onramp/initiate', {
    currency: input.currency,
    fiat_amount: input.fiatAmount,
    payout_wallet_address: input.payoutWalletAddress,
    wallet_address: input.payoutWalletAddress,
    customer_name: input.customerName,
    client_channel: 'browser',
    target_chain_id: input.targetChainId,
    target_token_symbol: input.targetTokenSymbol,
    target_token_address: input.targetTokenAddress,
    quoted_to_amount: input.quotedToAmount,
  });
}

export function startOnrampMobileMoney(input: {
  merchantReference: string;
  walletAddress: string;
  phoneNumber: string;
  networkProvider: string;
}): Promise<{
  transaction: PublicRampTransaction;
  paymentInstructions?: { awaitingPaymentMessage?: string };
  requiresOtp?: boolean;
}> {
  return rampCall(`onramp/${encodeURIComponent(input.merchantReference)}/mobile-money`, {
    wallet_address: input.walletAddress,
    phone_number: input.phoneNumber,
    network_provider: input.networkProvider,
  });
}

export function verifyOnrampOtp(input: { merchantReference: string; walletAddress: string; otp: string }): Promise<unknown> {
  return rampCall('onramp/mobile-money/verify-otp', {
    wallet_address: input.walletAddress,
    merchant_reference: input.merchantReference,
    otp: input.otp,
  });
}

/** Real deposit instructions for the NGN bank-transfer onramp rail — the
 * shape frontend/apps/app's own `PublicBankDepositInstructions` type uses,
 * confirmed against its `NgnBankDepositPanel.tsx` (bank name, account
 * number, account name, amount, optional expiry — nothing else). */
export type BankDepositInstructions = {
  bankName: string;
  accountNumber: string;
  accountName: string;
  amount: string;
  expiresAt: string | null;
};

/** Confirms an onramp and, for the bank-transfer rail (NGN today), gets
 * back a real Morapay/provider deposit account to show the user — there's
 * no user-provided payment detail for this rail at all; the user pays by
 * wiring money to the account this returns. `bankDeposit` is `null` for
 * any rail that doesn't work this way (e.g. GHS, which charges over
 * mobile money via `startOnrampMobileMoney` instead and never calls this). */
export function confirmOnramp(input: {
  merchantReference: string;
  walletAddress: string;
}): Promise<{ transaction: PublicRampTransaction; bankDeposit: BankDepositInstructions | null }> {
  return rampCall(`onramp/${encodeURIComponent(input.merchantReference)}/confirm`, {
    wallet_address: input.walletAddress,
  });
}

export function initiateOfframp(input: {
  currency: string;
  tokenAmount: string;
  walletAddress: string;
  customerName?: string;
}): Promise<PublicRampTransaction> {
  return rampCall('offramp/initiate', {
    currency: input.currency,
    token_amount: input.tokenAmount,
    wallet_address: input.walletAddress,
    customer_name: input.customerName,
    client_channel: 'browser',
  });
}

export function setOfframpPayoutAccount(input: {
  merchantReference: string;
  walletAddress: string;
  bankCode: string;
  accountNumber: string;
  currency: string;
}): Promise<{ transaction: PublicRampTransaction; accountName?: string | null }> {
  return rampCall(`offramp/${encodeURIComponent(input.merchantReference)}/payout-account`, {
    wallet_address: input.walletAddress,
    bank_code: input.bankCode,
    account_number: input.accountNumber,
    currency: input.currency,
  });
}

export function confirmOfframp(input: {
  merchantReference: string;
  walletAddress: string;
}): Promise<{ transaction: PublicRampTransaction; depositAddress: string | null; depositNetwork: string | null }> {
  return rampCall(`offramp/${encodeURIComponent(input.merchantReference)}/confirm`, {
    wallet_address: input.walletAddress,
  });
}

/** After the user's deposit lands on the hub — forward the sized sell to
 * the fiat-payout provider + fee to treasury. Best-effort: the real app
 * retries this from its poll loop rather than treating a failure here as
 * fatal, since the hub may not have seen the deposit confirm yet. */
export function forwardOfframpHub(input: { merchantReference: string; walletAddress: string }): Promise<unknown> {
  return rampCall(`offramp/${encodeURIComponent(input.merchantReference)}/hub-forward`, {
    wallet_address: input.walletAddress,
  });
}

export function getRampTransaction(input: { merchantReference: string; walletAddress: string }): Promise<PublicRampTransaction> {
  return apiGet<PublicRampTransaction>(`/api/public/ramp/transactions/${encodeURIComponent(input.merchantReference)}`, {
    wallet_address: input.walletAddress,
  });
}

/** Matches `isRampFullySettled` in the real app's client-ramp-corridor.ts —
 * a HUB_SWAP-settled transaction isn't done until the onward distribution
 * (buying the target token and sending it out) also completes. */
export function isRampFullySettled(transaction: Pick<PublicRampTransaction, 'status' | 'settlementMode' | 'distributionStatus'>): boolean {
  const status = (transaction.status ?? '').toUpperCase();
  if (status === 'FAILED' || status === 'CANCELLED') return true;
  if (status !== 'COMPLETED') return false;
  const mode = (transaction.settlementMode ?? 'DIRECT').toUpperCase();
  if (mode !== 'HUB_SWAP') return true;
  const distribution = (transaction.distributionStatus ?? 'NONE').toUpperCase();
  return distribution === 'COMPLETED';
}
