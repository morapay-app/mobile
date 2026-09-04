import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The poll effect (Tier 1) fires alongside the push effect (Tier 2)
// whenever a ramp-backed transaction exists — never called in these tests
// (fake timers keep its 4s interval from ever actually firing), but it has
// to resolve to *something* rather than hitting a real network call.
const mockGetRampTransaction = jest.fn();
jest.mock('../../../api/ramp', () => ({
  getRampTransaction: (...args: unknown[]) => mockGetRampTransaction(...args),
  isRampFullySettled: (transaction: { status?: string; settlementMode?: string | null; distributionStatus?: string | null }) => {
    const status = (transaction.status ?? '').toUpperCase();
    if (status === 'FAILED' || status === 'CANCELLED') return true;
    if (status !== 'COMPLETED') return false;
    const mode = (transaction.settlementMode ?? 'DIRECT').toUpperCase();
    if (mode !== 'HUB_SWAP') return true;
    return (transaction.distributionStatus ?? 'NONE').toUpperCase() === 'COMPLETED';
  },
}));

// Captures the callback `TransactionStoreContext` hands to
// `subscribeToRampStatus` so tests can simulate a real push event by just
// calling it directly — no real Pusher socket involved.
let capturedPushHandlers: Record<string, (event: unknown) => void> = {};
const mockUnsubscribe = jest.fn();
const mockSubscribeToRampStatus = jest.fn((merchantReference: string, _walletAddress: string, onStatus: (event: unknown) => void) => {
  capturedPushHandlers[merchantReference] = onStatus;
  return mockUnsubscribe;
});
jest.mock('../../../realtime/rampRealtime', () => ({
  subscribeToRampStatus: (...args: [string, string, (event: unknown) => void]) => mockSubscribeToRampStatus(...args),
}));

import { TransactionStoreProvider, useTransactionStore, statusForElapsed } from '../TransactionStoreContext';

const STORAGE_KEY = 'morapay:swap-transactions';

function wrapper({ children }: { children: ReactNode }) {
  return <TransactionStoreProvider>{children}</TransactionStoreProvider>;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  capturedPushHandlers = {};
  mockSubscribeToRampStatus.mockClear();
  mockUnsubscribe.mockClear();
  mockGetRampTransaction.mockReset().mockResolvedValue({ status: 'PENDING' });
});

describe('statusForElapsed (the mock-polling engine)', () => {
  const start = 0;
  const end = 3000; // a 3-unit window: [0,1000) -> step 0, [1000,2000) -> step 1, [2000,3000) -> step 2, >=3000 -> COMPLETED

  it('starts at the first pipeline step', () => {
    expect(statusForElapsed(start, end, start)).toBe('ON_CHAIN_CONFIRMING');
  });

  it('moves to the second step once a third of the window has elapsed', () => {
    expect(statusForElapsed(start, end, 1000)).toBe('SWAP_PROCESSING');
  });

  it('moves to the third step for the final third of the window', () => {
    expect(statusForElapsed(start, end, 2500)).toBe('MOMO_SETTLEMENT');
  });

  it('completes once the full window has elapsed, and treats overshoot the same way', () => {
    expect(statusForElapsed(start, end, 3000)).toBe('COMPLETED');
    expect(statusForElapsed(start, end, 999_999)).toBe('COMPLETED');
  });

  it('is what a real app restart mid-wait relies on: pure function of elapsed time, no stored ticker state needed', () => {
    // Same inputs, called independently twice (as re-hydrating from
    // AsyncStorage after an app restart effectively does) — must agree.
    expect(statusForElapsed(1000, 6000, 4200)).toBe(statusForElapsed(1000, 6000, 4200));
  });
});

describe('TransactionStoreContext', () => {
  it('starts a transaction as ON_CHAIN_CONFIRMING and lists it as active', async () => {
    const { result, unmount } = await renderHook(() => useTransactionStore(), { wrapper });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      await act(async () => {
        result.current.startTransaction({ amount: 500, cryptoType: 'USDC', fiatType: 'GHS' });
      });

      expect(result.current.transactions).toHaveLength(1);
      expect(result.current.transactions[0].status).toBe('ON_CHAIN_CONFIRMING');
      expect(result.current.activeTransactions).toHaveLength(1);
    } finally {
      unmount();
    }
  });

  it('hydrates a previously-stored transaction from AsyncStorage on mount', async () => {
    const stored = [
      {
        id: 'tx_stored',
        amount: 250,
        cryptoType: 'USDC',
        fiatType: 'NGN',
        startTime: Date.now() - 60_000,
        estimatedCompletionTime: Date.now() + 4 * 60_000,
        status: 'SWAP_PROCESSING',
      },
    ];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result, unmount } = await renderHook(() => useTransactionStore(), { wrapper });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));
      expect(result.current.transactions.map((tx) => tx.id)).toContain('tx_stored');
    } finally {
      unmount();
    }
  });

  it('does not overwrite stored transactions with an empty array before hydration resolves', async () => {
    const stored = [
      {
        id: 'tx_keep_me',
        amount: 100,
        cryptoType: 'USDC',
        fiatType: 'GHS',
        startTime: Date.now(),
        estimatedCompletionTime: Date.now() + 5 * 60_000,
        status: 'ON_CHAIN_CONFIRMING',
      },
    ];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result, unmount } = await renderHook(() => useTransactionStore(), { wrapper });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      // The provider's save effect only fires after hydration (guarded on
      // `hydrated`) — if that guard were missing, the empty initial state
      // would have already clobbered this before hydration ever read it back.
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const persisted = JSON.parse(raw ?? '[]') as Array<{ id: string }>;
      expect(persisted.map((tx) => tx.id)).toContain('tx_keep_me');
    } finally {
      unmount();
    }
  });

  it('persists a newly-started transaction to AsyncStorage', async () => {
    const { result, unmount } = await renderHook(() => useTransactionStore(), { wrapper });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      await act(async () => {
        result.current.startTransaction({ amount: 500, cryptoType: 'USDC', fiatType: 'GHS' });
      });

      await waitFor(async () => {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const persisted = JSON.parse(raw ?? '[]') as Array<{ amount: number }>;
        expect(persisted.some((tx) => tx.amount === 500)).toBe(true);
      });
    } finally {
      unmount();
    }
  });

  it('devSetStatus jumps a transaction straight to the requested status', async () => {
    const { result, unmount } = await renderHook(() => useTransactionStore(), { wrapper });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      let id = '';
      await act(async () => {
        id = result.current.startTransaction({ amount: 10, cryptoType: 'USDC', fiatType: 'GHS' });
      });
      await act(async () => {
        result.current.devSetStatus(id, 'MOMO_SETTLEMENT');
      });

      expect(result.current.transactions.find((tx) => tx.id === id)?.status).toBe('MOMO_SETTLEMENT');
    } finally {
      unmount();
    }
  });

  it('devSetStatus to a terminal status removes the transaction from activeTransactions', async () => {
    const { result, unmount } = await renderHook(() => useTransactionStore(), { wrapper });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      let id = '';
      await act(async () => {
        id = result.current.startTransaction({ amount: 10, cryptoType: 'USDC', fiatType: 'GHS' });
      });
      await act(async () => {
        result.current.devSetStatus(id, 'COMPLETED');
      });

      expect(result.current.activeTransactions.find((tx) => tx.id === id)).toBeUndefined();
      expect(result.current.transactions.find((tx) => tx.id === id)?.status).toBe('COMPLETED');
    } finally {
      unmount();
    }
  });

  it('removeTransaction drops it from the list entirely', async () => {
    const { result, unmount } = await renderHook(() => useTransactionStore(), { wrapper });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      let id = '';
      await act(async () => {
        id = result.current.startTransaction({ amount: 10, cryptoType: 'USDC', fiatType: 'GHS' });
      });
      await act(async () => {
        result.current.removeTransaction(id);
      });

      expect(result.current.transactions.find((tx) => tx.id === id)).toBeUndefined();
    } finally {
      unmount();
    }
  });
});

describe('real-time push (Tier 2)', () => {
  // Fake timers throughout this block — the poll effect (Tier 1) runs
  // alongside push for the same transaction, and its real 4s/attempt
  // interval has no business actually elapsing in a unit test. Cleaning up
  // each transaction (via a push event, or an explicit removeTransaction)
  // before `unmount()` matters here specifically because these tests never
  // advance timers at all — an unresolved ramp-backed transaction's poll
  // loop would otherwise sit forever on its first real `setTimeout`, which
  // is harmless with fake timers but is exactly the shape of bug that hangs
  // a real-timer run.
  it('subscribes to the real-time channel for a ramp-backed transaction, not the wall-clock demo one', async () => {
    jest.useFakeTimers();
    const { result, unmount } = await renderHook(() => useTransactionStore(), { wrapper });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      let realId = '';
      await act(async () => {
        realId = result.current.startTransaction({
          amount: 25,
          cryptoType: 'USDC',
          fiatType: 'GHS',
          merchantReference: 'ref-1',
          walletAddress: '0xWALLET',
        });
      });

      expect(mockSubscribeToRampStatus).toHaveBeenCalledWith('ref-1', '0xWALLET', expect.any(Function));

      // A plain demo transaction (DevTransactionSimulator's own case) has no
      // merchant reference — never subscribed to anything real.
      await act(async () => {
        result.current.startTransaction({ amount: 10, cryptoType: 'USDC', fiatType: 'GHS' });
      });
      expect(mockSubscribeToRampStatus).toHaveBeenCalledTimes(1);

      await act(async () => {
        result.current.removeTransaction(realId);
      });
    } finally {
      unmount();
      jest.useRealTimers();
    }
  });

  it('applies a pushed status change to the tracked transaction', async () => {
    jest.useFakeTimers();
    const { result, unmount } = await renderHook(() => useTransactionStore(), { wrapper });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      let id = '';
      await act(async () => {
        id = result.current.startTransaction({
          amount: 25,
          cryptoType: 'USDC',
          fiatType: 'GHS',
          merchantReference: 'ref-2',
          walletAddress: '0xWALLET',
        });
      });
      expect(result.current.transactions.find((tx) => tx.id === id)?.status).toBe('ON_CHAIN_CONFIRMING');

      await act(async () => {
        capturedPushHandlers['ref-2']({
          merchantReference: 'ref-2',
          status: 'COMPLETED',
          settlementMode: 'HUB_SWAP',
          distributionStatus: 'PENDING',
        });
      });

      expect(result.current.transactions.find((tx) => tx.id === id)?.status).toBe('MOMO_SETTLEMENT');
      // Not yet terminal (MOMO_SETTLEMENT isn't COMPLETED/FAILED) — still
      // real-tracked, so clean it up before unmount same as the other tests.
      await act(async () => {
        result.current.removeTransaction(id);
      });
    } finally {
      unmount();
      jest.useRealTimers();
    }
  });

  it('a pushed FAILED status sets failureReason and unsubscribes', async () => {
    jest.useFakeTimers();
    const { result, unmount } = await renderHook(() => useTransactionStore(), { wrapper });
    try {
      await waitFor(() => expect(result.current.hydrated).toBe(true));

      let id = '';
      await act(async () => {
        id = result.current.startTransaction({
          amount: 25,
          cryptoType: 'USDC',
          fiatType: 'GHS',
          merchantReference: 'ref-3',
          walletAddress: '0xWALLET',
        });
      });

      await act(async () => {
        capturedPushHandlers['ref-3']({ merchantReference: 'ref-3', status: 'FAILED', errorMessage: 'Charge declined.' });
      });

      const tx = result.current.transactions.find((t) => t.id === id);
      expect(tx?.status).toBe('FAILED');
      expect(tx?.failureReason).toBe('Charge declined.');
      expect(result.current.activeTransactions).toHaveLength(0);
      expect(mockUnsubscribe).toHaveBeenCalled();
    } finally {
      unmount();
      jest.useRealTimers();
    }
  });
});
