export type TransactionStatus = 'ON_CHAIN_CONFIRMING' | 'SWAP_PROCESSING' | 'MOMO_SETTLEMENT' | 'COMPLETED' | 'FAILED';

/** Which way money's moving. Undefined means offramp — every transaction
 * before this field existed (and the dev simulator, which never sets it)
 * was offramp-shaped, so that's the safe default rather than requiring a
 * migration. */
export type TransactionDirection = 'onramp' | 'offramp';

export type SwapTransaction = {
  id: string;
  amount: number;
  cryptoType: string;
  fiatType: string;
  /** See `TransactionDirection`'s own doc for the default. */
  direction?: TransactionDirection;
  /** Epoch ms. */
  startTime: number;
  /** Epoch ms — `startTime` plus the expected settlement window (5 minutes
   * for a real transaction; shorter for the dev simulator's demo runs). Only
   * actually drives status for a transaction with no `merchantReference`
   * (see below) — once one's present, real poll results own `status`
   * instead, and this field stops being read. */
  estimatedCompletionTime: number;
  status: TransactionStatus;
  /** Only set once `status === 'FAILED'`. */
  failureReason?: string;
  /** Presence of these two is what tells `TransactionStoreContext` this is a
   * REAL, backend-tracked ramp transaction rather than a wall-clock demo —
   * see its own doc for why that's the discriminator. Set once, at
   * `startTransaction` time, by `MomoSheet.tsx`'s real onramp/offramp
   * submission (never by `DevTransactionSimulator`, which has no real
   * merchant reference to poll). */
  merchantReference?: string;
  walletAddress?: string;
};

export const TERMINAL_STATUSES: ReadonlySet<TransactionStatus> = new Set(['COMPLETED', 'FAILED']);

/** The three real pipeline stages, in order — a transaction's `status`
 * while in flight is always one of these; `COMPLETED`/`FAILED` are
 * terminal and sit outside the stepper. */
export type PipelineStepStatus = Extract<TransactionStatus, 'ON_CHAIN_CONFIRMING' | 'SWAP_PROCESSING' | 'MOMO_SETTLEMENT'>;

export const PIPELINE_STEP_ORDER: readonly PipelineStepStatus[] = ['ON_CHAIN_CONFIRMING', 'SWAP_PROCESSING', 'MOMO_SETTLEMENT'];

/** Index into `PIPELINE_STEP_ORDER`, or -1 for a terminal status (the
 * stepper doesn't render for those — see TransactionProgressSheet). */
export function pipelineStepIndex(status: TransactionStatus): number {
  return PIPELINE_STEP_ORDER.indexOf(status as PipelineStepStatus);
}

/** "Converting to Cedis" in the spec is GHS-specific phrasing — this app
 * quotes GHS, NGN, and BOB (see swap/data/tokens.ts), so the label names
 * whichever fiat currency the transaction actually settles in.
 *
 * Offramp (crypto -> fiat) and onramp (fiat -> crypto) go through the same
 * three status values, but they mean opposite things at each step — an
 * onramp's "on-chain confirmation" step is really the fiat payment clearing,
 * and its last step is crypto landing in the user's wallet rather than a
 * mobile money payout. `cryptoType` only matters for the onramp branch. */
export function pipelineStepLabel(
  step: PipelineStepStatus,
  params: { direction?: TransactionDirection; fiatType: string; cryptoType?: string },
): string {
  const { direction = 'offramp', fiatType, cryptoType = '' } = params;
  if (direction === 'onramp') {
    switch (step) {
      case 'ON_CHAIN_CONFIRMING':
        return 'Confirming Payment';
      case 'SWAP_PROCESSING':
        return `Converting to ${cryptoType}`;
      case 'MOMO_SETTLEMENT':
        return `Sending ${cryptoType} to Your Wallet`;
    }
  }
  switch (step) {
    case 'ON_CHAIN_CONFIRMING':
      return 'On-Chain Confirmation';
    case 'SWAP_PROCESSING':
      return `Converting to ${fiatType}`;
    case 'MOMO_SETTLEMENT':
      return 'Mobile Money Settlement';
  }
}

/** Which of a transaction's two currency fields is the one the user paid
 * with vs. received, direction-aware — offramp pays crypto and receives
 * fiat; onramp pays fiat and receives crypto. `amount` is always in the
 * "pay" currency (see `MomoSheet.tsx`'s own `amount` prop doc). */
export function transactionPaySymbol(tx: Pick<SwapTransaction, 'direction' | 'cryptoType' | 'fiatType'>): string {
  return tx.direction === 'onramp' ? tx.fiatType : tx.cryptoType;
}

export function transactionReceiveSymbol(tx: Pick<SwapTransaction, 'direction' | 'cryptoType' | 'fiatType'>): string {
  return tx.direction === 'onramp' ? tx.cryptoType : tx.fiatType;
}
