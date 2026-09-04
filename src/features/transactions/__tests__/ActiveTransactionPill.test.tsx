import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ActiveTransactionPill } from '../ActiveTransactionPill';
import { TransactionStoreProvider, useTransactionStore } from '../TransactionStoreContext';

beforeEach(async () => {
  await AsyncStorage.clear();
});

// A tiny harness that starts transactions on demand from inside the
// provider tree — mirrors how `SwapScreen` and `DevTransactionSimulator`
// actually call `useTransactionStore()` themselves, rather than reaching
// into the store from outside its provider.
function Harness({ onReady }: { onReady: (store: ReturnType<typeof useTransactionStore>) => void }) {
  const store = useTransactionStore();
  onReady(store);
  return <ActiveTransactionPill onPress={() => {}} />;
}

describe('ActiveTransactionPill', () => {
  it('renders nothing when there are no active transactions', async () => {
    const { unmount } = await render(
      <TransactionStoreProvider>
        <ActiveTransactionPill onPress={() => {}} />
      </TransactionStoreProvider>,
    );
    try {
      expect(screen.queryByTestId('active-transaction-pill')).toBeNull();
    } finally {
      unmount();
    }
  });

  it('shows a single-transaction label with an ETA', async () => {
    let store: ReturnType<typeof useTransactionStore> | undefined;
    const { unmount } = await render(
      <TransactionStoreProvider>
        <Harness onReady={(s) => (store = s)} />
      </TransactionStoreProvider>,
    );

    try {
      await waitFor(() => expect(store?.hydrated).toBe(true));
      // Real timers back this provider's ticker — a sync `act()` here
      // deadlocks against it (React's act-flush loop never yields back to
      // the event loop the interval needs to fire), so this must be the
      // async form.
      await act(async () => {
        store!.startTransaction({ amount: 500, cryptoType: 'USDC', fiatType: 'GHS' });
      });

      await waitFor(() => expect(screen.getByTestId('active-transaction-pill-button')).toBeTruthy());
      const label = screen.getByTestId('active-transaction-pill-button').props.accessibilityLabel as string;
      expect(label).toContain('500');
      expect(label).toContain('USDC');
      expect(label).toContain('remaining');
    } finally {
      unmount();
    }
  });

  it('reads "Buying <fiat>" for an in-progress onramp, not "Swapping <crypto>"', async () => {
    let store: ReturnType<typeof useTransactionStore> | undefined;
    const { unmount } = await render(
      <TransactionStoreProvider>
        <Harness onReady={(s) => (store = s)} />
      </TransactionStoreProvider>,
    );

    try {
      await waitFor(() => expect(store?.hydrated).toBe(true));
      await act(async () => {
        store!.startTransaction({ amount: 500, cryptoType: 'ETH', fiatType: 'GHS', direction: 'onramp' });
      });

      await waitFor(() => {
        const label = screen.getByTestId('active-transaction-pill-button').props.accessibilityLabel as string;
        expect(label).toContain('Buying 500 GHS');
      });
    } finally {
      unmount();
    }
  });

  it('shows a count label once more than one transaction is active', async () => {
    let store: ReturnType<typeof useTransactionStore> | undefined;
    const { unmount } = await render(
      <TransactionStoreProvider>
        <Harness onReady={(s) => (store = s)} />
      </TransactionStoreProvider>,
    );

    try {
      await waitFor(() => expect(store?.hydrated).toBe(true));
      await act(async () => {
        store!.startTransaction({ amount: 500, cryptoType: 'USDC', fiatType: 'GHS' });
        store!.startTransaction({ amount: 20, cryptoType: 'ETH', fiatType: 'NGN' });
      });

      await waitFor(() => {
        const label = screen.getByTestId('active-transaction-pill-button').props.accessibilityLabel as string;
        expect(label).toBe('2 Active Transactions Processing…');
      });
    } finally {
      unmount();
    }
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    let store: ReturnType<typeof useTransactionStore> | undefined;

    function TapHarness() {
      store = useTransactionStore();
      return <ActiveTransactionPill onPress={onPress} />;
    }

    const { unmount } = await render(
      <TransactionStoreProvider>
        <TapHarness />
      </TransactionStoreProvider>,
    );

    try {
      await waitFor(() => expect(store?.hydrated).toBe(true));
      await act(async () => {
        store!.startTransaction({ amount: 500, cryptoType: 'USDC', fiatType: 'GHS' });
      });

      await waitFor(() => expect(screen.getByTestId('active-transaction-pill-button')).toBeTruthy());
      fireEvent.press(screen.getByTestId('active-transaction-pill-button'));
      expect(onPress).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
    }
  });
});
