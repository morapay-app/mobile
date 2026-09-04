import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TransactionProgressSheet } from '../TransactionProgressSheet';
import { TransactionStoreProvider, useTransactionStore } from '../TransactionStoreContext';

// TransactionProgressSheet renders through SheetShell, which reads
// `useSafeAreaInsets()` — throws without a `SafeAreaProvider` ancestor
// (same setup MomoSheet.test.tsx uses).
const testMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

// Mirrors ActiveTransactionPill.test.tsx's own harness pattern — starts/
// controls transactions from inside the provider tree.
function Harness({ onReady }: { onReady: (store: ReturnType<typeof useTransactionStore>) => void }) {
  const store = useTransactionStore();
  onReady(store);
  return <TransactionProgressSheet visible onClose={() => {}} />;
}

function renderSheet(onReady: (store: ReturnType<typeof useTransactionStore>) => void) {
  return render(
    <SafeAreaProvider initialMetrics={testMetrics}>
      <TransactionStoreProvider>
        <Harness onReady={onReady} />
      </TransactionStoreProvider>
    </SafeAreaProvider>,
  );
}

describe('TransactionProgressSheet — cancel affordance', () => {
  it('offers Cancel Transaction while still on the first (reversible) pipeline step', async () => {
    let store: ReturnType<typeof useTransactionStore> | undefined;
    const { unmount } = await renderSheet((s) => (store = s));

    try {
      await waitFor(() => expect(store?.hydrated).toBe(true));
      let id = '';
      await act(async () => {
        id = store!.startTransaction({ amount: 500, cryptoType: 'USDC', fiatType: 'GHS' });
      });

      await waitFor(() => expect(screen.getByTestId(`transaction-cancel-${id}`)).toBeTruthy());
    } finally {
      unmount();
    }
  });

  it('hides Cancel Transaction once past the first step — nothing left this app can honestly undo', async () => {
    let store: ReturnType<typeof useTransactionStore> | undefined;
    const { unmount } = await renderSheet((s) => (store = s));

    try {
      await waitFor(() => expect(store?.hydrated).toBe(true));
      let id = '';
      await act(async () => {
        id = store!.startTransaction({ amount: 500, cryptoType: 'USDC', fiatType: 'GHS' });
      });
      await waitFor(() => expect(screen.getByTestId(`transaction-cancel-${id}`)).toBeTruthy());

      await act(async () => {
        store!.devSetStatus(id, 'SWAP_PROCESSING');
      });

      expect(screen.queryByTestId(`transaction-cancel-${id}`)).toBeNull();
    } finally {
      unmount();
    }
  });

  it('pressing Cancel Transaction marks it failed rather than silently deleting it', async () => {
    let store: ReturnType<typeof useTransactionStore> | undefined;
    const { unmount } = await renderSheet((s) => (store = s));

    try {
      await waitFor(() => expect(store?.hydrated).toBe(true));
      let id = '';
      await act(async () => {
        id = store!.startTransaction({ amount: 500, cryptoType: 'USDC', fiatType: 'GHS' });
      });
      await waitFor(() => expect(screen.getByTestId(`transaction-cancel-${id}`)).toBeTruthy());

      await act(async () => {
        fireEvent.press(screen.getByTestId(`transaction-cancel-${id}`));
      });

      const tx = store!.transactions.find((t) => t.id === id);
      expect(tx?.status).toBe('FAILED');
      expect(tx?.failureReason).toBe('Cancelled by user');
    } finally {
      unmount();
    }
  });
});
