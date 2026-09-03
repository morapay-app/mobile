import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { loadTransactions, saveTransactions } from './transactionStorage';
import { PIPELINE_STEP_ORDER, TERMINAL_STATUSES, type SwapTransaction, type TransactionStatus } from './types';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TICK_MS = 1000;

function makeId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Elapsed-time-driven mock status, rather than a chain of `setTimeout`s
 * advancing a stored status: deriving status from wall-clock progress means
 * a transaction picks up exactly where it should even after the app was
 * closed and reopened mid-wait — re-hydrating from AsyncStorage only needs
 * to restore `startTime`/`estimatedCompletionTime`, not an independently
 * ticking timer that would otherwise have to survive the app being killed. */
export function statusForElapsed(startTime: number, estimatedCompletionTime: number, now: number): TransactionStatus {
  const total = estimatedCompletionTime - startTime;
  if (total <= 0) return 'COMPLETED';
  const fraction = (now - startTime) / total;
  if (fraction >= 1) return 'COMPLETED';
  const stepIndex = Math.min(PIPELINE_STEP_ORDER.length - 1, Math.floor(fraction * PIPELINE_STEP_ORDER.length));
  return PIPELINE_STEP_ORDER[stepIndex];
}

export type StartTransactionInput = {
  amount: number;
  cryptoType: string;
  fiatType: string;
  /** Defaults to 5 minutes — override only for the dev simulator's
   * fast-forward demo runs (see DevTransactionSimulator, temporary). */
  durationMs?: number;
};

type TransactionStoreValue = {
  transactions: SwapTransaction[];
  /** Everything not yet `COMPLETED`/`FAILED` — what the pill and the
   * sheet's main list actually render. */
  activeTransactions: SwapTransaction[];
  /** False until AsyncStorage has been read once — see the hydration
   * effect below for why nothing should be saved before this flips. */
  hydrated: boolean;
  startTransaction: (input: StartTransactionInput) => string;
  removeTransaction: (id: string) => void;
  markFailed: (id: string, reason?: string) => void;
  /** Dev-only escape hatch: jumps a transaction straight to a status (or
   * completion) instead of waiting out its real timer, and hands that
   * transaction fully over to manual control from then on (see the ticker
   * effect's `skipAutoRef` check) so it doesn't snap back a second later.
   * Wired to `DevTransactionSimulator`, itself gated behind `__DEV__`. */
  devSetStatus: (id: string, status: TransactionStatus) => void;
};

const TransactionStoreContext = createContext<TransactionStoreValue | null>(null);

export function TransactionStoreProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<SwapTransaction[]>([]);
  const [hydrated, setHydrated] = useState(false);
  // Ids the automatic elapsed-time ticker should leave alone — a natural
  // terminal status (nothing left to advance), or any transaction a human
  // has taken manual control of via `devSetStatus`.
  const skipAutoRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    loadTransactions().then((stored) => {
      if (cancelled) return;
      for (const tx of stored) {
        if (TERMINAL_STATUSES.has(tx.status)) skipAutoRef.current.add(tx.id);
      }
      setTransactions(stored);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Guard against overwriting real, previously-saved transactions with
    // this component's empty initial state before the load above resolves.
    if (!hydrated) return;
    void saveTransactions(transactions);
  }, [hydrated, transactions]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTransactions((current) => {
        let changed = false;
        const next = current.map((tx) => {
          if (skipAutoRef.current.has(tx.id)) return tx;
          const status = statusForElapsed(tx.startTime, tx.estimatedCompletionTime, Date.now());
          if (status === tx.status) return tx;
          if (TERMINAL_STATUSES.has(status)) skipAutoRef.current.add(tx.id);
          changed = true;
          return { ...tx, status };
        });
        return changed ? next : current;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const startTransaction = useCallback((input: StartTransactionInput) => {
    const id = makeId();
    const startTime = Date.now();
    const estimatedCompletionTime = startTime + (input.durationMs ?? FIVE_MINUTES_MS);
    const tx: SwapTransaction = {
      id,
      amount: input.amount,
      cryptoType: input.cryptoType,
      fiatType: input.fiatType,
      startTime,
      estimatedCompletionTime,
      status: 'ON_CHAIN_CONFIRMING',
    };
    setTransactions((current) => [...current, tx]);
    return id;
  }, []);

  const removeTransaction = useCallback((id: string) => {
    skipAutoRef.current.delete(id);
    setTransactions((current) => current.filter((tx) => tx.id !== id));
  }, []);

  const markFailed = useCallback((id: string, reason?: string) => {
    skipAutoRef.current.add(id);
    setTransactions((current) => current.map((tx) => (tx.id === id ? { ...tx, status: 'FAILED', failureReason: reason } : tx)));
  }, []);

  const devSetStatus = useCallback((id: string, status: TransactionStatus) => {
    skipAutoRef.current.add(id);
    setTransactions((current) => current.map((tx) => (tx.id === id ? { ...tx, status } : tx)));
  }, []);

  const activeTransactions = useMemo(() => transactions.filter((tx) => !TERMINAL_STATUSES.has(tx.status)), [transactions]);

  const value = useMemo<TransactionStoreValue>(
    () => ({ transactions, activeTransactions, hydrated, startTransaction, removeTransaction, markFailed, devSetStatus }),
    [transactions, activeTransactions, hydrated, startTransaction, removeTransaction, markFailed, devSetStatus],
  );

  return <TransactionStoreContext.Provider value={value}>{children}</TransactionStoreContext.Provider>;
}

export function useTransactionStore(): TransactionStoreValue {
  const ctx = useContext(TransactionStoreContext);
  if (!ctx) throw new Error('useTransactionStore must be used within a TransactionStoreProvider');
  return ctx;
}
