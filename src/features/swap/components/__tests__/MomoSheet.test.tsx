import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TransactionStoreProvider, useTransactionStore } from '../../../transactions/TransactionStoreContext';

// MomoSheet now reads `useSafeAreaInsets()` (for the home-indicator inset —
// see AGENTS.md's edge-to-edge UI requirement), which throws without a
// `SafeAreaProvider` ancestor.
const testMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// Real account-name lookup (`/api/public/validate/momo`) is mocked here —
// these tests aren't the place to exercise network I/O. Outcome is keyed
// off the phone number actually typed, same convention the rest of this
// suite uses for network detection: a resolvable prefix -> a canned name,
// a specific "known-bad" number -> a failed lookup, anything incomplete or
// unrecognized -> idle (matches the real hook never firing in that case).
jest.mock('../../useValidateMomo', () => ({
  useValidateMomo: (phone: string, network: string | null | undefined) => {
    const digits = phone.replace(/\D/g, '');
    const complete = digits.length === 10; // "0" + 9 local digits
    if (!network || !complete) return { accountName: null, loading: false, failed: false };
    if (digits === '0249999999') return { accountName: null, loading: false, failed: true };
    if (digits === '0241111111') return { accountName: null, loading: true, failed: false };
    return { accountName: 'Ama Mensah', loading: false, failed: false };
  },
}));

// Real onramp/offramp execution (`/api/public/ramp/*`) is mocked here —
// these tests exercise MomoSheet's state machine, not network I/O.
// `mockRampApi.*` are plain jest.fn()s each test configures via
// mockResolvedValueOnce/mockRejectedValueOnce; `isRampFullySettled` is
// re-implemented rather than mocked since it's pure logic the real module
// also just exports directly.
const mockRampApi = {
  initiateOnramp: jest.fn(),
  startOnrampMobileMoney: jest.fn(),
  verifyOnrampOtp: jest.fn(),
  confirmOnramp: jest.fn(),
  initiateOfframp: jest.fn(),
  setOfframpPayoutAccount: jest.fn(),
  confirmOfframp: jest.fn(),
  forwardOfframpHub: jest.fn(),
  getRampTransaction: jest.fn(),
};
jest.mock('../../../../api/ramp', () => ({
  initiateOnramp: (...args: unknown[]) => mockRampApi.initiateOnramp(...args),
  startOnrampMobileMoney: (...args: unknown[]) => mockRampApi.startOnrampMobileMoney(...args),
  verifyOnrampOtp: (...args: unknown[]) => mockRampApi.verifyOnrampOtp(...args),
  confirmOnramp: (...args: unknown[]) => mockRampApi.confirmOnramp(...args),
  initiateOfframp: (...args: unknown[]) => mockRampApi.initiateOfframp(...args),
  setOfframpPayoutAccount: (...args: unknown[]) => mockRampApi.setOfframpPayoutAccount(...args),
  confirmOfframp: (...args: unknown[]) => mockRampApi.confirmOfframp(...args),
  forwardOfframpHub: (...args: unknown[]) => mockRampApi.forwardOfframpHub(...args),
  getRampTransaction: (...args: unknown[]) => mockRampApi.getRampTransaction(...args),
  isRampFullySettled: (transaction: { status?: string; settlementMode?: string; distributionStatus?: string }) => {
    const status = (transaction.status ?? '').toUpperCase();
    if (status === 'FAILED' || status === 'CANCELLED') return true;
    if (status !== 'COMPLETED') return false;
    const mode = (transaction.settlementMode ?? 'DIRECT').toUpperCase();
    if (mode !== 'HUB_SWAP') return true;
    return (transaction.distributionStatus ?? 'NONE').toUpperCase() === 'COMPLETED';
  },
}));

// Real on-chain send (`useRampDepositSend.web.ts`) pulls in
// `@dynamic-labs/sdk-react-core`, which reads `window.location` at import
// time — same reason `useSwapExecution` needed a mock in SwapScreen's own
// tests. Mocked here so these tests can control resolve/reject timing
// without a wallet.
const mockSendToRampDepositAddress = jest.fn();
jest.mock('../../useRampDepositSend', () => ({
  useRampDepositSend: () => ({ sendToRampDepositAddress: (...args: unknown[]) => mockSendToRampDepositAddress(...args) }),
}));

// Real institution list (`/api/public/ramp/banks`) — mocked with realistic
// data rather than the codes MomoSheet used to guess at: MTN and Vodafone
// each resolve to exactly one real Quidax institution (unambiguous), while
// Airtel and Tigo are kept as two SEPARATE entries on purpose — that's
// what actually forces the "which network?" disambiguation UI to appear
// for the merged AirtelTigo brand, the regression this whole rewrite
// exists to cover. `mockRampBanksState` is a plain mutable object (same
// convention as `mockSwapQuoteResult` elsewhere in this suite) — most
// tests never need to touch it.
let mockRampBanksState: { mobileMoney: { code: string; name: string }[]; banks: { code: string; name: string }[]; loading: boolean } = {
  mobileMoney: [
    { code: '0004', name: 'MTN Mobile Money' },
    { code: '0006', name: 'Vodafone Cash' },
    { code: '0005', name: 'AirtelGh' },
    { code: '0009', name: 'Tigo Cash' },
  ],
  banks: [
    { code: '000013', name: 'GTBank' },
    { code: '000014', name: 'Access Bank' },
  ],
  loading: false,
};
jest.mock('../../useRampBanks', () => ({
  useRampBanks: () => mockRampBanksState,
}));

import { MomoSheet } from '../MomoSheet';
import { GHS_MOMO_TOKEN, type SwapToken } from '../../data/tokens';

// A standalone fixture rather than aliasing SwapScreen's own
// DEFAULT_FROM_TOKEN/DEFAULT_TO_TOKEN — this suite's "ETH" needs to stay
// exactly Ethereum mainnet regardless of which pair the swap card defaults
// to, since several assertions below check real chain/address values.
const ETH: SwapToken = {
  id: 'eth-native',
  symbol: 'ETH',
  name: 'Ethereum',
  chainName: 'Ethereum',
  chainId: '1',
  address: 'native',
  logoUri: 'https://example.com/eth.png',
  type: 'crypto',
  decimals: 18,
};
const GHS = GHS_MOMO_TOKEN;
// The fixed offramp settlement corridor (see rampCorridor.ts) — matched by
// exact contract address, so this has to be the real one, not just any
// "USDC on Base"-looking fixture.
const USDC_BASE: SwapToken = {
  id: 'usdc-base',
  symbol: 'USDC',
  name: 'USDC',
  chainName: 'Base',
  chainId: '8453',
  address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  logoUri: 'https://example.com/usdc-base.png',
  type: 'crypto',
  decimals: 6,
};
const WALLET_ADDRESS = '0x2222222222222222222222222222222222222222';
const NGN_MOMO_TOKEN: SwapToken = {
  id: 'ngn-momo',
  symbol: 'NGN',
  name: 'Nigerian Naira (Bank Transfer)',
  chainName: 'Bank Transfer',
  chainId: '',
  address: 'native',
  logoUri: 'https://example.com/ng.png',
  type: 'fiat',
  decimals: 2,
};

// Every real chain-variant of ETH this suite exercises the network picker
// with — a second Ethereum-mainnet-style entry plus USDC_BASE (also USDC,
// different symbol, irrelevant to ETH's own variant list) already covers
// "only ETH's own chains show up, not every token."
const ETH_ARBITRUM: SwapToken = { ...ETH, id: 'eth-arbitrum', chainName: 'Arbitrum', chainId: '42161' };

// Exposes the same TransactionStoreProvider instance MomoSheet itself reads
// from, so tests can assert on `activeTransactions` directly instead of only
// inferring it from the sheet's own UI — same pattern
// ActiveTransactionPill.test.tsx's own `Harness` uses.
let capturedStore: ReturnType<typeof useTransactionStore> | undefined;
function StoreCapture() {
  capturedStore = useTransactionStore();
  return null;
}

async function renderSheet(overrides: Partial<ComponentProps<typeof MomoSheet>> = {}) {
  const onClose = jest.fn();
  const onComplete = jest.fn();
  const onConnectWallet = jest.fn();
  const onSelectToToken = jest.fn();
  const utils = await render(
    <SafeAreaProvider initialMetrics={testMetrics}>
      <TransactionStoreProvider>
        <StoreCapture />
        <MomoSheet
          visible
          direction="offramp"
          fromToken={USDC_BASE}
          toToken={GHS}
          amount={1}
          toAmount={3245.67}
          walletConnected={false}
          walletAddress={null}
          onConnectWallet={onConnectWallet}
          onClose={onClose}
          onComplete={onComplete}
          tokens={[ETH, ETH_ARBITRUM, USDC_BASE, GHS]}
          onSelectToToken={onSelectToToken}
          {...overrides}
        />
      </TransactionStoreProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, onClose, onComplete, onConnectWallet, onSelectToToken };
}

beforeEach(async () => {
  // The official AsyncStorage jest mock (jest.setup.env.js) is an in-memory
  // store not cleared between tests on its own — MomoSheet now reads/writes
  // recent-receive-address history through it, so a leftover from one test
  // would otherwise bleed into the next one's initial render.
  await AsyncStorage.clear();
  mockRampApi.initiateOnramp.mockReset().mockResolvedValue({ merchantReference: 'mock-merchant-ref' });
  mockRampApi.startOnrampMobileMoney.mockReset().mockResolvedValue({ transaction: {}, requiresOtp: false });
  mockRampApi.confirmOnramp.mockReset().mockResolvedValue({
    transaction: {},
    bankDeposit: {
      bankName: 'Wema Bank',
      accountNumber: '0123456789',
      accountName: 'Morapay Settlements',
      amount: '25000',
      expiresAt: null,
    },
  });
  mockRampApi.verifyOnrampOtp.mockReset().mockResolvedValue({});
  mockRampApi.initiateOfframp.mockReset().mockResolvedValue({ merchantReference: 'mock-merchant-ref' });
  mockRampApi.setOfframpPayoutAccount.mockReset().mockResolvedValue({ transaction: {}, accountName: null });
  mockRampApi.confirmOfframp.mockReset().mockResolvedValue({
    transaction: {},
    depositAddress: '0x9999999999999999999999999999999999999a',
    depositNetwork: 'base',
  });
  mockRampApi.forwardOfframpHub.mockReset().mockResolvedValue({});
  mockRampApi.getRampTransaction.mockReset().mockResolvedValue({ status: 'COMPLETED', settlementMode: 'DIRECT' });
  mockSendToRampDepositAddress.mockReset().mockResolvedValue('0xtxhash');
  mockRampBanksState = {
    mobileMoney: [
      { code: '0004', name: 'MTN Mobile Money' },
      { code: '0006', name: 'Vodafone Cash' },
      { code: '0005', name: 'AirtelGh' },
      { code: '0009', name: 'Tigo Cash' },
    ],
    banks: [
      { code: '000013', name: 'GTBank' },
      { code: '000014', name: 'Access Bank' },
    ],
    loading: false,
  };
});

describe('MomoSheet', () => {
  it('renders nothing when not visible', async () => {
    await render(
      <SafeAreaProvider initialMetrics={testMetrics}>
        <TransactionStoreProvider>
          <MomoSheet
            visible={false}
            direction="offramp"
            fromToken={ETH}
            toToken={GHS}
            amount={1}
            toAmount={3245.67}
            walletConnected={false}
            walletAddress={null}
            onConnectWallet={() => {}}
            onClose={() => {}}
            onComplete={() => {}}
            tokens={[]}
            onSelectToToken={() => {}}
          />
        </TransactionStoreProvider>
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('momo-phone-input')).toBeNull();
  });

  it('shows the Offramp title and disables Continue until the account name resolves', async () => {
    await renderSheet();

    expect(screen.getByText('Offramp')).toBeTruthy();
    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241234567');

    expect(screen.getByTestId('momo-account-name')).toBeTruthy();
    expect(screen.getByText('Ama Mensah')).toBeTruthy();
    // The manual name field is only a fallback — once the lookup resolves
    // a real name there's nothing left for it to do here.
    expect(screen.queryByTestId('momo-name-input')).toBeNull();
    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(false);
  });

  it('shows "Phone Number" until a network is detected, then swaps to the network name', async () => {
    await renderSheet();
    expect(screen.getByText('Phone Number')).toBeTruthy();
    expect(screen.queryByText('MTN')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241234567');

    expect(screen.getByText('MTN')).toBeTruthy();
    expect(screen.queryByText('Phone Number')).toBeNull();
  });

  it('falls back to "Phone Number" for an unrecognized prefix — no network name to show, no lookup fired', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0119876543'); // not a real prefix

    expect(screen.getByText('Phone Number')).toBeTruthy();
    expect(screen.queryByTestId('momo-account-name')).toBeNull();
    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(true);
  });

  it('shows a loading indicator while the account name is being resolved, and still lets the user type ahead', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241111111');

    expect(screen.queryByTestId('momo-account-name')).toBeNull();
    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(true);

    // Not forced to wait for the lookup — typing a name during it already
    // satisfies canSubmit, same as if the lookup had failed outright.
    await fireEvent.changeText(screen.getByTestId('momo-name-input'), 'Ama Mensah');
    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(false);
  });

  it('fails silently when the lookup fails — no error text, just the manual name field', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0249999999');

    expect(screen.queryByText(/Couldn't verify/)).toBeNull();
    expect(screen.getByTestId('momo-name-input')).toBeTruthy();
    expect(screen.queryByTestId('momo-account-name')).toBeNull();
    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('momo-name-input'), 'Ama Mensah');
    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(false);
  });

  it('lets the user type a name manually before any lookup even runs (unrecognized prefix), but a real institution is still required to actually submit', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0119876543'); // no real Ghana prefix

    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByText(/Couldn't verify/)).toBeNull();

    await fireEvent.changeText(screen.getByTestId('momo-name-input'), 'Kojo Boateng');
    // A manually-typed name alone isn't enough for offramp — with no
    // network detected there's still no real institution code to submit,
    // and this is exactly the case that used to send the wrong value
    // (an empty string) as `bank_code`.
    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(true);
  });

  it('sits flush to the screen edges, same as the token picker', async () => {
    await renderSheet();
    const sheet = screen.getByTestId('momo-sheet');
    const rawStyle = sheet.props.style;
    const styleArray = Array.isArray(rawStyle) ? rawStyle.flat(Infinity) : [rawStyle];
    const flatStyle = Object.assign({}, ...styleArray);
    expect(flatStyle.left).toBe(0);
    expect(flatStyle.right).toBe(0);
    expect(flatStyle.bottom).toBe(0);
  });

  it('blocks Continue and explains why for a token outside the fixed settlement corridor', async () => {
    await renderSheet({ fromToken: ETH });
    await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241234567');

    // The account name resolved fine — this isn't the momo lookup blocking
    // it, it's specifically the corridor check.
    expect(screen.getByText('Ama Mensah')).toBeTruthy();
    expect(screen.getByTestId('momo-corridor-ineligible')).toBeTruthy();
    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(true);
  });

  it('never shows the corridor-ineligible message for the actual corridor asset', async () => {
    await renderSheet(); // defaults to USDC_BASE
    await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241234567');
    expect(screen.queryByTestId('momo-corridor-ineligible')).toBeNull();
  });

  it('walks through the real offramp flow — calls every ramp endpoint in order, sends the corridor asset, and ends on success', async () => {
    jest.useFakeTimers();
    try {
      await renderSheet({ walletConnected: true, walletAddress: WALLET_ADDRESS, amount: 25 });
      await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241234567');
      await act(async () => {
        await fireEvent.press(screen.getByTestId('momo-continue'));
      });

      expect(mockRampApi.initiateOfframp).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'ghs', tokenAmount: '25', walletAddress: WALLET_ADDRESS, customerName: 'Ama Mensah' }),
      );
      // The real Quidax institution code (see mockRampBanksState above) —
      // not the brand string "MTN", which is the exact bug this replaced.
      expect(mockRampApi.setOfframpPayoutAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          merchantReference: 'mock-merchant-ref',
          walletAddress: WALLET_ADDRESS,
          bankCode: '0004',
          accountNumber: '0241234567',
          currency: 'ghs',
        }),
      );
      expect(mockRampApi.confirmOfframp).toHaveBeenCalledWith(
        expect.objectContaining({ merchantReference: 'mock-merchant-ref', walletAddress: WALLET_ADDRESS }),
      );
      // The actual on-chain send — real settlement, not a countdown.
      expect(mockSendToRampDepositAddress).toHaveBeenCalledWith({
        depositAddress: '0x9999999999999999999999999999999999999a',
        humanAmount: '25',
      });
      expect(mockRampApi.forwardOfframpHub).toHaveBeenCalledWith(
        expect.objectContaining({ merchantReference: 'mock-merchant-ref', walletAddress: WALLET_ADDRESS }),
      );

      expect(screen.getByText('Awaiting Confirmation')).toBeTruthy();
      // The close (X) is reachable mid-transfer now, but pressing it asks
      // for confirmation rather than closing outright — a real payout is in
      // flight, so it shouldn't be one accidental tap away.
      await fireEvent.press(screen.getByTestId('momo-sheet-close'));
      expect(screen.getByText('Cancel this transfer?')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('momo-cancel-keep-waiting'));
      expect(screen.queryByText('Cancel this transfer?')).toBeNull();
      expect(screen.getByText('Awaiting Confirmation')).toBeTruthy();

      // First poll tick — mocked transaction already resolves COMPLETED/DIRECT.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });

      expect(screen.getByText('Transfer Successful')).toBeTruthy();
      expect(screen.getByText(/sent to Ama Mensah/)).toBeTruthy();
      expect(screen.getByTestId('momo-done')).toBeTruthy();

      // The transaction tracker's own independent poll (TransactionStoreContext.tsx)
      // should have picked up the same real merchant reference and landed on
      // COMPLETED too — this is what actually makes the pill/sheet real
      // instead of dev-simulator-only (see this session's Tier 1 work).
      expect(capturedStore?.transactions).toContainEqual(
        expect.objectContaining({
          amount: 25,
          cryptoType: 'USDC',
          fiatType: 'GHS',
          status: 'COMPLETED',
          merchantReference: 'mock-merchant-ref',
        }),
      );
      expect(capturedStore?.activeTransactions).toHaveLength(0); // COMPLETED is terminal, not "active"
    } finally {
      jest.useRealTimers();
    }
  });

  it('an AirtelTigo prefix (027) can\'t auto-resolve — blocks Continue until the user picks Airtel or Tigo explicitly', async () => {
    await renderSheet({ walletConnected: true, walletAddress: WALLET_ADDRESS });
    await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0271234567');

    // The account name resolved fine — Continue is blocked specifically on
    // the unresolved institution, not the name.
    expect(screen.getByText('Ama Mensah')).toBeTruthy();
    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByTestId('momo-institution-0005')).toBeTruthy(); // AirtelGh
    expect(screen.getByTestId('momo-institution-0009')).toBeTruthy(); // Tigo Cash

    await fireEvent.press(screen.getByTestId('momo-institution-0009'));
    expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(false);
  });

  it('walking the AirtelTigo pick through to submission sends the real code the user actually chose', async () => {
    jest.useFakeTimers();
    try {
      await renderSheet({ walletConnected: true, walletAddress: WALLET_ADDRESS });
      await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0271234567');
      await fireEvent.press(screen.getByTestId('momo-institution-0005')); // picks Airtel, not Tigo
      await act(async () => {
        await fireEvent.press(screen.getByTestId('momo-continue'));
      });

      expect(mockRampApi.setOfframpPayoutAccount).toHaveBeenCalledWith(expect.objectContaining({ bankCode: '0005' }));

      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });

      expect(screen.getByText('Transfer Successful')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('calls onComplete and onClose when Done is pressed after a successful offramp', async () => {
    jest.useFakeTimers();
    try {
      const { onClose, onComplete } = await renderSheet({ walletConnected: true, walletAddress: WALLET_ADDRESS });
      await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241234567');
      await act(async () => {
        await fireEvent.press(screen.getByTestId('momo-continue'));
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4000);
      });

      await fireEvent.press(screen.getByTestId('momo-done'));
      await act(async () => {
        jest.advanceTimersByTime(300); // let the close animation's callback fire
      });

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('surfaces a friendly error and stays recoverable when the wallet send fails (e.g. a rejected transaction)', async () => {
    mockSendToRampDepositAddress.mockRejectedValue(new Error('You rejected the transaction.'));
    await renderSheet({ walletConnected: true, walletAddress: WALLET_ADDRESS });
    await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241234567');
    await act(async () => {
      await fireEvent.press(screen.getByTestId('momo-continue'));
    });

    expect(screen.getByText('Transfer Failed')).toBeTruthy();
    expect(screen.getByText('You rejected the transaction.')).toBeTruthy();
    // hub-forward never fires off the back of a send that never happened.
    expect(mockRampApi.forwardOfframpHub).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('momo-retry'));
    expect(screen.getByTestId('momo-phone-input')).toBeTruthy();
  });

  describe('NGN — real bank-transfer rail', () => {
    it('shows a bank + account number form for NGN offramp, not the momo phone form', async () => {
      await renderSheet({ toToken: NGN_MOMO_TOKEN, walletConnected: true, walletAddress: WALLET_ADDRESS });

      expect(screen.queryByTestId('momo-phone-input')).toBeNull();
      expect(screen.getByTestId('ngn-bank-select')).toBeTruthy();
      expect(screen.getByTestId('ngn-account-number-input')).toBeTruthy();
      expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(true);
    });

    it('lists the real live bank names, and requires both a bank and a 10-digit account number before submitting', async () => {
      await renderSheet({ toToken: NGN_MOMO_TOKEN, walletConnected: true, walletAddress: WALLET_ADDRESS });

      await fireEvent.changeText(screen.getByTestId('ngn-account-number-input'), '0123456789');
      expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(true); // no bank picked yet

      await fireEvent.press(screen.getByTestId('ngn-bank-select'));
      expect(screen.getByTestId('ngn-bank-000013')).toBeTruthy(); // GTBank, from the live mocked list
      await fireEvent.press(screen.getByTestId('ngn-bank-000013'));

      expect(screen.getByText('GTBank')).toBeTruthy();
      expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(false);
    });

    it('walks through the real NGN offramp flow — real bank code, account number, and the account name the backend resolves', async () => {
      mockRampApi.setOfframpPayoutAccount.mockResolvedValue({ transaction: {}, accountName: 'Chidinma Okafor' });
      jest.useFakeTimers();
      try {
        await renderSheet({ toToken: NGN_MOMO_TOKEN, walletConnected: true, walletAddress: WALLET_ADDRESS, amount: 25 });
        await fireEvent.changeText(screen.getByTestId('ngn-account-number-input'), '0123456789');
        await fireEvent.press(screen.getByTestId('ngn-bank-select'));
        await fireEvent.press(screen.getByTestId('ngn-bank-000013'));
        await act(async () => {
          await fireEvent.press(screen.getByTestId('momo-continue'));
        });

        // No pre-flight name lookup for a bank account — omitted entirely,
        // unlike momo's resolved customerName.
        expect(mockRampApi.initiateOfframp).toHaveBeenCalledWith(
          expect.objectContaining({ currency: 'ngn', tokenAmount: '25', walletAddress: WALLET_ADDRESS, customerName: undefined }),
        );
        expect(mockRampApi.setOfframpPayoutAccount).toHaveBeenCalledWith(
          expect.objectContaining({ bankCode: '000013', accountNumber: '0123456789', currency: 'ngn' }),
        );

        await act(async () => {
          await jest.advanceTimersByTimeAsync(4000);
        });

        // The real backend-resolved name, not something guessed client-side.
        expect(screen.getByText(/sent to Chidinma Okafor/)).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('shows a plain confirm step for NGN onramp — nothing to collect, since it settles via a generated deposit account', async () => {
      await renderSheet({
        direction: 'onramp',
        fromToken: NGN_MOMO_TOKEN,
        toToken: ETH,
        walletConnected: true,
        walletAddress: WALLET_ADDRESS,
      });
      await fireEvent.press(screen.getByTestId('momo-receive-continue')); // past the receive step, onto 'form'

      expect(screen.queryByTestId('momo-phone-input')).toBeNull();
      expect(screen.queryByTestId('ngn-account-number-input')).toBeNull();
      // Nothing to fill in — Continue is enabled immediately.
      expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(false);
    });

    it('walks through the real NGN onramp flow — initiates, confirms, and shows the real deposit account the backend returns', async () => {
      await renderSheet({
        direction: 'onramp',
        fromToken: NGN_MOMO_TOKEN,
        toToken: ETH,
        walletConnected: true,
        walletAddress: WALLET_ADDRESS,
        amount: 25000,
      });
      await fireEvent.press(screen.getByTestId('momo-receive-continue'));
      await act(async () => {
        await fireEvent.press(screen.getByTestId('momo-continue'));
      });

      expect(mockRampApi.initiateOnramp).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'ngn', fiatAmount: '25000', payoutWalletAddress: WALLET_ADDRESS }),
      );
      expect(mockRampApi.confirmOnramp).toHaveBeenCalledWith(
        expect.objectContaining({ merchantReference: 'mock-merchant-ref', walletAddress: WALLET_ADDRESS }),
      );
      // No mobile-money charge fires for this rail at all.
      expect(mockRampApi.startOnrampMobileMoney).not.toHaveBeenCalled();

      // The real deposit account from the mocked confirmOnramp response —
      // not something guessed or hardcoded client-side.
      const instructions = screen.getByTestId('ngn-deposit-instructions');
      expect(instructions).toBeTruthy();
      expect(screen.getByText('Wema Bank')).toBeTruthy();
      expect(screen.getByText('0123456789')).toBeTruthy();
      expect(screen.getByText('Morapay Settlements')).toBeTruthy();
    });

    it('blocks NGN onramp when confirm comes back with no deposit account, rather than showing an empty instructions card', async () => {
      mockRampApi.confirmOnramp.mockResolvedValue({ transaction: {}, bankDeposit: null });
      jest.useFakeTimers();
      try {
        await renderSheet({
          direction: 'onramp',
          fromToken: NGN_MOMO_TOKEN,
          toToken: ETH,
          walletConnected: true,
          walletAddress: WALLET_ADDRESS,
        });
        await fireEvent.press(screen.getByTestId('momo-receive-continue'));
        await act(async () => {
          await fireEvent.press(screen.getByTestId('momo-continue'));
        });

        // Falls through to the same polling loop instead — a settlement
        // mode this app hasn't seen, not a dead end. Bank onramp's
        // "awaiting" copy is rail-specific — it never asked for a mobile
        // money approval, so it shouldn't claim to be waiting on one.
        expect(screen.queryByTestId('ngn-deposit-instructions')).toBeNull();
        expect(screen.getByText('Preparing Your Transfer')).toBeTruthy();

        // Drains the poll loop's pending timer before the sheet unmounts —
        // otherwise it's left mid-`await` on a fake timer that never fires.
        await act(async () => {
          await jest.advanceTimersByTimeAsync(4000);
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('blocks a currency with no real ramp rail at all (e.g. KES) instead of guessing one', async () => {
      const KES_TOKEN: SwapToken = { ...GHS, id: 'kes-momo', symbol: 'KES', chainName: 'Mobile Money' };
      await renderSheet({ toToken: KES_TOKEN, walletConnected: true, walletAddress: WALLET_ADDRESS });

      expect(screen.getByTestId('momo-rail-unsupported')).toBeTruthy();
      expect(screen.getByTestId('momo-continue').props.accessibilityState?.disabled).toBe(true);
    });

    it('asks for confirmation before closing once the real deposit account is on screen, instead of losing it on one accidental tap', async () => {
      jest.useFakeTimers();
      try {
        const { onClose } = await renderSheet({
          direction: 'onramp',
          fromToken: NGN_MOMO_TOKEN,
          toToken: ETH,
          walletConnected: true,
          walletAddress: WALLET_ADDRESS,
          amount: 25000,
        });
        await fireEvent.press(screen.getByTestId('momo-receive-continue'));
        await act(async () => {
          await fireEvent.press(screen.getByTestId('momo-continue'));
        });
        expect(screen.getByTestId('ngn-deposit-instructions')).toBeTruthy();

        await fireEvent.press(screen.getByTestId('momo-sheet-close'));
        expect(screen.getByText('Cancel this transfer?')).toBeTruthy();
        // The deposit instructions are still there underneath — closing this
        // way is opt-in, not a reset of what was already shown.
        expect(screen.queryByTestId('ngn-deposit-instructions')).toBeNull();

        await fireEvent.press(screen.getByTestId('momo-cancel-confirm'));
        await act(async () => {
          jest.advanceTimersByTime(300); // let the close animation's callback fire
        });
        expect(onClose).toHaveBeenCalledTimes(1);

        // Drains the poll loop's pending timer before the sheet unmounts.
        await act(async () => {
          await jest.advanceTimersByTimeAsync(4000);
        });
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('onramp — "where do you want to receive" step', () => {
    // Onramp pays with mobile money, not a wallet, so it's the one direction
    // that needs to ask where the purchased crypto should land — offramp
    // already collects that (the momo number IS the receive destination)
    // as part of its existing single form step. One address field handles
    // both cases: a link icon either pastes the connected wallet in or
    // starts the real connect flow, rather than a separate wallet/manual
    // choice.

    it('starts on the receive step for onramp, not the phone form', async () => {
      await renderSheet({ direction: 'onramp', fromToken: GHS, toToken: ETH });

      expect(screen.queryByTestId('momo-phone-input')).toBeNull();
      expect(screen.getByText('Where do you want to receive?')).toBeTruthy();
      expect(screen.getByTestId('momo-receive-address-input')).toBeTruthy();
    });

    it('skips straight past the receive step for offramp — no destination left to ask for', async () => {
      await renderSheet({ direction: 'offramp' });
      expect(screen.getByTestId('momo-phone-input')).toBeTruthy();
      expect(screen.queryByTestId('momo-receive-address-input')).toBeNull();
    });

    it('shows a back button only on steps that actually have somewhere to go back to', async () => {
      await renderSheet({ direction: 'onramp', fromToken: GHS, toToken: ETH, walletConnected: true, walletAddress: WALLET_ADDRESS });

      // 'receive' is the first step onramp shows — nothing behind it.
      expect(screen.queryByTestId('momo-sheet-back')).toBeNull();

      await fireEvent.press(screen.getByTestId('momo-receive-continue'));
      // 'form' was reached from 'receive' — back is real here.
      expect(screen.getByTestId('momo-sheet-back')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('momo-sheet-back'));
      expect(screen.getByText('Where do you want to receive?')).toBeTruthy();
      expect(screen.queryByTestId('momo-sheet-back')).toBeNull();
    });

    it('offramp\'s "form" step has no back button — it\'s the first thing offramp shows', async () => {
      await renderSheet({ direction: 'offramp' });
      expect(screen.queryByTestId('momo-sheet-back')).toBeNull();
    });

    it('with no wallet connected, starts empty and requires a manually typed address before continuing', async () => {
      await renderSheet({ direction: 'onramp', fromToken: GHS, toToken: ETH, walletConnected: false, walletAddress: null });

      expect(screen.getByTestId('momo-receive-address-input').props.value).toBe('');
      expect(screen.getByTestId('momo-receive-continue').props.accessibilityState?.disabled).toBe(true);

      await fireEvent.changeText(screen.getByTestId('momo-receive-address-input'), 'not-an-address');
      expect(screen.getByTestId('momo-receive-continue').props.accessibilityState?.disabled).toBe(true);

      await fireEvent.changeText(screen.getByTestId('momo-receive-address-input'), WALLET_ADDRESS);
      expect(screen.getByTestId('momo-receive-continue').props.accessibilityState?.disabled).toBe(false);
    });

    it('tapping the link icon while disconnected calls through to the real connect flow', async () => {
      const { onConnectWallet } = await renderSheet({ direction: 'onramp', fromToken: GHS, toToken: ETH, walletConnected: false });
      await fireEvent.press(screen.getByTestId('momo-receive-wallet-chip'));
      expect(onConnectWallet).toHaveBeenCalledTimes(1);
    });

    it('with a wallet already connected, pre-fills the address and lets Continue through immediately', async () => {
      await renderSheet({
        direction: 'onramp',
        fromToken: GHS,
        toToken: ETH,
        walletConnected: true,
        walletAddress: WALLET_ADDRESS,
      });

      expect(screen.getByTestId('momo-receive-address-input').props.value).toBe(WALLET_ADDRESS);
      expect(screen.getByTestId('momo-receive-continue').props.accessibilityState?.disabled).toBe(false);

      await fireEvent.press(screen.getByTestId('momo-receive-continue'));
      expect(screen.getByTestId('momo-phone-input')).toBeTruthy();
    });

    it('lets a connected-wallet user type a different address instead, and restore it via the link icon', async () => {
      await renderSheet({
        direction: 'onramp',
        fromToken: GHS,
        toToken: ETH,
        walletConnected: true,
        walletAddress: WALLET_ADDRESS,
      });

      await fireEvent.changeText(screen.getByTestId('momo-receive-address-input'), 'not-an-address');
      expect(screen.getByTestId('momo-receive-continue').props.accessibilityState?.disabled).toBe(true);

      await fireEvent.press(screen.getByTestId('momo-receive-wallet-chip'));
      expect(screen.getByTestId('momo-receive-address-input').props.value).toBe(WALLET_ADDRESS);
      expect(screen.getByTestId('momo-receive-continue').props.accessibilityState?.disabled).toBe(false);
    });

    // Real bug: the auto-fill effect used to re-run on every keystroke
    // (keyed off the address itself, not the wallet-connect transition), so
    // clearing the field snapped the wallet address right back in — there
    // was no way to actually delete it once a wallet was connected.
    it('lets a connected-wallet user actually clear the field, instead of snapping the wallet address right back in', async () => {
      await renderSheet({
        direction: 'onramp',
        fromToken: GHS,
        toToken: ETH,
        walletConnected: true,
        walletAddress: WALLET_ADDRESS,
      });

      expect(screen.getByTestId('momo-receive-address-input').props.value).toBe(WALLET_ADDRESS);

      await fireEvent.changeText(screen.getByTestId('momo-receive-address-input'), '');
      expect(screen.getByTestId('momo-receive-address-input').props.value).toBe('');
      expect(screen.getByTestId('momo-receive-continue').props.accessibilityState?.disabled).toBe(true);
    });

    // Real bug: the wallet chip only ever set the address, never cleared
    // it — pressing it a second time while it already showed the connected
    // wallet was a no-op, leaving no way to back out of it via the chip.
    it('toggles the connected wallet address off when the chip is pressed again', async () => {
      await renderSheet({
        direction: 'onramp',
        fromToken: GHS,
        toToken: ETH,
        walletConnected: true,
        walletAddress: WALLET_ADDRESS,
      });

      expect(screen.getByTestId('momo-receive-address-input').props.value).toBe(WALLET_ADDRESS);

      await fireEvent.press(screen.getByTestId('momo-receive-wallet-chip'));
      expect(screen.getByTestId('momo-receive-address-input').props.value).toBe('');

      await fireEvent.press(screen.getByTestId('momo-receive-wallet-chip'));
      expect(screen.getByTestId('momo-receive-address-input').props.value).toBe(WALLET_ADDRESS);
    });

    it('shows the fixed destination network, and re-picking one from the network sheet changes the target token', async () => {
      const { onSelectToToken } = await renderSheet({ direction: 'onramp', fromToken: GHS, toToken: ETH, walletConnected: false });

      expect(screen.getByTestId('momo-network-pill').props.accessibilityLabel).toBe('Network: Ethereum');
      expect(screen.queryByTestId('network-select-sheet')).toBeNull();

      await fireEvent.press(screen.getByTestId('momo-network-pill'));
      expect(screen.getByTestId('network-select-sheet')).toBeTruthy();
      // Only ETH's own real chain-variants show up (see the fixture's
      // `tokens` list) — not USDC_BASE or GHS, which don't share ETH's symbol.
      expect(screen.getByTestId('network-row-1')).toBeTruthy();
      expect(screen.getByTestId('network-row-42161')).toBeTruthy();
      expect(screen.getByTestId('network-row-1').props.accessibilityState?.selected).toBe(true);

      await fireEvent.press(screen.getByTestId('network-row-42161'));
      expect(onSelectToToken).toHaveBeenCalledWith(ETH_ARBITRUM);
    });

    it('pastes clipboard content into the address field', async () => {
      const getStringAsyncMock = jest.spyOn(require('expo-clipboard'), 'getStringAsync').mockResolvedValue(WALLET_ADDRESS);
      await renderSheet({ direction: 'onramp', fromToken: GHS, toToken: ETH, walletConnected: false });

      await act(async () => {
        await fireEvent.press(screen.getByTestId('momo-receive-paste'));
      });
      expect(screen.getByTestId('momo-receive-address-input').props.value).toBe(WALLET_ADDRESS);
      getStringAsyncMock.mockRestore();
    });

    it('offers a previously-used address for the same chain, and saves a new one on Continue', async () => {
      await AsyncStorage.setItem(
        'morapay:recent-receive-addresses',
        JSON.stringify({ '1': ['0x3333333333333333333333333333333333333333'] }),
      );

      await renderSheet({ direction: 'onramp', fromToken: GHS, toToken: ETH, walletConnected: false });
      await waitFor(() => expect(screen.getByTestId('momo-recent-address-0x3333333333333333333333333333333333333333')).toBeTruthy());

      await fireEvent.press(screen.getByTestId('momo-recent-address-0x3333333333333333333333333333333333333333'));
      expect(screen.getByTestId('momo-receive-address-input').props.value).toBe('0x3333333333333333333333333333333333333333');

      await fireEvent.changeText(screen.getByTestId('momo-receive-address-input'), WALLET_ADDRESS);
      await fireEvent.press(screen.getByTestId('momo-receive-continue'));

      const stored = JSON.parse((await AsyncStorage.getItem('morapay:recent-receive-addresses')) ?? '{}');
      // Most-recent-first, deduped, capped — the address just used to
      // continue is now first for this chain.
      expect(stored['1'][0]).toBe(WALLET_ADDRESS);
    });

    it('truncates a recent address to fill the row width, keeping the last 4 characters', async () => {
      const longAddress = '0x1234567890123456789012345678901234567890';
      await AsyncStorage.setItem('morapay:recent-receive-addresses', JSON.stringify({ '1': [longAddress] }));

      await renderSheet({ direction: 'onramp', fromToken: GHS, toToken: ETH, walletConnected: false });
      const text = await waitFor(() => screen.getByTestId(`momo-recent-address-text-${longAddress}`));

      // Before any layout measurement, the full address is shown rather
      // than guessing a width.
      expect(text.props.children).toBe(longAddress);

      // A real onLayout report — narrow enough that the full 42-character
      // address can't fit, so it truncates down to fit exactly that width,
      // still ending in the address's real last 4 characters.
      fireEvent(text, 'layout', { nativeEvent: { layout: { width: 120, height: 20 } } });
      await waitFor(() => {
        const truncated = screen.getByTestId(`momo-recent-address-text-${longAddress}`).props.children as string;
        expect(truncated).not.toBe(longAddress);
        expect(truncated.endsWith(longAddress.slice(-4))).toBe(true);
        expect(truncated).toContain('...');
      });
    });

    it('walking the full onramp flow calls the real ramp endpoints in order and ends on success', async () => {
      jest.useFakeTimers();
      try {
        await renderSheet({
          direction: 'onramp',
          fromToken: GHS,
          toToken: ETH,
          walletConnected: true,
          walletAddress: WALLET_ADDRESS,
          amount: 500,
          toAmount: 0.0298,
        });

        await fireEvent.press(screen.getByTestId('momo-receive-continue'));
        await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241234567');
        await act(async () => {
          await fireEvent.press(screen.getByTestId('momo-continue'));
        });

        expect(mockRampApi.initiateOnramp).toHaveBeenCalledWith(
          expect.objectContaining({
            currency: 'ghs',
            fiatAmount: '500',
            payoutWalletAddress: WALLET_ADDRESS,
            customerName: 'Ama Mensah',
            targetTokenSymbol: 'ETH',
          }),
        );
        expect(mockRampApi.startOnrampMobileMoney).toHaveBeenCalledWith(
          expect.objectContaining({ merchantReference: 'mock-merchant-ref', walletAddress: WALLET_ADDRESS }),
        );
        expect(screen.getByText('Awaiting Approval')).toBeTruthy();

        // Same real-tracker handoff the offramp flow gets — direction:
        // 'onramp' is what tells the pill/stepper this transaction paid GHS
        // rather than ETH, so it doesn't misread as "Swapping 500 ETH…".
        expect(capturedStore?.transactions).toContainEqual(
          expect.objectContaining({
            amount: 500,
            cryptoType: 'ETH',
            fiatType: 'GHS',
            direction: 'onramp',
            merchantReference: 'mock-merchant-ref',
          }),
        );

        // First poll tick — mocked transaction already resolves COMPLETED/DIRECT.
        await act(async () => {
          await jest.advanceTimersByTimeAsync(4000);
        });

        expect(mockRampApi.getRampTransaction).toHaveBeenCalledWith(
          expect.objectContaining({ merchantReference: 'mock-merchant-ref', walletAddress: WALLET_ADDRESS }),
        );
        expect(screen.getByText('Transaction Sent')).toBeTruthy();
        expect(screen.getByText(/0x2222\.\.\.2222/)).toBeTruthy();

        expect(capturedStore?.transactions).toContainEqual(
          expect.objectContaining({ direction: 'onramp', status: 'COMPLETED', merchantReference: 'mock-merchant-ref' }),
        );
        expect(capturedStore?.activeTransactions).toHaveLength(0); // COMPLETED is terminal, not "active"
      } finally {
        jest.useRealTimers();
      }
    });

    it('shows the OTP step when the mobile-money charge asks for one, then polls to success after verifying', async () => {
      jest.useFakeTimers();
      try {
        mockRampApi.startOnrampMobileMoney.mockResolvedValue({ transaction: {}, requiresOtp: true });
        await renderSheet({
          direction: 'onramp',
          fromToken: GHS,
          toToken: ETH,
          walletConnected: true,
          walletAddress: WALLET_ADDRESS,
        });

        await fireEvent.press(screen.getByTestId('momo-receive-continue'));
        await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241234567');
        await act(async () => {
          await fireEvent.press(screen.getByTestId('momo-continue'));
        });

        expect(screen.getByTestId('momo-otp-input')).toBeTruthy();
        await fireEvent.changeText(screen.getByTestId('momo-otp-input'), '1234');
        await act(async () => {
          await fireEvent.press(screen.getByTestId('momo-otp-continue'));
        });

        expect(mockRampApi.verifyOnrampOtp).toHaveBeenCalledWith(
          expect.objectContaining({ merchantReference: 'mock-merchant-ref', otp: '1234' }),
        );

        await act(async () => {
          await jest.advanceTimersByTimeAsync(4000);
        });

        expect(screen.getByText('Transaction Sent')).toBeTruthy();
      } finally {
        jest.useRealTimers();
      }
    });

    it('surfaces a real backend error as the failure message instead of a canned one', async () => {
      mockRampApi.initiateOnramp.mockRejectedValue(new Error('Minimum buy amount is 50 GHS.'));
      await renderSheet({
        direction: 'onramp',
        fromToken: GHS,
        toToken: ETH,
        walletConnected: true,
        walletAddress: WALLET_ADDRESS,
      });

      await fireEvent.press(screen.getByTestId('momo-receive-continue'));
      await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241234567');
      await act(async () => {
        await fireEvent.press(screen.getByTestId('momo-continue'));
      });

      expect(screen.getByText('Minimum buy amount is 50 GHS.')).toBeTruthy();
    });

    it('a name-mismatch error sends the user back to fix the name instead of a dead-end failure', async () => {
      const mismatch = Object.assign(new Error("The name on this Mobile Money wallet doesn't match what you entered."), {
        code: 'customer.name.mismatch',
      });
      mockRampApi.initiateOnramp.mockRejectedValue(mismatch);
      await renderSheet({
        direction: 'onramp',
        fromToken: GHS,
        toToken: ETH,
        walletConnected: true,
        walletAddress: WALLET_ADDRESS,
      });

      await fireEvent.press(screen.getByTestId('momo-receive-continue'));
      await fireEvent.changeText(screen.getByTestId('momo-phone-input'), '0241234567');
      await act(async () => {
        await fireEvent.press(screen.getByTestId('momo-continue'));
      });

      // Back on the form, not the failure screen — with the mismatch inline.
      expect(screen.getByTestId('momo-phone-input')).toBeTruthy();
      expect(screen.getByText(/doesn't match what you entered/)).toBeTruthy();
      expect(screen.queryByText('Transfer Failed')).toBeNull();
    });
  });
});
