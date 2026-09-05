import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';

// Same reactive stand-in SwapScreen.test.tsx uses — see that file's own
// doc comment for why a plain useSyncExternalStore store stands in for the
// real Dynamic SDK's embedded-WebView connect UI here.
const mockWalletListeners = new Set<() => void>();
let mockWalletState: { connected: boolean; address: string | null } = { connected: false, address: null };
function mockNotifyWallet() {
  mockWalletListeners.forEach((listener) => listener());
}
function mockResetWalletState() {
  mockWalletState = { connected: false, address: null };
}
jest.mock('../../../dynamic/useWallet', () => {
  const { useSyncExternalStore } = require('react');
  const subscribe = (listener: () => void) => {
    mockWalletListeners.add(listener);
    return () => mockWalletListeners.delete(listener);
  };
  return {
    useWallet: () => {
      const state = useSyncExternalStore(subscribe, () => mockWalletState);
      return { connected: state.connected, address: state.address, loading: false };
    },
  };
});

const mockConnect = jest.fn(() => {
  mockWalletState = { connected: true, address: '0x2222222222222222222222222222222222222222' };
  mockNotifyWallet();
});
const mockSwitchToChain = jest.fn();
jest.mock('../../../dynamic/useWalletConnectActions', () => ({
  useWalletConnectActions: () => ({
    connect: () => mockConnect(),
    disconnect: jest.fn(),
    switchToChain: (chainId: string) => mockSwitchToChain(chainId),
  }),
}));

const mockTokenTransfer = jest.fn();
jest.mock('../../swap/useTokenTransfer', () => ({
  useTokenTransfer: () => ({ transfer: (...args: unknown[]) => mockTokenTransfer(...args) }),
}));

const mockGetPaymentRequestByLink = jest.fn();
const mockGetPaymentInstruction = jest.fn();
const mockConfirmCryptoPayment = jest.fn();
// `PayRequestError` is declared INSIDE the factory, not referenced from an
// outer `class` declaration — unlike the jest.fn() mocks above (which are
// safe because they're wrapped in a lazy arrow function that only looks
// them up when actually called), an object-literal property like
// `PayRequestError: someOuterClass` is evaluated eagerly, the moment the
// factory itself runs. Import hoisting means that can happen before an
// outer `class` statement below it has executed, silently capturing
// `undefined` instead of the class — self-contained avoids that entirely.
jest.mock('../../../api/payRequest', () => {
  class PayRequestError extends Error {
    code?: string;
    status?: number;
    constructor(message: string, code?: string, status?: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    getPaymentRequestByLink: (linkId: string) => mockGetPaymentRequestByLink(linkId),
    getPaymentInstruction: (transactionId: string) => mockGetPaymentInstruction(transactionId),
    confirmCryptoPayment: (transactionId: string, txHash: string) => mockConfirmCryptoPayment(transactionId, txHash),
    isEvmErc20TransferInstruction: (instruction: { kind: string }) => instruction.kind === 'evm_erc20_transfer',
    PayRequestError,
  };
});

import { PayScreen } from '../PayScreen';
// eslint-disable-next-line import/order -- real module is mocked above; this
// import resolves to the mock's own PayRequestError class, the same one
// usePayRequest.ts sees, so `new PayRequestError(...)` in tests is a real
// `instanceof` match.
import { PayRequestError } from '../../../api/payRequest';

type TestParamList = { Pay: { linkId: string; transactionId?: string }; Swap: undefined };
const TestStack = createNativeStackNavigator<TestParamList>();

function SwapPlaceholder() {
  return <Text>swap home</Text>;
}

// Without `initialMetrics`, SafeAreaProvider renders nothing at all until it
// gets a native "frame measured" callback that never fires in the test
// renderer — same fixed metrics SwapScreen.test.tsx already uses.
const testMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderPayScreen(linkId = 'link-1', transactionId?: string) {
  return render(
    <SafeAreaProvider initialMetrics={testMetrics}>
      <NavigationContainer>
        <TestStack.Navigator screenOptions={{ headerShown: false }}>
          <TestStack.Screen name="Pay" component={PayScreen} initialParams={{ linkId, transactionId }} />
          <TestStack.Screen name="Swap" component={SwapPlaceholder} />
        </TestStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>,
  );
}

const baseRequest = {
  id: 'req-1',
  code: 'REQAB12CD',
  linkId: 'link-1',
  transactionId: 'tx-1',
  payoutTarget: null,
  payoutFiat: null,
  transaction: {
    id: 'tx-1',
    type: 'REQUEST',
    status: 'PENDING',
    f_chain: null,
    f_token: null,
    f_amount: null,
    t_chain: 'BASE',
    t_token: 'USDC',
    t_amount: '10',
    receiveSummary: '10.00 USDC on Base',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
};

const evmInstruction = {
  kind: 'evm_erc20_transfer' as const,
  chainId: 8453,
  chain: 'BASE',
  token: 'USDC',
  toAddress: '0x1111111111111111111111111111111111111111',
  tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  amount: '10',
  decimals: 6,
  message: 'Send this amount of token to toAddress; then confirm.',
};

beforeEach(() => {
  mockResetWalletState();
  mockConnect.mockClear();
  mockSwitchToChain.mockClear();
  mockTokenTransfer.mockReset().mockResolvedValue('0xhash123');
  mockGetPaymentRequestByLink.mockReset();
  mockGetPaymentInstruction.mockReset();
  mockConfirmCryptoPayment.mockReset();
});

describe('PayScreen', () => {
  it('shows a not-found state for an invalid link', async () => {
    mockGetPaymentRequestByLink.mockRejectedValue(new PayRequestError('Not found', undefined, 404));
    await renderPayScreen();

    expect(await screen.findByText(/isn't valid or has expired/)).toBeTruthy();
    expect(mockGetPaymentInstruction).not.toHaveBeenCalled();
  });

  it('shows an already-completed state without calling calldata', async () => {
    mockGetPaymentRequestByLink.mockResolvedValue({
      ...baseRequest,
      transaction: { ...baseRequest.transaction, status: 'COMPLETED' },
    });
    await renderPayScreen();

    expect(await screen.findByText('This request has already been paid.')).toBeTruthy();
    expect(mockGetPaymentInstruction).not.toHaveBeenCalled();
  });

  // Regression: a bare 400 from calldata was previously always reported as
  // "already paid," with no actual evidence — verified live, Core's own
  // calldata route 400s for several distinct real reasons (no transaction
  // id supplied, wrong transaction type, or genuinely already paid), and
  // only the last one is true "already paid."
  it('does not report already-completed for a calldata 400 that is not about being paid', async () => {
    mockGetPaymentRequestByLink.mockResolvedValue(baseRequest);
    mockGetPaymentInstruction.mockRejectedValue(new PayRequestError('transaction_id is required', 'request.invalid', 400));
    await renderPayScreen();

    expect(await screen.findByTestId('pay-error')).toBeTruthy();
    expect(screen.getByText('transaction_id is required')).toBeTruthy();
    expect(screen.queryByText('This request has already been paid.')).toBeNull();
  });

  it('reports already-completed only when calldata\'s 400 message actually says so', async () => {
    mockGetPaymentRequestByLink.mockResolvedValue(baseRequest);
    mockGetPaymentInstruction.mockRejectedValue(new PayRequestError('Request already paid', 'request.invalid', 400));
    await renderPayScreen();

    expect(await screen.findByText('This request has already been paid.')).toBeTruthy();
  });

  // Core's by-link response now includes a real, server-computed
  // `payerPaysFiat` flag — this should be trusted outright instead of
  // attempting a `calldata` call Core would refuse anyway.
  it('shows unsupported immediately when payerPaysFiat is true, without ever calling calldata', async () => {
    mockGetPaymentRequestByLink.mockResolvedValue({
      ...baseRequest,
      transaction: { ...baseRequest.transaction, payerPaysFiat: true },
    });
    await renderPayScreen();

    expect(await screen.findByTestId('pay-unsupported')).toBeTruthy();
    expect(screen.getByText('This request needs a fiat deposit, not a wallet transfer. That isn\'t supported in-app yet.')).toBeTruthy();
    expect(mockGetPaymentInstruction).not.toHaveBeenCalled();
  });

  // Regression: an older deployed by-link response didn't include any
  // transaction id at all (neither the deprecated top-level `transactionId`
  // nor `transaction.id`, which Core's serializer now reliably sends) — a
  // request object shaped like that (no id anywhere, no requester-supplied
  // one either) must not silently call calldata with nothing to query.
  it('shows unsupported, not already-completed, when neither by-link nor the deep link supplies a transaction id', async () => {
    const { transactionId: _omit, ...requestWithoutTransactionId } = baseRequest;
    mockGetPaymentRequestByLink.mockResolvedValue({
      ...requestWithoutTransactionId,
      transaction: { ...requestWithoutTransactionId.transaction, id: undefined },
    });
    await renderPayScreen('link-1', undefined);

    expect(await screen.findByTestId('pay-unsupported')).toBeTruthy();
    expect(screen.getByText("This link doesn't have enough information to pay in-app yet.")).toBeTruthy();
    expect(mockGetPaymentInstruction).not.toHaveBeenCalled();
  });

  it('uses the transaction id carried on the deep link when by-link does not supply one', async () => {
    const { transactionId: _omit, ...requestWithoutTransactionId } = baseRequest;
    mockGetPaymentRequestByLink.mockResolvedValue(requestWithoutTransactionId);
    mockGetPaymentInstruction.mockResolvedValue(evmInstruction);
    await renderPayScreen('link-1', 'tx-from-deep-link');

    await screen.findByTestId('pay-cta');
    expect(mockGetPaymentInstruction).toHaveBeenCalledWith('tx-from-deep-link');
  });

  it('shows an unsupported state for a non-EVM instruction', async () => {
    mockGetPaymentRequestByLink.mockResolvedValue(baseRequest);
    mockGetPaymentInstruction.mockResolvedValue({ kind: 'stellar_payment' });
    await renderPayScreen();

    expect(await screen.findByTestId('pay-unsupported')).toBeTruthy();
    expect(screen.getByText("This payment can't be completed in-app yet.")).toBeTruthy();
  });

  it('shows only the masked recipient hint, never a raw email/phone', async () => {
    // This endpoint has no auth guard — see api/payRequest.ts's own doc —
    // so a raw identifier here would be visible to anyone who opens the
    // link, not just the payer. `receiveSummary` is deliberately absent so
    // the screen actually has to fall back to `toIdentifierHint`.
    mockGetPaymentRequestByLink.mockResolvedValue({
      ...baseRequest,
      transaction: {
        ...baseRequest.transaction,
        receiveSummary: undefined,
        toIdentifierHint: 'r***r@example.com',
      },
    });
    mockGetPaymentInstruction.mockResolvedValue(evmInstruction);
    await renderPayScreen();

    await screen.findByTestId('pay-cta');
    expect(screen.getByText('To r***r@example.com')).toBeTruthy();
    expect(screen.queryByText(/real\.person@example\.com/)).toBeNull();
  });

  it('prompts to connect a wallet when ready and disconnected', async () => {
    mockGetPaymentRequestByLink.mockResolvedValue(baseRequest);
    mockGetPaymentInstruction.mockResolvedValue(evmInstruction);
    await renderPayScreen();

    const button = await screen.findByTestId('pay-cta');
    expect(button.props.accessibilityLabel).toBe('Connect wallet to pay');

    await act(async () => {
      await fireEvent.press(button);
    });
    expect(mockConnect).toHaveBeenCalled();
  });

  it('pays a ready request: transfers then confirms, and shows success', async () => {
    mockGetPaymentRequestByLink.mockResolvedValue(baseRequest);
    mockGetPaymentInstruction.mockResolvedValue(evmInstruction);
    mockConfirmCryptoPayment.mockResolvedValue({
      confirmed: true,
      transaction_id: 'tx-1',
      tx_hash: '0xhash123',
      message: 'Payment confirmed.',
    });
    await renderPayScreen();

    // First press only connects (mirrors the real UX: the button is
    // "Connect wallet to pay" until a wallet is attached) — press again
    // once it relabels to actually pay.
    const connectButton = await screen.findByTestId('pay-cta');
    await act(async () => {
      await fireEvent.press(connectButton);
    });
    const payButton = await screen.findByTestId('pay-cta');
    await act(async () => {
      await fireEvent.press(payButton);
    });

    expect(mockTokenTransfer).toHaveBeenCalledWith({
      token: { chainId: '8453', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
      toAddress: '0x1111111111111111111111111111111111111111',
      amount: '10',
    });
    expect(mockConfirmCryptoPayment).toHaveBeenCalledWith('tx-1', '0xhash123');
    expect(await screen.findByTestId('pay-success')).toBeTruthy();
    expect(screen.getByText('Payment confirmed.')).toBeTruthy();
  });

  it('shows a distinct error when the transfer sent but confirmation failed, keeping the tx hash visible', async () => {
    mockGetPaymentRequestByLink.mockResolvedValue(baseRequest);
    mockGetPaymentInstruction.mockResolvedValue(evmInstruction);
    mockConfirmCryptoPayment.mockRejectedValue(new Error('Verification timed out'));
    await renderPayScreen();

    const connectButton = await screen.findByTestId('pay-cta');
    await act(async () => {
      await fireEvent.press(connectButton);
    });
    const payButton = await screen.findByTestId('pay-cta');
    await act(async () => {
      await fireEvent.press(payButton);
    });

    const error = await screen.findByTestId('pay-error');
    expect(error.props.children.join ? error.props.children.join('') : String(error.props.children)).toContain('0xhash123'.slice(0, 10));
  });

  it('shows an error and never calls confirm when the transfer itself fails', async () => {
    mockGetPaymentRequestByLink.mockResolvedValue(baseRequest);
    mockGetPaymentInstruction.mockResolvedValue(evmInstruction);
    mockTokenTransfer.mockRejectedValue(new Error('User rejected the request'));
    await renderPayScreen();

    const connectButton = await screen.findByTestId('pay-cta');
    await act(async () => {
      await fireEvent.press(connectButton);
    });
    const payButton = await screen.findByTestId('pay-cta');
    await act(async () => {
      await fireEvent.press(payButton);
    });

    expect(await screen.findByText('User rejected the request')).toBeTruthy();
    expect(mockConfirmCryptoPayment).not.toHaveBeenCalled();
  });
});
