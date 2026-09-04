import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getRampTransaction, isRampFullySettled } from '../../api/ramp';
import { subscribeToRampStatus, type RampStatusEvent } from '../../realtime/rampRealtime';
import { loadTransactions, saveTransactions } from './transactionStorage';
import {
  PIPELINE_STEP_ORDER,
  TERMINAL_STATUSES,
  type SwapTransaction,
  type TransactionDirection,
  type TransactionStatus,
} from './types';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TICK_MS = 1000;

// Same cadence/cap MomoSheet.tsx's own `pollRampUntilSettled` uses — this
// runs independently of that one (see the polling effect below for why),
// but there's no reason for the two to disagree on pacing.
const RAMP_POLL_INTERVAL_MS = 4000;
const RAMP_POLL_ATTEMPTS = 60;

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
  /** See `TransactionDirection`'s own doc — omitted means offramp. */
  direction?: TransactionDirection;
  /** Defaults to 5 minutes — override only for the dev simulator's
   * fast-forward demo runs (see DevTransactionSimulator, temporary). Ignored
   * once `merchantReference` is set — see `SwapTransaction`'s own doc. */
  durationMs?: number;
  /** Set by a real onramp/offramp submission (MomoSheet.tsx) to hand this
   * transaction over to real polling instead of the wall-clock demo timer —
   * see the polling effect below and `SwapTransaction`'s own doc. */
  merchantReference?: string;
  walletAddress?: string;
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
  // terminal status (nothing left to advance), a real ramp-backed
  // transaction (the polling effect below owns its status instead), or any
  // transaction a human has taken manual control of via `devSetStatus`.
  const skipAutoRef = useRef<Set<string>>(new Set());
  // Ids with an active real-ramp poll loop in flight — the sole guard that
  // loop checks each iteration to know whether to keep going (see
  // `pollRealRampTransaction`). Doubles as dedupe: the triggering effect
  // below only starts one loop per id, even though it re-runs on every
  // `transactions` change.
  const rampPollingRef = useRef<Set<string>>(new Set());
  // Ids with an active real-time push subscription — value is its own
  // unsubscribe function (see the push effect below). Separate from
  // `rampPollingRef`: push and poll are two independent mechanisms for the
  // same transaction (see `subscribeToRampStatus`'s own doc on why push is
  // additive, not a replacement), so each tracks its own "already started"
  // state; `stopRealTracking` is what tears down both together once either
  // one detects a terminal status.
  const rampPushRef = useRef<Map<string, () => void>>(new Map());

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

  // Stops BOTH real-tracking mechanisms for an id at once — called the
  // moment either one (poll or push) detects a terminal status, so reaching
  // COMPLETED/FAILED via whichever gets there first doesn't leave the other
  // one still running in the background.
  const stopRealTracking = useCallback((id: string) => {
    rampPollingRef.current.delete(id);
    const unsub = rampPushRef.current.get(id);
    if (unsub) {
      unsub();
      rampPushRef.current.delete(id);
    }
  }, []);

  // The one place a real ramp status signal (from either the poll or the
  // push path) turns into a store update — shared so the two mechanisms
  // can't silently disagree on what a given signal means.
  //
  // Status mapping only distinguishes two real intermediate signals this
  // data actually carries (same ones MomoSheet's own `copy.pending` /
  // `copy.distributionPending` branch on) — `ON_CHAIN_CONFIRMING` by
  // default, `MOMO_SETTLEMENT` once the HUB_SWAP distribution leg is
  // dispatching. `SWAP_PROCESSING` is never reached from real data: there's
  // no distinct signal for "converting" separate from those two, so this
  // doesn't fake one — a transaction may visibly skip that stepper node
  // rather than pause on a status nothing actually confirms.
  const applyRampSync = useCallback(
    (
      id: string,
      signal: { status?: string | null; distributionStatus?: string | null; settlementMode?: string | null; errorMessage?: string | null },
    ) => {
      const status = (signal.status ?? '').toUpperCase();
      if (status === 'FAILED' || status === 'CANCELLED') {
        skipAutoRef.current.add(id);
        stopRealTracking(id);
        setTransactions((current) =>
          current.map((tx) => (tx.id === id ? { ...tx, status: 'FAILED', failureReason: signal.errorMessage ?? undefined } : tx)),
        );
        return;
      }
      if (isRampFullySettled({ status: signal.status ?? '', settlementMode: signal.settlementMode, distributionStatus: signal.distributionStatus })) {
        skipAutoRef.current.add(id);
        stopRealTracking(id);
        setTransactions((current) => current.map((tx) => (tx.id === id ? { ...tx, status: 'COMPLETED' } : tx)));
        return;
      }

      const nextStatus: TransactionStatus =
        (signal.distributionStatus ?? '').toUpperCase() === 'PENDING' &&
        (signal.settlementMode ?? '').toUpperCase() === 'HUB_SWAP' &&
        status === 'COMPLETED'
          ? 'MOMO_SETTLEMENT'
          : 'ON_CHAIN_CONFIRMING';
      setTransactions((current) => current.map((tx) => (tx.id === id && tx.status !== nextStatus ? { ...tx, status: nextStatus } : tx)));
    },
    [stopRealTracking],
  );

  // Owns the real status lifecycle for a ramp-backed transaction —
  // independent of MomoSheet.tsx's own `pollRampUntilSettled` (which still
  // runs in parallel for the sheet's own in-flight UI) so the pill/sheet
  // keep updating even after MomoSheet closes or the user navigates away.
  // Deliberately a duplicate poll rather than a shared one: MomoSheet's loop
  // is already real, tested, and scoped to that component's own lifecycle
  // (stops on close, by design, so it doesn't keep signing/confirming flows
  // alive past the sheet) — reusing it here would mean either keeping it
  // alive past the sheet (changing behavior this app already relies on) or
  // threading a cross-component callback through it. Two independent polls
  // against a cheap read-only status endpoint is a small, low-risk cost
  // next to that. This is also what makes real-time push (below) safe to
  // add on top of: if a push event is missed entirely, this still gets
  // there within one poll interval regardless.
  const pollRealRampTransaction = useCallback(
    async (id: string, merchantReference: string, walletAddress: string) => {
      for (let attempt = 0; attempt < RAMP_POLL_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, RAMP_POLL_INTERVAL_MS));
        if (!rampPollingRef.current.has(id)) return; // removed, or already resolved

        try {
          const transaction = await getRampTransaction({ merchantReference, walletAddress });
          if (!rampPollingRef.current.has(id)) return;
          applyRampSync(id, transaction);
        } catch {
          // Keep polling through a transient error — same as MomoSheet's own loop.
        }
      }

      if (!rampPollingRef.current.has(id)) return;
      skipAutoRef.current.add(id);
      stopRealTracking(id);
      setTransactions((current) =>
        current.map((tx) => (tx.id === id ? { ...tx, status: 'FAILED', failureReason: 'This is taking longer than usual.' } : tx)),
      );
    },
    [applyRampSync, stopRealTracking],
  );

  // Starts real polling for any active, ramp-backed transaction that
  // doesn't have a loop running yet — `rampPollingRef` is what keeps this
  // idempotent across the re-runs a `transactions` change triggers.
  useEffect(() => {
    for (const tx of transactions) {
      if (!tx.merchantReference || !tx.walletAddress) continue;
      if (TERMINAL_STATUSES.has(tx.status)) continue;
      if (rampPollingRef.current.has(tx.id)) continue;
      rampPollingRef.current.add(tx.id);
      void pollRealRampTransaction(tx.id, tx.merchantReference, tx.walletAddress);
    }
  }, [transactions, pollRealRampTransaction]);

  // Real-time push (Tier 2) — additive to the polling above, see
  // `subscribeToRampStatus`'s own doc for why neither mechanism depends on
  // the other to work. A no-op subscribe (and thus a no-op effect) when
  // Pusher isn't configured.
  useEffect(() => {
    for (const tx of transactions) {
      if (!tx.merchantReference || !tx.walletAddress) continue;
      if (TERMINAL_STATUSES.has(tx.status)) continue;
      if (rampPushRef.current.has(tx.id)) continue;
      const id = tx.id;
      const unsubscribe = subscribeToRampStatus(tx.merchantReference, tx.walletAddress, (event: RampStatusEvent) => {
        if (!rampPushRef.current.has(id)) return; // already resolved via the other path
        applyRampSync(id, event);
      });
      rampPushRef.current.set(id, unsubscribe);
    }
  }, [transactions, applyRampSync]);

  const startTransaction = useCallback((input: StartTransactionInput) => {
    const id = makeId();
    const startTime = Date.now();
    const estimatedCompletionTime = startTime + (input.durationMs ?? FIVE_MINUTES_MS);
    const tx: SwapTransaction = {
      id,
      amount: input.amount,
      cryptoType: input.cryptoType,
      fiatType: input.fiatType,
      direction: input.direction,
      startTime,
      estimatedCompletionTime,
      status: 'ON_CHAIN_CONFIRMING',
      merchantReference: input.merchantReference,
      walletAddress: input.walletAddress,
    };
    // A real ramp-backed transaction is never driven by the elapsed-time
    // ticker, not even for the few seconds before its first real poll
    // response — see `SwapTransaction`'s own doc.
    if (input.merchantReference) skipAutoRef.current.add(id);
    setTransactions((current) => [...current, tx]);
    return id;
  }, []);

  const removeTransaction = useCallback(
    (id: string) => {
      skipAutoRef.current.delete(id);
      stopRealTracking(id);
      setTransactions((current) => current.filter((tx) => tx.id !== id));
    },
    [stopRealTracking],
  );

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
