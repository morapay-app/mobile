export type TransactionStatus = 'ON_CHAIN_CONFIRMING' | 'SWAP_PROCESSING' | 'MOMO_SETTLEMENT' | 'COMPLETED' | 'FAILED';

export type SwapTransaction = {
  id: string;
  amount: number;
  cryptoType: string;
  fiatType: string;
  /** Epoch ms. */
  startTime: number;
  /** Epoch ms — `startTime` plus the expected settlement window (5 minutes
   * for a real transaction; shorter for the dev simulator's demo runs). */
  estimatedCompletionTime: number;
  status: TransactionStatus;
  /** Only set once `status === 'FAILED'`. */
  failureReason?: string;
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
 * whichever fiat currency the transaction actually settles in. */
export function pipelineStepLabel(step: PipelineStepStatus, fiatType: string): string {
  switch (step) {
    case 'ON_CHAIN_CONFIRMING':
      return 'On-Chain Confirmation';
    case 'SWAP_PROCESSING':
      return `Converting to ${fiatType}`;
    case 'MOMO_SETTLEMENT':
      return 'Mobile Money Settlement';
  }
}
