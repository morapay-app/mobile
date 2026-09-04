import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';

// Minimal reactive stand-in for the real wallet state — the actual SDK's
// connect/disconnect UI lives inside dynamicClient.reactNative.WebView, a
// real embedded browser these tests have no business exercising (no such
// WebView is mounted here). useSyncExternalStore gives the same "state
// changes, every subscribed hook re-renders" behavior a real reactive
// client would, with a few lines of plain state instead. `mock`-prefixed
// so Jest allows referencing it from inside jest.mock's factory below.
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

// `dynamicClient.ui.auth.show()` opens Dynamic's own connect UI (outside
// this component tree, per above) — the mock stands in for "the user
// picked a wallet and it connected" by flipping the same reactive wallet
// state `useWallet` reads. `dynamicClient.auth.logout()` is the real
// disconnect call.
const mockDynamicUiAuthShow = jest.fn(async () => {
  mockWalletState = { connected: true, address: '0x2222222222222222222222222222222222222222' };
  mockNotifyWallet();
});
const mockDynamicAuthLogout = jest.fn(async () => {
  mockResetWalletState();
  mockNotifyWallet();
});

jest.mock('../../../dynamic/dynamicClient', () => ({
  dynamicClient: {
    ui: { auth: { show: () => mockDynamicUiAuthShow() } },
    auth: { logout: () => mockDynamicAuthLogout() },
  },
}));

// `useWalletConnectActions` itself is mocked (rather than relying on the
// dynamicClient stub above, which its real `switchToChain` would otherwise
// reach into) so the new silent auto-chain-switch can be asserted on
// directly — `connect`/`disconnect` still route through the same
// mockDynamicUiAuthShow/mockDynamicAuthLogout the dynamicClient mock used
// to drive directly, so every existing connect/disconnect test still
// exercises the same reactive wallet-state flip.
const mockSwitchToChain = jest.fn();
jest.mock('../../../dynamic/useWalletConnectActions', () => ({
  useWalletConnectActions: () => ({
    connect: () => mockDynamicUiAuthShow(),
    disconnect: () => mockDynamicAuthLogout(),
    switchToChain: (chainId: string) => mockSwitchToChain(chainId),
  }),
}));

// SwapScreen fetches the live token catalog via useSwapTokens (which hits
// the real backend) — tests get a fixed synchronous list instead, both to
// avoid real network calls and so results don't depend on Squid's catalog
// not changing out from under the tests.
jest.mock('../useSwapTokens', () => {
  const tokens = [
    { id: 'eth-native', symbol: 'ETH', name: 'Ethereum', chainName: 'Ethereum', chainId: '1', address: 'native', logoUri: 'https://example.com/eth.png', type: 'crypto', decimals: 18 },
    { id: 'weth-ethereum', symbol: 'WETH', name: 'Wrapped Ether', chainName: 'Ethereum', chainId: '1', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', logoUri: 'https://example.com/weth.png', type: 'crypto', decimals: 18 },
    { id: 'usdc-ethereum', symbol: 'USDC', name: 'USDC', chainName: 'Ethereum', chainId: '1', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', logoUri: 'https://example.com/usdc.png', type: 'crypto', decimals: 6 },
    { id: 'usdc-base', symbol: 'USDC', name: 'USDC', chainName: 'Base', chainId: '8453', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', logoUri: 'https://example.com/usdc-base.png', type: 'crypto', decimals: 6 },
    { id: 'usdt-ethereum', symbol: 'USDT', name: 'USDT', chainName: 'Ethereum', chainId: '1', address: '0xdac17f958d2ee523a2206206994597c13d831ec7', logoUri: 'https://example.com/usdt.png', type: 'crypto', decimals: 6 },
    { id: 'sol-native', symbol: 'SOL', name: 'Solana', chainName: 'Solana', chainId: 'solana-mainnet-beta', address: 'native', logoUri: 'https://example.com/sol.png', type: 'crypto', decimals: 9 },
    { id: 'pol-native', symbol: 'POL', name: 'POL', chainName: 'Polygon', chainId: '137', address: 'native', logoUri: 'https://example.com/pol.png', type: 'crypto', decimals: 18 },
    { id: 'bnb-native', symbol: 'BNB', name: 'Binance', chainName: 'BNB Chain', chainId: '56', address: 'native', logoUri: 'https://example.com/bnb.png', type: 'crypto', decimals: 18 },
    { id: 'ghs-momo', symbol: 'GHS', name: 'Ghana Cedi (Mobile Money)', chainName: 'Mobile Money', chainId: '', address: 'native', logoUri: 'https://example.com/gh.png', type: 'fiat', decimals: 2 },
    { id: 'ngn-fiat', symbol: 'NGN', name: 'Nigerian Naira', chainName: 'Bank Transfer', chainId: '', address: 'native', logoUri: 'https://example.com/ng.png', type: 'fiat', decimals: 2 },
  ];
  return { useSwapTokens: () => ({ tokens, loading: false, error: null }) };
});

// Likewise for the live quote and balance hooks — a fixed quote-less,
// balance-2.4531 result keeps every existing assertion's math (all written
// against the old MOCK_USD_PRICES/MOCK_BALANCES tables) valid via a fixed
// mock quote instead — SwapScreen has no fallback math of its own anymore
// once mocks were removed in favor of the real quote endpoints, so a test
// exercising "type an amount, see it convert" needs *some* resolved quote
// to convert through. `mockSwapQuoteResult` is a plain mutable object (not
// the reactive useSyncExternalStore pattern used for wallet state above) —
// tests read it once per render, which is enough since nothing here
// simulates a quote resolving mid-test. This fixture is a crypto<->crypto
// (ETH -> USDC) pair, so `exchangeRate` is already "toToken per fromToken"
// same as SwapScreen expects — the fiat-leg inversion it also does only
// kicks in when fromToken.type === 'fiat', which this fixture never is.
let mockSwapQuoteResult: { quote: { exchangeRate: string; fees: { totalFee: string }; output: { currency: string } } | null; loading: boolean; error: string | null } = {
  quote: { exchangeRate: '3245.67', fees: { totalFee: '0.0001' }, output: { currency: 'USDC' } },
  loading: false,
  error: null,
};
// SwapScreen now derives both amounts straight from the quote's own
// `input`/`output.amount` (real bidirectional quoting — see useSwapQuote's
// `inputSide` doc), not from `exchangeRate` multiplication, so the mock has
// to answer with a real amount on whichever side wasn't the one "typed."
// Deriving it here from the fixed `exchangeRate` above keeps every existing
// test's numbers (all written against that same rate) correct regardless of
// which side (`inputSide`) the component happens to be driving the quote
// off of, without every `mockSwapQuoteResult` fixture needing its own
// `input`/`output.amount` pair.
jest.mock('../useSwapQuote', () => ({
  useSwapQuote: ({ amount, inputSide }: { amount: number; inputSide: 'from' | 'to' }) => {
    if (!mockSwapQuoteResult.quote) return mockSwapQuoteResult;
    const rate = parseFloat(mockSwapQuoteResult.quote.exchangeRate);
    const inputAmount = inputSide === 'from' ? amount : rate > 0 ? amount / rate : 0;
    const outputAmount = inputSide === 'from' ? amount * rate : amount;
    return {
      ...mockSwapQuoteResult,
      quote: {
        ...mockSwapQuoteResult.quote,
        input: { amount: String(inputAmount) },
        output: { ...mockSwapQuoteResult.quote.output, amount: String(outputAmount) },
      },
    };
  },
}));
// Real crypto-crypto swap execution (signs + sends an actual on-chain tx) —
// mocked here so tests can control resolve/reject timing without a wallet.
const mockSwapExecute = jest.fn();
jest.mock('../useSwapExecution', () => ({
  useSwapExecution: () => ({ execute: (...args: unknown[]) => mockSwapExecute(...args) }),
}));
// Real plain-transfer execution (Send-to-address, same token) — mocked for
// the same reason as useSwapExecution above.
const mockTokenTransfer = jest.fn();
jest.mock('../useTokenTransfer', () => ({
  useTokenTransfer: () => ({ transfer: (...args: unknown[]) => mockTokenTransfer(...args) }),
}));
// Real ENS resolution (`/api/ens/address`) — mocked so a test can decide what
// a typed name resolves to, and exercise the resolving/unresolvable states,
// without a network call or its debounce.
type MockEnsState = { address: string | null; avatar: string | null; loading: boolean; failed: boolean };
const mockEnsIdle: MockEnsState = { address: null, avatar: null, loading: false, failed: false };
let mockEnsState: MockEnsState = mockEnsIdle;
jest.mock('../useEnsResolution', () => ({
  useEnsResolution: (name: string | null) => (name ? mockEnsState : mockEnsIdle),
}));
// Real send-to-email/phone (app-transfer intent -> pool deposit -> confirm).
// `contactSendBlockedReason` is pure logic, duplicated here rather than
// requireActual'd for the same reason `rampAmountBelowMin` is below: the real
// module imports api/appTransfer -> api/client.ts, which reads env at import.
const mockSendToContact = jest.fn();
jest.mock('../useContactSend', () => ({
  useContactSend: () => ({ sendToContact: (...args: unknown[]) => mockSendToContact(...args) }),
  contactSendBlockedReason: (token: { type: string; address: string; chainId: string; symbol: string; chainName: string }) => {
    const EVM_CHAIN_IDS = new Set(['1', '8453', '56', '137', '42161', '10', '43114']);
    if (token.type !== 'crypto') {
      return 'Coming soon. Pick a crypto token to send to a phone number or email.';
    }
    if (token.address === 'native') {
      return `Can't send ${token.symbol} that way yet. Try a token like USDC.`;
    }
    if (!EVM_CHAIN_IDS.has(token.chainId)) {
      return `${token.chainName} isn't supported for this yet.`;
    }
    return null;
  },
}));
// Real swap-then-forward (recipient gets a different token than what's being
// sent) — same duplication reasoning for its pure guard.
const mockSwapAndForward = jest.fn();
jest.mock('../useSwapAndForward', () => ({
  useSwapAndForward: () => ({ swapAndForward: (...args: unknown[]) => mockSwapAndForward(...args) }),
  swapAndForwardBlockedReason: (
    fromToken: { chainId: string; symbol: string; chainName: string },
    toToken: { chainId: string; address: string; symbol: string; chainName: string },
  ) => {
    if (fromToken.chainId !== toToken.chainId) {
      return `Cross-chain sends aren't available yet. Pick a token on ${fromToken.chainName}.`;
    }
    if (toToken.address === 'native') {
      return `Can't send ${toToken.symbol} that way yet. Try USDC, or send ${fromToken.symbol} directly.`;
    }
    return null;
  },
}));
// Real payment requests (`POST /api/public/requests`).
const mockCreatePaymentRequest = jest.fn();
jest.mock('../../../api/paymentRequests', () => ({
  createPaymentRequest: (...args: unknown[]) => mockCreatePaymentRequest(...args),
}));
// The pay-link copy action — stubbed so the assertion is on what this screen
// hands the clipboard, not on a real platform clipboard. `getStringAsync` is
// stubbed too: SwapScreen renders MomoSheet, whose "paste address" step reads
// from the clipboard, and a partial module mock would leave that undefined.
const mockSetStringAsync = jest.fn(async (_value: string) => true);
jest.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => mockSetStringAsync(value),
  getStringAsync: async () => '',
}));
// `Linking.createURL` reads the app manifest via expo-constants to resolve
// a scheme — nothing this environment has (no real app.json load), so it
// throws outside a real Expo runtime. A fixed stand-in is enough: nothing
// here asserts on the exact deep-link string.
jest.mock('expo-linking', () => ({
  createURL: (path: string, options?: { queryParams?: Record<string, string> }) => {
    const qs = options?.queryParams ? `?${new URLSearchParams(options.queryParams).toString()}` : '';
    return `morapay://${path}${qs}`;
  },
}));
// The real hook hits `/api/public/validate/momo` via api/client.ts, which
// reads env vars at import time — these tests never open the momo sheet
// far enough to exercise it, so a no-op stand-in avoids pulling that
// import chain in at all.
jest.mock('../useValidateMomo', () => ({
  useValidateMomo: () => ({ accountName: null, loading: false, failed: false }),
}));
// Real institution/bank lists (`/api/public/ramp/banks`, `/api/public/fiat/banks`)
// and the Paystack NUBAN resolver — controllable, empty by default (matching
// what the real hooks would resolve to against no live backend in this
// environment), so existing tests are unaffected; the Receive-mode GHS/NGN
// destination tests below override these.
let mockRampBanksState: { mobileMoney: { code: string; name: string }[]; banks: { code: string; name: string }[]; loading: boolean } = {
  mobileMoney: [],
  banks: [],
  loading: false,
};
jest.mock('../useRampBanks', () => ({
  useRampBanks: () => mockRampBanksState,
}));
let mockFiatBanksState: { banks: { id: number; name: string; code: string; slug: string; country: string; currency: string; type: string }[]; loading: boolean } = {
  banks: [],
  loading: false,
};
jest.mock('../useFiatBanks', () => ({
  useFiatBanks: () => mockFiatBanksState,
}));
let mockBankResolution: { accountName: string | null; loading: boolean; failed: boolean } = {
  accountName: null,
  loading: false,
  failed: false,
};
jest.mock('../useResolveBankAccount', () => ({
  useResolveBankAccount: () => mockBankResolution,
}));
// Real onramp execution (`/api/public/ramp/*`) — none of these tests drive
// MomoSheet far enough to call it, but api/ramp.ts pulls in api/client.ts's
// env-var-at-import-time check, so it still needs a stand-in to import cleanly.
jest.mock('../../../api/ramp', () => ({
  initiateOnramp: jest.fn(),
  startOnrampMobileMoney: jest.fn(),
  verifyOnrampOtp: jest.fn(),
  getRampTransaction: jest.fn(),
  isRampFullySettled: () => false,
}));
// Real onramp/offramp min/max (`/api/public/ramp/limits`) — `null` by
// default (no limit enforced) so existing tests are unaffected; individual
// tests override `mockRampLimits` to exercise the "Minimum buy is X"
// message. `rampAmountBelowMin` itself is pure logic, so it's kept real.
type MockRampLimits = { currency: string; buy?: { minFiat: number; maxFiat: number }; sell?: { minToken: number; maxToken: number } } | null;
let mockRampLimits: MockRampLimits = null;
jest.mock('../useRampLimits', () => ({
  useRampLimits: () => mockRampLimits,
  // Real logic duplicated here rather than jest.requireActual'd — that
  // pulls in the real module's own import of api/rampLimits.ts -> api/
  // client.ts, which reads env vars at import time same as every other
  // api/* module mocked in this file.
  rampAmountBelowMin: (
    amountMajor: number,
    limits: MockRampLimits,
    mode: 'onramp' | 'offramp',
    tokenSymbol = 'USDC',
  ): string | null => {
    if (!limits || !Number.isFinite(amountMajor) || amountMajor <= 0) return null;
    const currency = (limits.currency || '').toUpperCase() || 'GHS';
    const token = tokenSymbol.trim().toUpperCase() || 'USDC';
    if (mode === 'onramp' && limits.buy?.minFiat != null && amountMajor < limits.buy.minFiat) {
      return `Minimum buy is ${limits.buy.minFiat.toLocaleString()} ${currency}.`;
    }
    if (mode === 'onramp' && limits.buy?.maxFiat != null && amountMajor > limits.buy.maxFiat) {
      return `Maximum buy is ${limits.buy.maxFiat.toLocaleString()} ${currency}.`;
    }
    if (mode === 'offramp' && limits.sell?.minToken != null && amountMajor < limits.sell.minToken) {
      return `Minimum sell is ${limits.sell.minToken} ${token}.`;
    }
    if (mode === 'offramp' && limits.sell?.maxToken != null && amountMajor > limits.sell.maxToken) {
      return `Maximum sell is ${limits.sell.maxToken.toLocaleString()} ${token}.`;
    }
    return null;
  },
}));
jest.mock('../useWalletBalance', () => ({
  useWalletBalance: (_address: unknown, token: { id: string }) => {
    const BALANCES: Record<string, number> = {
      'eth-native': 2.4531,
      'weth-ethereum': 1.02,
      'usdc-ethereum': 850,
      'usdc-base': 240.5,
      'usdt-ethereum': 320.1,
      'sol-native': 14.7,
      'pol-native': 1200,
      'bnb-native': 3.15,
    };
    return { balance: BALANCES[token.id] ?? 0, loading: false };
  },
}));

import { SwapScreen } from '../SwapScreen';
import { swapColors } from '../theme';
import { TransactionStoreProvider } from '../../transactions/TransactionStoreContext';

function flatStyle(style: unknown) {
  const styleArray = Array.isArray(style) ? style.flat(Infinity) : [style];
  return Object.assign({}, ...styleArray);
}

const testMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// DevTransactionSimulator (rendered inside SwapScreen) calls useNavigation()
// for its "Preview Pay"/"Preview Claim" buttons — that throws outside a real
// navigator, so SwapScreen needs to be an actual registered screen here, not
// just rendered standalone. `Pay`/`Claim` are real placeholder screens (not
// asserted on by these tests) purely so a `navigate()` call from the dev
// panel has somewhere real to land instead of erroring.
type TestParamList = { Swap: undefined; Pay: { linkId: string; transactionId?: string }; Claim: { claimLinkId: string } };
const TestStack = createNativeStackNavigator<TestParamList>();
function PayPlaceholder() {
  return <Text>pay preview</Text>;
}
function ClaimPlaceholder() {
  return <Text>claim preview</Text>;
}

function renderSwapScreen() {
  return render(
    <SafeAreaProvider initialMetrics={testMetrics}>
      <TransactionStoreProvider>
        <NavigationContainer>
          <TestStack.Navigator screenOptions={{ headerShown: false }}>
            <TestStack.Screen name="Swap" component={SwapScreen} />
            <TestStack.Screen name="Pay" component={PayPlaceholder} />
            <TestStack.Screen name="Claim" component={ClaimPlaceholder} />
          </TestStack.Navigator>
        </NavigationContainer>
      </TransactionStoreProvider>
    </SafeAreaProvider>,
  );
}

// The real connect UI lives inside dynamicClient.reactNative.WebView, not
// this component tree — "connecting" here means triggering the same
// dynamicClient.ui.auth.show() call the app makes, whose mock immediately
// reports a connected wallet (see the dynamicClient mock above).
async function connectWallet() {
  await fireEvent.press(screen.getByTestId('swap-cta'));
}

// Picks a token via the "from"/"to" picker sheet — used by tests whose
// point is amount-entry/precision/rate mechanics rather than "the
// default pair," so they stay correct regardless of what SwapScreen's own
// DEFAULT_FROM_TOKEN/DEFAULT_TO_TOKEN happen to be.
async function selectFromToken(id: string) {
  await fireEvent.press(screen.getByTestId('from-amount-input-unit'));
  await fireEvent.press(screen.getByTestId(`token-row-${id}`));
}
async function selectToToken(id: string) {
  await fireEvent.press(screen.getByTestId('to-amount-input-unit'));
  await fireEvent.press(screen.getByTestId(`token-row-${id}`));
}
// Restores the pair that used to be SwapScreen's own hardcoded default
// (ETH-mainnet -> USDC-mainnet) explicitly via the picker — one volatile,
// many-decimal leg and one stable, 2-decimal leg — for tests that need
// exactly that shape and were originally written/verified against it, but
// aren't actually testing "the default pair" itself.
async function selectEthUsdcPair() {
  await selectFromToken('eth-native');
  await selectToToken('usdc-ethereum');
}

beforeEach(async () => {
  mockResetWalletState();
  mockDynamicUiAuthShow.mockClear();
  mockDynamicAuthLogout.mockClear();
  mockSwitchToChain.mockClear();
  mockSwapQuoteResult = {
    quote: { exchangeRate: '3245.67', fees: { totalFee: '0.0001' }, output: { currency: 'USDC' } },
    loading: false,
    error: null,
  };
  mockSwapExecute.mockReset().mockResolvedValue('0xtxhash');
  mockTokenTransfer.mockReset().mockResolvedValue('0xtxhash');
  mockEnsState = mockEnsIdle;
  mockSendToContact.mockReset().mockResolvedValue({ transactionId: 'tx-1', txHash: '0xdeposit', confirmed: true, notified: true });
  mockSwapAndForward
    .mockReset()
    .mockResolvedValue({ swapTxHash: '0xswap', transferTxHash: '0xforward', forwardedAmount: '99.5' });
  mockCreatePaymentRequest.mockReset().mockResolvedValue({
    id: 'req-1',
    code: 'REQAB12CD',
    linkId: 'link-1',
    transactionId: 'tx-1',
    claimId: 'claim-1',
    claimCode: 'CLAIM123',
    claimLinkId: 'clink-1',
    payLink: 'https://morapay.io/pay/link-1',
  });
  mockSetStringAsync.mockClear();
  mockRampLimits = null;
  mockRampBanksState = { mobileMoney: [], banks: [], loading: false };
  mockFiatBanksState = { banks: [], loading: false };
  mockBankResolution = { accountName: null, loading: false, failed: false };
  // The official AsyncStorage jest mock (jest.setup.env.js) is an
  // in-memory store that is NOT cleared between tests in the same file —
  // without this, a test that picks a token (which now calls
  // saveLastTradedTokens) leaks its choice into a later test's initial
  // mount via SwapScreen's own restore-on-mount effect.
  await AsyncStorage.clear();
});

describe('SwapScreen', () => {
  it('defaults to USDC -> ETH (both on Base) on the Swap tab, amount inputs starting at each token\'s own decimal zero', async () => {
    await renderSwapScreen();
    expect(screen.getByRole('button', { name: 'Swap', selected: true })).toBeTruthy();
    // Zero is shown at the selected token's own precision rather than a
    // bare "0" — 2 decimals for USDC (dollar-pegged, shown like currency
    // despite its 6 on-chain decimals), 6 for ETH (capped from its native
    // 18) — so a small crypto amount always has somewhere to be typed into
    // from the start.
    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.00');
    expect(screen.getByTestId('to-amount-input').props.value).toBe('0.000000');
    expect(screen.getByTestId('from-amount-input-unit').props.accessibilityLabel).toBe(
      'Choose token, currently USDC',
    );
    expect(screen.getByTestId('to-amount-input-unit').props.accessibilityLabel).toBe(
      'Choose token, currently ETH',
    );
    expect(screen.queryByText('Instant swap')).toBeNull();
  });

  it('lets the user type a custom "from" amount, computing "to"', async () => {
    await renderSwapScreen();
    // Pinned to ETH -> USDC explicitly: SwapScreen's own default "from" is
    // now the stable, 2-decimal USDC, but this test's whole point is the
    // many-decimal (ETH, 6) precision path.
    await selectEthUsdcPair();
    // Calculator-style entry, keyed to the selected token's own decimal
    // precision (ETH is capped at 6, not a flat 2) — '300' is what three
    // keystrokes (3, 0, 0) converge to at the millionths place, i.e.
    // 0.0003 ETH, exactly the kind of small crypto amount a fiat-style
    // 2-decimal-only field couldn't express.
    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '300');

    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.000300');
    // USDC is dollar-pegged, so it's shown to 2 decimals despite the "to"
    // side's underlying value carrying more precision.
    expect(screen.getByTestId('to-amount-input').props.value).toBe('0.97'); // 0.0003 ETH * $3245.67
  });

  it('shows a skeleton in place of "you will receive", not an invented number, while no real quote has resolved yet', async () => {
    // No more flat mock exchange-rate table to fall back to — an amount
    // typed before the real quote resolves has nothing to convert through,
    // so the figure is skeleton-loaded rather than showing a guessed one.
    mockSwapQuoteResult = { quote: null, loading: true, error: null };
    await renderSwapScreen();
    // Pinned to the many-decimal ETH leg — the default "from" is now the
    // stable, 2-decimal USDC.
    await selectFromToken('eth-native');
    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '300');

    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.000300');
    expect(screen.queryByTestId('to-amount-input')).toBeNull();
    expect(screen.getByTestId('amount-row-skeleton')).toBeTruthy();
    expect(screen.getByTestId('footer-value-skeleton')).toBeTruthy();
  });

  it('swaps the skeleton back out for the real figure once a quote resolves', async () => {
    mockSwapQuoteResult = { quote: null, loading: true, error: null };
    await renderSwapScreen();
    await selectFromToken('eth-native');
    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '300');
    expect(screen.getByTestId('amount-row-skeleton')).toBeTruthy();

    mockSwapQuoteResult = {
      quote: { exchangeRate: '3245.67', fees: { totalFee: '0.0001' }, output: { currency: 'USDC' } },
      loading: false,
      error: null,
    };
    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '3000'); // re-trigger a render

    expect(screen.queryByTestId('amount-row-skeleton')).toBeNull();
    expect(screen.getByTestId('to-amount-input')).toBeTruthy();
  });

  it('lets the user type into "you will receive", back-computing "from"', async () => {
    await renderSwapScreen();
    // Pinned to ETH -> USDC: this test needs "to" to be the stable,
    // 2-decimal leg, but SwapScreen's own default "to" is now the
    // non-stable ETH.
    await selectEthUsdcPair();
    // USDC is dollar-pegged, so its field keeps the familiar 2-decimal
    // (cents-style) entry — '9500' is four keystrokes converging on 95.00.
    await fireEvent.changeText(screen.getByTestId('to-amount-input'), '9500'); // 95.00

    expect(screen.getByTestId('to-amount-input').props.value).toBe('95.00');
    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.029270'); // 95 USDC / $3245.67
  });

  it('lets the user type a USD amount on the "from" side (fromToken not stable, toToken is) and back-computes "from" via a reverse quote', async () => {
    await renderSwapScreen();
    // Pinned to ETH -> USDC: ETH isn't a USD anchor, USDC is — so a USD
    // figure typed on the "from" side has to convert through the "to"
    // side's stablecoin, i.e. exactly the reverse-quote (inputSide: 'to')
    // path, same underlying mechanism as typing directly into "to". This
    // needs an explicit pick now — SwapScreen's own default pair is the
    // mirror image (stable "from", non-stable "to"), which the next test
    // below exercises via the default directly.
    await selectEthUsdcPair();
    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Switch between token and USD' })[0],
    );
    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '9500'); // $95.00

    expect(screen.getByTestId('from-amount-input').props.value).toBe('95.00');
    expect(screen.getByTestId('to-amount-input').props.value).toBe('95.00'); // USDC is 1:1 with USD
    expect(screen.getByText('0.029270 ETH')).toBeTruthy(); // secondary line: 95 USDC / $3245.67
  });

  it('lets the user type a USD amount on the "from" side when fromToken IS stable (the new default pair), 1:1, no quote needed', async () => {
    await renderSwapScreen(); // default pair: USDC (stable) -> ETH
    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Switch between token and USD' })[0],
    );
    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '9500'); // $95.00

    // USDC is itself the $-anchor, so this is the direct 1:1 branch — no
    // reverse quote through "to" needed at all.
    expect(screen.getByTestId('from-amount-input').props.value).toBe('95.00');
    expect(screen.getByText('95.00 USDC')).toBeTruthy(); // secondary line: the token amount, unconverted
  });

  it('lets the user type into "to" for an onramp too, estimating "from" off the last real rate', async () => {
    await renderSwapScreen();
    // Pinned "to" to USDC: this test needs a stable "to" leg, but
    // SwapScreen's own default "to" is now the non-stable ETH.
    await selectToToken('usdc-ethereum');
    await fireEvent.press(screen.getByTestId('from-amount-input-unit'));
    await fireEvent.press(screen.getByTestId('token-row-ghs-momo')); // GHS -> USDC is an onramp

    // The backend can't take a real reverse (`inputSide: 'to'`) quote for
    // ONRAMP, so a rate has to exist before an estimate off "to" means
    // anything — same as it would from having already loaded/typed once.
    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '100000'); // 1,000.00 GHS
    expect(screen.getByTestId('to-amount-input').props.value).toBe('3,245,670.00'); // 1,000 * 3245.67

    // Typing into "to" now works instead of no-op'ing: it's taken literally
    // for display, while "from" converts through the last known rate and
    // gets asked about for real (a forward, `inputSide: 'from'` quote).
    await fireEvent.changeText(screen.getByTestId('to-amount-input'), '9500'); // 95.00 USDC
    expect(screen.getByTestId('to-amount-input').props.value).toBe('95.00');
    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.03'); // 95 / 3245.67 GHS, GHS's own 2 decimals

    // Same for a USD figure typed on the "to" side (USDC is 1:1 with USD).
    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Switch between token and USD' })[1],
    );
    await fireEvent.changeText(screen.getByTestId('to-amount-input'), '9500'); // $95.00
    expect(screen.getByTestId('to-amount-input').props.value).toBe('95.00');
    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.03');
  });

  it('lets the user type into "to" for an offramp too, estimating "from" off the last real rate', async () => {
    await renderSwapScreen();
    // Pinned "from" to ETH: this test needs a volatile, 6-decimal "from"
    // leg, but SwapScreen's own default "from" is now the stable USDC.
    await selectFromToken('eth-native');
    await fireEvent.press(screen.getByTestId('to-amount-input-unit'));
    await fireEvent.press(screen.getByTestId('fiat-pick-ghs-momo')); // ETH -> GHS is an offramp

    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000000'); // 1.000000 ETH
    expect(screen.getByTestId('to-amount-input').props.value).toBe('3,245.67'); // 1 * 3245.67 GHS

    await fireEvent.changeText(screen.getByTestId('to-amount-input'), '162284'); // 1,622.84 GHS ("you will receive")
    expect(screen.getByTestId('to-amount-input').props.value).toBe('1,622.84');
    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.500002'); // 1,622.84 / 3245.67 ETH
  });

  it('shifts digits like a calculator as the user types, at the token\'s own decimal place', async () => {
    await renderSwapScreen();
    // Pinned to ETH — the default "from" is now the 2-decimal USDC, but
    // this test's point is the many-decimal (6) precision path.
    await selectFromToken('eth-native');

    // Each step is what the native field holds right before we reformat it:
    // the previously-formatted value with the newly typed digit appended.
    // ETH's 6 decimals means each new digit enters at the millionths place.
    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '3');
    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.000003');

    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '0.0000030');
    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.000030');

    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '0.0000300');
    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.000300');
  });

  it('shifts back down on backspace, settling back to the token\'s decimal zero', async () => {
    await renderSwapScreen();
    // Pinned to ETH — the default "from" is now the 2-decimal USDC.
    await selectFromToken('eth-native');

    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '300000'); // 0.300000
    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.300000');

    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '0.30000'); // backspace
    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.030000');

    await fireEvent.changeText(screen.getByTestId('from-amount-input'), ''); // backspace down to empty
    expect(screen.getByTestId('from-amount-input').props.value).toBe('0.000000'); // ETH's own decimal zero
  });

  it('computes both amounts from the selected percent of balance', async () => {
    await renderSwapScreen();
    // Percent pills need BOTH a wallet connection AND a known balance to
    // take a percentage of — the default "from" (USDC) is stable, so
    // connecting is what flips `hasKnownBalance` true and swaps the quick-
    // amount-pills row back to percent pills (see the dedicated
    // "quick amount pills" tests below for the disconnected case).
    await connectWallet();
    await fireEvent.press(screen.getByRole('button', { name: '25%' }));

    // 25% of the 240.5 USDC balance. The mock quote's fixed rate
    // (3245.67) isn't meant to be economically sane in either direction —
    // it's the same fixture every test uses to verify the math contract,
    // not a real USDC/ETH price.
    expect(screen.getByTestId('from-amount-input').props.value).toBe('60.13'); // 25% of 240.5 USDC
    expect(screen.getByTestId('to-amount-input').props.value).toBe('195,145.908750'); // 60.125 * 3245.67, ETH's 6 decimals
  });

  it('switches the "from" field to USD via its convert icon', async () => {
    await renderSwapScreen();
    // Pinned to ETH -> USDC: a non-stable "from" is what makes the token
    // <-> USD conversion this test checks actually show a different
    // number (USDC, the new default "from", is already displayed like USD
    // 1:1, so toggling it wouldn't demonstrate a real conversion).
    await selectEthUsdcPair();
    await connectWallet();
    await fireEvent.press(screen.getByRole('button', { name: '25%' }));
    await fireEvent.press(
      screen.getAllByRole('button', { name: 'Switch between token and USD' })[0],
    );

    expect(screen.getByTestId('from-amount-input').props.value).toBe('1,990.49'); // comma-formatted
    expect(screen.getByText('0.613275 ETH')).toBeTruthy(); // secondary line flips to the token amount
  });

  it('opens the token picker and switches the "from" token', async () => {
    await renderSwapScreen();
    await fireEvent.press(screen.getByTestId('from-amount-input-unit'));

    expect(screen.getByPlaceholderText('search tokens')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('token-row-sol-native'));

    // sheet closes and the from-side label now reads the picked token
    expect(screen.queryByPlaceholderText('search tokens')).toBeNull();
    expect(screen.getByTestId('from-amount-input-unit').props.accessibilityLabel).toBe(
      'Choose token, currently SOL',
    );
  });

  it('surfaces fiat/mobile-money rails in their own carousel, without needing to search', async () => {
    await renderSwapScreen();
    await fireEvent.press(screen.getByTestId('from-amount-input-unit'));

    await fireEvent.press(screen.getByTestId('fiat-pick-ghs-momo'));

    expect(screen.getByTestId('from-amount-input-unit').props.accessibilityLabel).toBe(
      'Choose token, currently GHS',
    );
  });

  it('filters the token picker by search text', async () => {
    await renderSwapScreen();
    await fireEvent.press(screen.getByTestId('to-amount-input-unit'));
    await fireEvent.changeText(screen.getByPlaceholderText('search tokens'), 'polygon');

    expect(screen.getByTestId('token-row-pol-native')).toBeTruthy();
    expect(screen.queryByTestId('token-row-sol-native')).toBeNull();
  });

  it('switches to the Send tab, hiding the destination field until an amount is entered', async () => {
    await renderSwapScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));

    // Nothing to send to yet — the destination field only makes sense once
    // there's a nonzero amount, so it stays hidden rather than showing an
    // input the user has no reason to fill in yet.
    expect(screen.queryByText('Destination')).toBeNull();
    expect(screen.queryByText('You will receive')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1');
    expect(screen.getByText('Destination')).toBeTruthy();
  });

  describe('destination detection', () => {
    async function goToSendTab() {
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      // Destination only renders once an amount is entered.
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1');
    }

    it('shows no detected-type badge until something recognizable is typed', async () => {
      await renderSwapScreen();
      await goToSendTab();

      expect(screen.queryByText(/Address|Email|Phone Number/)).toBeNull();

      await fireEvent.changeText(screen.getByTestId('destination-input'), '0xabc');
      expect(screen.queryByText(/Address|Email|Phone Number/)).toBeNull();
    });

    it('detects an EVM address', async () => {
      await renderSwapScreen();
      await goToSendTab();
      await fireEvent.changeText(
        screen.getByTestId('destination-input'),
        '0x1234567890123456789012345678901234567890',
      );
      expect(screen.getByText('Ethereum, Base & other EVM chains')).toBeTruthy();
    });

    it('collapses a long address to fill its two-line budget once blurred, and expands back on focus', async () => {
      await renderSwapScreen();
      await goToSendTab();
      const input = screen.getByTestId('destination-input');
      const fullAddress = '0x1234567890123456789012345678901234567890';
      await fireEvent.changeText(input, fullAddress);

      await fireEvent(input, 'blur');
      // The field never actually measures a real width in this test
      // environment (no real layout pass), so it falls back to its
      // pre-layout guess (220px) — same math `destinationCharBudget` uses
      // live: floor(220 / (20 * 0.58)) * 2 lines = 36 characters, minus
      // the fixed 4-character tail and the "..." itself. This is
      // calibrated to genuinely fill close to two lines rather than
      // collapsing to something shorter than even one, unlike the old
      // fixed front=8/back=6 truncation this replaced.
      expect(screen.getByTestId('destination-input').props.value).toBe(
        '0x123456789012345678901234567...7890',
      );

      await fireEvent(input, 'focus');
      expect(screen.getByTestId('destination-input').props.value).toBe(fullAddress);
    });

    it('shows an address in full, untruncated, when it already fits the two-line budget', async () => {
      await renderSwapScreen();
      await goToSendTab();
      const input = screen.getByTestId('destination-input');
      // 36 characters total — exactly the budget the 220px fallback width
      // computes (see the test above) — so this shouldn't be shortened at
      // all, only a longer value should.
      const shortEnoughAddress = '0x123456789012345678901234567890123'; // 35 chars
      await fireEvent.changeText(input, shortEnoughAddress);

      await fireEvent(input, 'blur');
      expect(screen.getByTestId('destination-input').props.value).toBe(shortEnoughAddress);
    });

    it('sizes the field to one line for short content and two lines for long content, and shrinks back down again', async () => {
      await renderSwapScreen();
      await goToSendTab();
      const input = screen.getByTestId('destination-input');
      const flatStyleOf = (el: typeof input) =>
        Object.assign({}, ...(Array.isArray(el.props.style) ? el.props.style : [el.props.style]));

      // Starts at one line's height — nothing typed yet.
      expect(flatStyleOf(input).height).toBe(26);

      // 18 characters is exactly what the field's 220px pre-layout
      // fallback width fits on one line (see destinationCharsPerLine) —
      // one more than that needs a second line.
      await fireEvent.changeText(input, 'a'.repeat(18));
      expect(flatStyleOf(screen.getByTestId('destination-input')).height).toBe(26);

      await fireEvent.changeText(input, 'a'.repeat(19));
      expect(flatStyleOf(screen.getByTestId('destination-input')).height).toBe(52);

      // Shrinks back down once the content no longer needs two lines —
      // this is the bug this replaces: a web `<textarea>`'s own
      // `scrollHeight` can't report shorter than its own current height,
      // so a height derived from measuring the DOM node itself would get
      // stuck at two lines forever once it had grown that far even once
      // (confirmed live: a long address followed by a short email left
      // the box visibly stuck at two lines) — deriving height from the
      // displayed text's length instead sidesteps that entirely.
      await fireEvent.changeText(input, '0241234567');
      expect(flatStyleOf(screen.getByTestId('destination-input')).height).toBe(26);
    });

    it('keeps the same destination input across the phone-detection transition, not a fresh remount', async () => {
      await renderSwapScreen();
      await goToSendTab();
      const before = screen.getByTestId('destination-input');

      // '024123456' crosses the 9-digit local-number threshold that flips
      // detectedDestination into 'phone', which used to swap in a whole
      // separate element tree (losing focus mid-type).
      await fireEvent.changeText(before, '024123456');

      const after = screen.getByTestId('destination-input');
      expect(after).toBe(before);
    });

    it('detects a Solana address', async () => {
      await renderSwapScreen();
      await goToSendTab();
      await fireEvent.changeText(
        screen.getByTestId('destination-input'),
        'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
      );
      expect(screen.getByText('Solana Address')).toBeTruthy();
    });

    it('does not show a detection badge for an email destination — it would only repeat what was just typed', async () => {
      await renderSwapScreen();
      await goToSendTab();
      await fireEvent.changeText(screen.getByTestId('destination-input'), 'ama@example.com');
      expect(screen.queryByText('Email (redeemable once claimed)')).toBeNull();
    });

    it('does not show a detection badge for a Ghana mobile number', async () => {
      await renderSwapScreen();
      await goToSendTab();
      await fireEvent.changeText(screen.getByTestId('destination-input'), '0241234567');
      expect(screen.queryByText('MTN · Ghana')).toBeNull();
    });

    it('shows no country select for a non-phone destination', async () => {
      await renderSwapScreen();
      await goToSendTab();
      await fireEvent.changeText(
        screen.getByTestId('destination-input'),
        '0x1234567890123456789012345678901234567890',
      );
      expect(screen.queryByTestId('country-select')).toBeNull();
    });

    it('shows a Ghana country-select chip before a detected phone number, and lets the user change it', async () => {
      await renderSwapScreen();
      await goToSendTab();
      await fireEvent.changeText(screen.getByTestId('destination-input'), '0241234567');

      // The chip is intentionally debounced (see useDebouncedValue's use in
      // SwapScreen.tsx) so it doesn't pop in on every keystroke — wait for
      // it to settle before asserting on it.
      const select = await waitFor(() => screen.getByTestId('country-select'));
      expect(select.props.accessibilityLabel).toBe('Country, currently Ghana');

      await fireEvent.press(select);
      await fireEvent.press(screen.getByTestId('country-option-234')); // Nigeria

      expect(screen.getByTestId('country-select').props.accessibilityLabel).toBe('Country, currently Nigeria');
      // No detection badge for a contact destination (see the "does not show
      // a detection badge" tests above) — the country-select chip itself is
      // what shows the change.
      expect(screen.queryByText('Phone Number · Nigeria')).toBeNull();
    });
  });

  describe('Send / Receive switch', () => {
    it('defaults to Send, and switching to Receive relabels the CTA', async () => {
      await renderSwapScreen();
      await connectWallet();
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1');

      expect(screen.getByTestId('send-cta').props.accessibilityLabel).toBe('Send');

      await fireEvent.press(screen.getByRole('button', { name: 'Receive', selected: false }));

      // Receive mode shows the requester's own payout card, not the
      // Send-mode "Destination" card — the payer never touches this screen.
      expect(screen.queryByText('Destination')).toBeNull();
      expect(screen.getByText('Receive to')).toBeTruthy();
      // Still needs real payout details before it's actually "Request".
      expect(screen.getByTestId('send-cta').props.accessibilityLabel).toBe('Add Payout Details');

      await fireEvent.changeText(screen.getByTestId('receive-address-input'), '0x1234567890123456789012345678901234567890');
      expect(screen.getByTestId('send-cta').props.accessibilityLabel).toBe('Request');
      expect(screen.getByTestId('send-cta').props.accessibilityState?.disabled).toBe(false);
    });

    it('receive mode never blocks on insufficient funds', async () => {
      await renderSwapScreen();
      await connectWallet();
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.press(screen.getByRole('button', { name: 'Receive', selected: false }));

      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '5000000'); // 50,000.00 USDC, over the 240.5 USDC balance
      // A request just needs a real payout destination — supplied here so
      // this stays a test about the balance not blocking, nothing else.
      await fireEvent.changeText(screen.getByTestId('receive-address-input'), '0x1234567890123456789012345678901234567890');

      const button = screen.getByTestId('send-cta');
      expect(button.props.accessibilityLabel).toBe('Request');
      expect(button.props.accessibilityState?.disabled).toBe(false);

      // the balance chip itself shouldn't flag red either — receiving
      // doesn't spend the connected balance at all.
      const chip = screen.getByTestId('balance-chip');
      expect(flatStyle(chip.props.style).backgroundColor).not.toBe(swapColors.warningBg);
    });
  });

  describe('Send flow routing', () => {
    it('sending crypto to a wallet address requires picking a destination token before Send is enabled', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('eth-native');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000000'); // 1.000000 ETH
      await fireEvent.changeText(screen.getByTestId('destination-input'), '0x1234567890123456789012345678901234567890');

      const button = screen.getByTestId('send-cta');
      expect(button.props.accessibilityLabel).toBe('Choose Destination Token');
      expect(button.props.accessibilityState?.disabled).toBe(true);
      expect(screen.getByTestId('send-destination-token-pill').props.accessibilityLabel).toBe('Choose what they receive');

      await fireEvent.press(screen.getByTestId('send-destination-token-pill'));
      expect(screen.getByPlaceholderText('search tokens')).toBeTruthy(); // the real token picker, not a stand-in
      await fireEvent.press(screen.getByTestId('token-row-eth-native'));

      expect(screen.getByTestId('send-destination-token-pill').props.accessibilityLabel).toBe('Receiving ETH on Ethereum');
      expect(screen.getByTestId('send-cta').props.accessibilityLabel).toBe('Send');
      expect(screen.getByTestId('send-cta').props.accessibilityState?.disabled).toBe(false);
    });

    it('sends a plain transfer once the destination token matches what\'s being sent, and resets the form on success', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('eth-native');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000000'); // 1.000000 ETH
      await fireEvent.changeText(screen.getByTestId('destination-input'), '0x1234567890123456789012345678901234567890');
      await fireEvent.press(screen.getByTestId('send-destination-token-pill'));
      await fireEvent.press(screen.getByTestId('token-row-eth-native'));

      await act(async () => {
        await fireEvent.press(screen.getByTestId('send-cta'));
      });

      expect(mockTokenTransfer).toHaveBeenCalledWith({
        token: expect.objectContaining({ id: 'eth-native' }),
        toAddress: '0x1234567890123456789012345678901234567890',
        amount: '1',
      });
      expect(screen.getByTestId('send-success')).toBeTruthy();
      expect(screen.getByText(/Sent to/)).toBeTruthy();
      // The amount really did reset to 0, not just show a success message
      // on top of stale state — the destination field only ever renders
      // once there's a nonzero amount (same rule the Swap tab's own amount
      // entry follows), so its disappearance here is that reset happening.
      expect(screen.queryByTestId('destination-input')).toBeNull();
    });

    it('swaps and forwards when the recipient should get a different token on the same chain', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('eth-native');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000000');
      await fireEvent.changeText(screen.getByTestId('destination-input'), '0x1234567890123456789012345678901234567890');
      await fireEvent.press(screen.getByTestId('send-destination-token-pill'));
      await fireEvent.press(screen.getByTestId('token-row-usdc-ethereum')); // same chain, not native

      await act(async () => {
        await fireEvent.press(screen.getByTestId('send-cta'));
      });

      expect(mockSwapAndForward).toHaveBeenCalledWith({
        fromToken: expect.objectContaining({ id: 'eth-native' }),
        toToken: expect.objectContaining({ id: 'usdc-ethereum' }),
        amount: 1,
        toAddress: '0x1234567890123456789012345678901234567890',
        senderAddress: '0x2222222222222222222222222222222222222222',
      });
      // The plain-transfer path is deliberately NOT used for a different token.
      expect(mockTokenTransfer).not.toHaveBeenCalled();
      expect(screen.getByTestId('send-success')).toBeTruthy();
      expect(screen.getByText(/99\.5 USDC/)).toBeTruthy();
    });

    it('refuses a cross-chain destination token up front, without signing anything', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('eth-native');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000000');
      await fireEvent.changeText(screen.getByTestId('destination-input'), '0x1234567890123456789012345678901234567890');
      await fireEvent.press(screen.getByTestId('send-destination-token-pill'));
      await fireEvent.press(screen.getByTestId('token-row-sol-native')); // real, but another chain

      await act(async () => {
        await fireEvent.press(screen.getByTestId('send-cta'));
      });

      expect(mockSwapAndForward).not.toHaveBeenCalled();
      expect(mockTokenTransfer).not.toHaveBeenCalled();
      expect(screen.getByTestId('send-error')).toBeTruthy();
      expect(screen.getByText(/Cross-chain sends aren't available/)).toBeTruthy();
    });

    it('routes a fiat-source send-to-address through the real onramp flow, straight to the "form" step with the typed address preset', async () => {
      await renderSwapScreen();
      await selectFromToken('ghs-momo');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '10000'); // 100.00 GHS
      await fireEvent.changeText(screen.getByTestId('destination-input'), '0x1234567890123456789012345678901234567890');

      // Still needs a real destination token picked first — an onramp has
      // to know what it's actually buying for the recipient, same as the
      // crypto-source case.
      await fireEvent.press(screen.getByTestId('send-destination-token-pill'));
      await fireEvent.press(screen.getByTestId('token-row-eth-native'));

      await fireEvent.press(screen.getByTestId('send-cta'));

      // Straight to the momo form — no "where do you want to receive" step,
      // since the destination was already typed above.
      expect(screen.queryByTestId('momo-receive-address-input')).toBeNull();
      expect(screen.getByTestId('momo-phone-input')).toBeTruthy();
    });

    it('sends to an email through the real custody + claim flow', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('usdc-ethereum'); // ERC-20: pool deposits can't be a native token
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000'); // 10.00 USDC
      await fireEvent.changeText(screen.getByTestId('destination-input'), 'ama@example.com');

      await act(async () => {
        await fireEvent.press(screen.getByTestId('send-cta'));
      });

      expect(mockSendToContact).toHaveBeenCalledWith({
        fromToken: expect.objectContaining({ id: 'usdc-ethereum' }),
        toToken: expect.objectContaining({ id: 'usdc-ethereum' }),
        amount: 10,
        toAmount: 10,
        senderAddress: '0x2222222222222222222222222222222222222222',
        // A stable placeholder, not something this screen asks the sender
        // for — see SwapScreen.tsx's `PLACEHOLDER_PAYER_EMAIL`.
        senderEmail: 'sender@morapay.io',
        recipient: { kind: 'email', value: 'ama@example.com' },
      });
      expect(screen.getByTestId('contact-send-result-sheet')).toBeTruthy();
      expect(screen.getByText(/emailed ama@example.com their claim code/)).toBeTruthy();
      // No destination-token pill for a contact — there's no address whose
      // asset needs choosing.
      expect(screen.queryByTestId('send-destination-token-pill')).toBeNull();
    });

    it('says so plainly when the deposit landed but confirmation has not — never reporting a real send as a failure', async () => {
      mockSendToContact.mockResolvedValue({ transactionId: 'tx-1', txHash: '0xdeposit', confirmed: false, notified: true });
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('usdc-ethereum');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000');
      await fireEvent.changeText(screen.getByTestId('destination-input'), 'ama@example.com');

      await act(async () => {
        await fireEvent.press(screen.getByTestId('send-cta'));
      });

      expect(screen.queryByTestId('send-error')).toBeNull();
      expect(screen.getByTestId('contact-send-result-sheet')).toBeTruthy();
      expect(screen.getByText(/still confirming/)).toBeTruthy();
    });

    it('is honest when the claim details could not be emailed, without calling the send itself a failure', async () => {
      mockSendToContact.mockResolvedValue({ transactionId: 'tx-1', txHash: '0xdeposit', confirmed: true, notified: false });
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('usdc-ethereum');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000');
      await fireEvent.changeText(screen.getByTestId('destination-input'), 'ama@example.com');

      await act(async () => {
        await fireEvent.press(screen.getByTestId('send-cta'));
      });

      expect(screen.queryByTestId('send-error')).toBeNull();
      expect(screen.getByTestId('contact-send-result-sheet')).toBeTruthy();
      expect(screen.getByText(/couldn't email the claim details/)).toBeTruthy();
    });

    it('tells a phone-recipient sender we texted them their claim code', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('usdc-ethereum');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000');
      await fireEvent.changeText(screen.getByTestId('destination-input'), '+15551234567');

      await act(async () => {
        await fireEvent.press(screen.getByTestId('send-cta'));
      });

      expect(mockSendToContact).toHaveBeenCalledWith(expect.objectContaining({ recipient: { kind: 'phone', value: '+15551234567' } }));
      expect(screen.getByTestId('contact-send-result-sheet')).toBeTruthy();
      expect(screen.getByText(/texted \+15551234567 their claim code/)).toBeTruthy();
    });

    it('refuses a native gas token to a contact up front — Core cannot pool-deposit one', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('eth-native');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000000');
      await fireEvent.changeText(screen.getByTestId('destination-input'), 'ama@example.com');

      // The button itself goes to a disabled "Coming soon" state rather
      // than an enabled button that bounces a long error on press.
      expect(screen.getByTestId('send-cta').props.accessibilityState?.disabled).toBe(true);
      expect(screen.getByText('Coming soon')).toBeTruthy();
      expect(screen.getByText(/Try a token like USDC/)).toBeTruthy();

      await act(async () => {
        await fireEvent.press(screen.getByTestId('send-cta'));
      });
      expect(mockSendToContact).not.toHaveBeenCalled();
    });

    it('files a real payment request in Receive mode and surfaces the pay link', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('usdc-ethereum');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.press(screen.getByRole('button', { name: 'Receive', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000'); // 10.00 USDC
      await fireEvent.changeText(screen.getByTestId('receive-address-input'), '0x1234567890123456789012345678901234567890');

      // The payout destination is set — pressing Request opens the delivery
      // sheet, which collects both the requester's own contact and the
      // PAYER's, a different person who never fills anything in on this
      // screen.
      await fireEvent.press(screen.getByTestId('send-cta'));
      expect(screen.getByTestId('payment-request-delivery-sheet')).toBeTruthy();

      await fireEvent.changeText(screen.getByTestId('requester-identifier-input'), 'me@example.com');
      await fireEvent.changeText(screen.getByTestId('delivery-contact-input'), 'payer@example.com');
      await act(async () => {
        await fireEvent.press(screen.getByTestId('delivery-continue'));
      });

      expect(mockCreatePaymentRequest).toHaveBeenCalledWith({
        payerEmail: 'payer@example.com',
        payerPhone: undefined,
        requesterIdentifier: 'me@example.com',
        amount: '10',
        tokenSymbol: 'USDC',
        // Core's own chain code, not the numeric catalog id.
        chainCode: 'ETHEREUM',
        receiveSummary: '10.00 USDC on Ethereum',
        channels: ['EMAIL'],
        payoutTarget: '0x1234567890123456789012345678901234567890',
        payoutFiat: undefined,
        skipPaymentRequestNotification: false,
      });
      // The request's own result lives entirely in PayLinkSheet, opened
      // automatically — no separate inline summary on the main screen.
      expect(screen.queryByTestId('send-success')).toBeNull();
      expect(screen.getByTestId('pay-link-sheet-input').props.value).toBe('morapay:///pay/request/link-1?transactionId=tx-1');
      expect(screen.getByText(/REQAB12CD/)).toBeTruthy();
      expect(screen.getByTestId('pay-link-sheet')).toBeTruthy();
    });

    it('shows a QR code for the real pay link and copies it from the sheet', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('usdc-ethereum');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.press(screen.getByRole('button', { name: 'Receive', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000');
      await fireEvent.changeText(screen.getByTestId('receive-address-input'), '0x1234567890123456789012345678901234567890');
      await fireEvent.press(screen.getByTestId('send-cta'));
      await fireEvent.changeText(screen.getByTestId('requester-identifier-input'), 'me@example.com');
      await fireEvent.changeText(screen.getByTestId('delivery-contact-input'), 'payer@example.com');
      await act(async () => {
        await fireEvent.press(screen.getByTestId('delivery-continue'));
      });

      expect(screen.getByTestId('pay-link-sheet')).toBeTruthy();

      await act(async () => {
        await fireEvent.press(screen.getByTestId('pay-link-sheet-copy'));
      });
      expect(mockSetStringAsync).toHaveBeenCalledWith('morapay:///pay/request/link-1?transactionId=tx-1');
      expect(screen.getByTestId('pay-link-sheet-copy').props.accessibilityLabel).toBe('Link copied');
    });

    it('keeps the delivery sheet\'s Continue disabled until both contacts are filled in', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('usdc-ethereum');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.press(screen.getByRole('button', { name: 'Receive', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000');
      await fireEvent.changeText(screen.getByTestId('receive-address-input'), '0x1234567890123456789012345678901234567890');
      await fireEvent.press(screen.getByTestId('send-cta'));

      expect(screen.getByTestId('delivery-continue').props.accessibilityState?.disabled).toBe(true);

      await fireEvent.changeText(screen.getByTestId('delivery-contact-input'), 'payer@example.com');
      expect(screen.getByTestId('delivery-continue').props.accessibilityState?.disabled).toBe(true);

      await fireEvent.changeText(screen.getByTestId('requester-identifier-input'), 'me@example.com');
      expect(screen.getByTestId('delivery-continue').props.accessibilityState?.disabled).toBe(false);
    });

    it('will not create a request until the payer contact in the delivery sheet is a real email or phone', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('usdc-ethereum');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.press(screen.getByRole('button', { name: 'Receive', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000');
      await fireEvent.changeText(screen.getByTestId('receive-address-input'), '0x999999999999999999999999999999999999999a');

      await fireEvent.press(screen.getByTestId('send-cta'));
      expect(screen.getByTestId('payment-request-delivery-sheet')).toBeTruthy();

      await fireEvent.changeText(screen.getByTestId('requester-identifier-input'), 'me@example.com');
      // A wallet address isn't a channel the backend can bill over — the
      // Continue button stays disabled rather than letting this through.
      await fireEvent.changeText(screen.getByTestId('delivery-contact-input'), '0x1234567890123456789012345678901234567890');
      expect(screen.getByTestId('delivery-continue').props.accessibilityState?.disabled).toBe(true);

      await act(async () => {
        await fireEvent.press(screen.getByTestId('delivery-continue'));
      });
      expect(mockCreatePaymentRequest).not.toHaveBeenCalled();
    });

    it('requests GHS to a real momo institution code, not a guessed brand string', async () => {
      mockRampBanksState = { mobileMoney: [{ code: '0004', name: 'MTN Mobile Money' }], banks: [], loading: false };
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('ghs-momo');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.press(screen.getByRole('button', { name: 'Receive', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '10000'); // 100.00 GHS

      await fireEvent.changeText(screen.getByTestId('receive-momo-phone-input'), '0241234567');
      expect(screen.getByText('MTN')).toBeTruthy(); // detected from the prefix
      await fireEvent.changeText(screen.getByTestId('receive-momo-name-input'), 'Ama Mensah');

      await fireEvent.press(screen.getByTestId('send-cta'));
      await fireEvent.changeText(screen.getByTestId('requester-identifier-input'), 'me@example.com');
      await fireEvent.changeText(screen.getByTestId('delivery-contact-input'), 'payer@example.com');
      await act(async () => {
        await fireEvent.press(screen.getByTestId('delivery-continue'));
      });

      expect(mockCreatePaymentRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          chainCode: 'MOMO',
          payoutTarget: undefined,
          payoutFiat: {
            type: 'mobile_money',
            account_name: 'Ama Mensah',
            account_number: '0241234567',
            bank_code: '0004', // the real Quidax code, never the brand string "MTN"
            currency: 'GHS',
          },
        }),
      );
    });

    it('requests NGN to a resolved Paystack bank account', async () => {
      mockFiatBanksState = { banks: [{ id: 1, name: 'GTBank', code: '000013', slug: 'gtbank', country: 'Nigeria', currency: 'NGN', type: 'nuban' }], loading: false };
      await renderSwapScreen();
      await connectWallet();
      await fireEvent.press(screen.getByTestId('from-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('fiat-pick-ngn-fiat'));
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.press(screen.getByRole('button', { name: 'Receive', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '2500000'); // 25,000.00 NGN

      await fireEvent.press(screen.getByTestId('receive-ngn-bank-select'));
      await fireEvent.press(screen.getByTestId('receive-ngn-bank-1'));
      await fireEvent.changeText(screen.getByTestId('receive-ngn-account-number-input'), '0123456789');

      // Nothing resolved yet — the button stays on "Add Payout Details".
      expect(screen.getByTestId('send-cta').props.accessibilityLabel).toBe('Add Payout Details');

      mockBankResolution = { accountName: 'Chidi Okafor', loading: false, failed: false };
      await fireEvent.changeText(screen.getByTestId('receive-ngn-account-number-input'), '0123456780'); // re-trigger a render

      await fireEvent.press(screen.getByTestId('send-cta'));
      await fireEvent.changeText(screen.getByTestId('requester-identifier-input'), 'me@example.com');
      await fireEvent.changeText(screen.getByTestId('delivery-contact-input'), 'payer@example.com');
      await act(async () => {
        await fireEvent.press(screen.getByTestId('delivery-continue'));
      });

      expect(mockCreatePaymentRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          chainCode: 'BANK',
          payoutTarget: undefined,
          payoutFiat: {
            type: 'nuban',
            account_name: 'Chidi Okafor',
            account_number: '0123456780',
            bank_code: '000013',
            currency: 'NGN',
          },
        }),
      );
    });

    it('resolves an ENS name and sends to the address it points at', async () => {
      mockEnsState = {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        avatar: null,
        loading: false,
        failed: false,
      };
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('eth-native');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000000');
      await fireEvent.changeText(screen.getByTestId('destination-input'), 'vitalik.eth');

      // Reported as a resolved ENS destination, and treated as an address —
      // so it gets the same "what should they receive" pick.
      expect(screen.getByText(/ENS · 0xaaaa/)).toBeTruthy();
      await fireEvent.press(screen.getByTestId('send-destination-token-pill'));
      await fireEvent.press(screen.getByTestId('token-row-eth-native'));

      await act(async () => {
        await fireEvent.press(screen.getByTestId('send-cta'));
      });

      expect(mockTokenTransfer).toHaveBeenCalledWith({
        token: expect.objectContaining({ id: 'eth-native' }),
        // The resolved address, never the name itself.
        toAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        amount: '1',
      });
    });

    it('blocks an ENS name that does not resolve, and says so', async () => {
      mockEnsState = { address: null, avatar: null, loading: false, failed: true };
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('eth-native');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000000');
      await fireEvent.changeText(screen.getByTestId('destination-input'), 'nope.eth');

      expect(screen.getByText("That ENS name doesn't resolve")).toBeTruthy();
      const button = screen.getByTestId('send-cta');
      expect(button.props.accessibilityLabel).toBe('Check Destination');
      expect(button.props.accessibilityState?.disabled).toBe(true);
      expect(mockTokenTransfer).not.toHaveBeenCalled();
    });

    it('waits while an ENS name is still resolving rather than offering a live Send', async () => {
      mockEnsState = { address: null, avatar: null, loading: true, failed: false };
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('eth-native');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000000');
      await fireEvent.changeText(screen.getByTestId('destination-input'), 'vitalik.eth');

      expect(screen.getByText('Resolving ENS name…')).toBeTruthy();
      expect(screen.getByTestId('send-cta').props.accessibilityLabel).toBe('Resolving…');
      expect(screen.getByTestId('send-cta').props.accessibilityState?.disabled).toBe(true);
    });

    it('never leaves an enabled Send that silently does nothing for an unrecognizable destination', async () => {
      await renderSwapScreen();
      await connectWallet();
      await selectFromToken('eth-native');
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000000');
      await fireEvent.changeText(screen.getByTestId('destination-input'), 'not a destination');

      // The old behaviour was a live "Send" that fell through every routing
      // branch and returned without a word. Now the button itself reports
      // that the destination is the problem, and cannot be pressed.
      const button = screen.getByTestId('send-cta');
      expect(button.props.accessibilityLabel).toBe('Check Destination');
      expect(button.props.accessibilityState?.disabled).toBe(true);
      expect(mockTokenTransfer).not.toHaveBeenCalled();
      expect(mockSendToContact).not.toHaveBeenCalled();
    });
  });

  describe('wallet connection', () => {
    it('starts disconnected: the balance chip itself prompts to connect a wallet', async () => {
      await renderSwapScreen();

      expect(screen.getByTestId('swap-cta').props.accessibilityLabel).toBe('Connect Wallet');
      expect(screen.getByTestId('balance-chip')).toBeTruthy();
      // "Connect Wallet" now appears twice — the swap CTA and the chip.
      expect(screen.getAllByText('Connect Wallet').length).toBe(2);
    });

    it('tapping the disconnected balance chip opens Dynamic\'s own connect UI', async () => {
      await renderSwapScreen();
      await fireEvent.press(screen.getByTestId('balance-chip'));

      // The picker itself lives inside dynamicClient.reactNative.WebView, not
      // this component tree — this just confirms the real trigger fires.
      expect(mockDynamicUiAuthShow).toHaveBeenCalledTimes(1);

      await connectWallet();
      expect(screen.getByTestId('swap-cta').props.accessibilityLabel).toBe('Swap');
    });

    it('connecting reveals the balance readout, and its menu can disconnect again', async () => {
      await renderSwapScreen();
      await connectWallet();

      expect(screen.getByTestId('balance-chip')).toBeTruthy();
      expect(screen.getByRole('button', { name: '25%' })).toBeTruthy();
      expect(screen.getByTestId('swap-cta').props.accessibilityLabel).toBe('Swap');

      await fireEvent.press(screen.getByTestId('balance-chip'));
      expect(screen.getByTestId('wallet-menu')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('wallet-menu-disconnect'));
      expect(screen.getByTestId('swap-cta').props.accessibilityLabel).toBe('Connect Wallet');
    });

    it('silently nudges the wallet to the "from" token\'s own chain once connected, and again if "from" changes chain', async () => {
      await renderSwapScreen(); // defaults to USDC on Base (chain "8453")
      await connectWallet();

      expect(mockSwitchToChain).toHaveBeenCalledWith('8453');
      mockSwitchToChain.mockClear();

      // Switching "from" to a token on a different chain (Ethereum
      // mainnet) should trigger another silent switch attempt for the new
      // chain — this is what lets a connected wallet actually be on the
      // right chain for whichever token the user is about to check the
      // balance of or swap, without any explicit "switch network" step of
      // their own.
      await selectFromToken('eth-native');

      expect(mockSwitchToChain).toHaveBeenCalledWith('1');
    });

    it('never attempts a chain switch while disconnected', async () => {
      await renderSwapScreen();
      await selectFromToken('eth-native');

      expect(mockSwitchToChain).not.toHaveBeenCalled();
    });

    it('the wallet menu\'s "Switch Chain" item shows the "from" token\'s real chain and retries the same silent switch', async () => {
      await renderSwapScreen();
      await connectWallet();
      mockSwitchToChain.mockClear();

      await fireEvent.press(screen.getByTestId('balance-chip'));
      expect(screen.getByText('Base')).toBeTruthy(); // USDC-on-Base's real chainName, not a fake cycling label

      await fireEvent.press(screen.getByTestId('wallet-menu-switch-chain'));
      expect(mockSwitchToChain).toHaveBeenCalledWith('8453');
    });

    it('the Send button also prompts to connect a wallet when disconnected', async () => {
      await renderSwapScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));

      expect(screen.getByTestId('send-cta').props.accessibilityLabel).toBe('Connect Wallet');
      expect(screen.getByTestId('send-cta').props.accessibilityState?.disabled).toBe(false);
    });

    it('sending a fiat/mobile-money balance never enforces wallet connection either', async () => {
      await renderSwapScreen(); // wallet left disconnected

      // Pick GHS as the "from" token on the Swap tab first — it carries over
      // to Send, same shared fromToken state.
      await fireEvent.press(screen.getByTestId('from-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('token-row-ghs-momo'));

      await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));
      expect(screen.getByText('Paying via Mobile Money')).toBeTruthy();

      const button = screen.getByTestId('send-cta');
      expect(button.props.accessibilityLabel).not.toBe('Connect Wallet');
      // Still correctly disabled until an amount/recipient are actually set —
      // just not because of the wallet.
      expect(button.props.accessibilityState?.disabled).toBe(true);

      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '5000'); // 50.00 GHS
      // A wallet address, not a phone/email — this test is only about
      // wallet-connection not being required for a fiat balance; a contact
      // destination would hit the separate (and separately tested)
      // fiat-to-contact "Coming soon" block instead.
      await fireEvent.changeText(screen.getByTestId('destination-input'), '0x1234567890123456789012345678901234567890');
      await fireEvent.press(screen.getByTestId('send-destination-token-pill'));
      await fireEvent.press(screen.getByTestId('token-row-eth-native'));
      expect(button.props.accessibilityLabel).toBe('Send');
      expect(screen.getByTestId('send-cta').props.accessibilityState?.disabled).toBe(false);
    });

    it('pressing the Swap CTA while disconnected opens Dynamic\'s own connect UI', async () => {
      await renderSwapScreen();
      await fireEvent.press(screen.getByTestId('swap-cta'));

      expect(mockDynamicUiAuthShow).toHaveBeenCalledTimes(1);
    });

    it('disconnecting calls the SDK\'s own logout', async () => {
      await renderSwapScreen();
      await connectWallet();
      expect(screen.getByTestId('swap-cta').props.accessibilityLabel).toBe('Swap');

      await fireEvent.press(screen.getByTestId('balance-chip'));
      await fireEvent.press(screen.getByTestId('wallet-menu-disconnect'));

      expect(mockDynamicAuthLogout).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('swap-cta').props.accessibilityLabel).toBe('Connect Wallet');
    });
  });

  describe('swap button states', () => {
    it('shows "Swap" disabled with nothing entered once connected', async () => {
      await renderSwapScreen();
      await connectWallet();

      const button = screen.getByTestId('swap-cta');
      expect(button.props.accessibilityLabel).toBe('Swap');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });

    it('blocks the swap button on a real backend quote error (e.g. a minimum-amount rejection), without showing the raw error text', async () => {
      mockSwapQuoteResult = {
        quote: { exchangeRate: '3245.67', fees: { totalFee: '0.0001' }, output: { currency: 'USDC' } },
        loading: false,
        error: null,
      };
      await renderSwapScreen();
      await connectWallet();
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '100'); // 1.00 USDC — a fine amount

      // Now the pricing engine rejects the (new) amount without the quote
      // itself disappearing — same "keep the last good quote, block the
      // button" behavior useSwapQuote.test.ts covers directly. A quote
      // failure like this is often raw/unfriendly backend or upstream-
      // provider text (a real one: "0x request failed: fetch failed"), so
      // it deliberately isn't shown — only `rampLimitError` (a clean,
      // client-computed message) ever reaches the screen; see
      // quoteErrorDisplay's own doc in SwapScreen.tsx.
      mockSwapQuoteResult = {
        quote: { exchangeRate: '3245.67', fees: { totalFee: '0.0001' }, output: { currency: 'USDC' } },
        loading: false,
        error: 'Minimum sell amount is 50 GHS',
      };
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '9999999999');

      expect(screen.queryByTestId('quote-error')).toBeNull();
      // Blocked from swapping against a rate the backend just rejected —
      // not silently allowed through with a stale/wrong quote.
      expect(screen.getByTestId('swap-cta').props.accessibilityState?.disabled).toBe(true);
    });

    it('blocks the swap button for a reverse quote error too (typed into "to"), without showing the raw error text', async () => {
      // Regression test: the disabled gate used to be keyed on
      // `fromTokenAmount > 0`, but for a reverse quote `fromTokenAmount` is
      // itself DERIVED from the quote — it's 0 exactly when the quote
      // failed, so that gate would have silently left the button enabled.
      // Real repro: typing into "to" for a pair whose first-ever quote
      // comes back an error leaves `fromTokenAmount` at 0.
      mockSwapQuoteResult = { quote: null, loading: false, error: 'No route found for this pair.' };
      await renderSwapScreen();
      await connectWallet();
      await fireEvent.changeText(screen.getByTestId('to-amount-input'), '9500'); // 95.00 USDC

      expect(screen.queryByTestId('quote-error')).toBeNull();
      expect(screen.getByTestId('from-amount-input').props.value).toBe('0.00'); // USDC's own decimal zero (fromToken is stable by default)
      expect(screen.getByTestId('swap-cta').props.accessibilityState?.disabled).toBe(true);
    });

    it('skeletons the other side while a later quote re-fetch is in flight, not just the very first one', async () => {
      // Regression test: the pending state used to be `loading && !quote`,
      // so once a quote had landed once, a later re-fetch (a changed
      // amount, or the background auto-refresh) kept showing the OLD
      // amount with no skeleton and no visible update at all — the typed
      // side's own USD line updates instantly off client math, so this
      // read as "the other value doesn't change in real time."
      await renderSwapScreen();
      await connectWallet();
      // First quote lands normally.
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '100');
      expect(screen.getByTestId('to-amount-input')).toBeTruthy();
      expect(screen.queryByTestId('amount-row-skeleton')).toBeNull();

      // A later re-fetch — `quote` is still the PREVIOUS (non-null) one,
      // same as useSwapQuote's own real "keep the last good quote visible
      // while `loading`" behavior — but a fresh one is now in flight.
      mockSwapQuoteResult = { ...mockSwapQuoteResult, loading: true };
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '200');

      expect(screen.queryByTestId('to-amount-input')).toBeNull();
      expect(screen.getByTestId('amount-row-skeleton')).toBeTruthy();
      // The side actually being typed into keeps showing what was typed,
      // never a skeleton over itself.
      expect(screen.getByTestId('from-amount-input')).toBeTruthy();
    });

    it('shows the real ramp minimum ("Minimum buy is 50 GHS") for an obviously-too-small onramp amount, ahead of the quote engine\'s own error', async () => {
      mockRampLimits = { currency: 'ghs', buy: { minFiat: 50, maxFiat: 2900 }, sell: { minToken: 3, maxToken: 7000 } };
      // The quote engine would normally also reject this once it fires —
      // the ramp-limits message should win regardless, matching
      // app.morapay.io's own priority order (checked first, before ever
      // hitting the quote endpoint's own less-friendly rejection).
      mockSwapQuoteResult = { quote: null, loading: false, error: 'This token needs a slightly larger buy. Try about 9030 GHS.' };

      await renderSwapScreen();
      await connectWallet();
      await fireEvent.press(screen.getByTestId('from-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('token-row-ghs-momo'));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '500'); // 5.00 GHS — below the 50 GHS minimum

      expect(screen.getByText('Minimum buy is 50 GHS.')).toBeTruthy();
      expect(screen.queryByText('This token needs a slightly larger buy. Try about 9030 GHS.')).toBeNull();
      expect(screen.getByTestId('swap-cta').props.accessibilityState?.disabled).toBe(true);
    });

    it('flags "Not Enough Funds" and reddens the balance chip when typing more than the balance', async () => {
      await renderSwapScreen();
      await connectWallet();
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '5000000'); // 50,000.00 USDC, balance is 240.5 USDC

      const button = screen.getByTestId('swap-cta');
      expect(button.props.accessibilityLabel).toBe('Not Enough Funds');
      expect(button.props.accessibilityState?.disabled).toBe(true);
      expect(screen.getByTestId('balance-chip')).toBeTruthy();
      // BalanceChip renders its own "Balance"/value text nodes; the chip itself carries the tint,
      // so just assert the warning label text made it through alongside the chip.
      expect(screen.getByText('Balance')).toBeTruthy();
    });

    it('flags "Low Liquidity" for a pair of two non-major tokens', async () => {
      await renderSwapScreen();
      await connectWallet();

      // swap "from" to SOL, "to" to BNB — neither is a major/stable token
      await fireEvent.press(screen.getByTestId('from-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('token-row-sol-native'));
      await fireEvent.press(screen.getByTestId('to-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('token-row-bnb-native'));

      await fireEvent.press(screen.getByRole('button', { name: '25%' }));

      const button = screen.getByTestId('swap-cta');
      expect(button.props.accessibilityLabel).toBe('Low Liquidity');
      expect(button.props.accessibilityState?.disabled).toBe(true);
    });

    it('stays a plain "Swap" for a stable <-> volatile crypto pair — onramp/offramp is only for fiat', async () => {
      await renderSwapScreen();
      await connectWallet();

      // from USDC (stable) to SOL (volatile) — no fiat/momo leg here, so
      // this should never be relabeled Onramp even though USDC is "cash-like".
      await fireEvent.press(screen.getByTestId('from-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('token-row-usdc-ethereum'));
      await fireEvent.press(screen.getByTestId('to-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('token-row-sol-native'));

      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000');

      const button = screen.getByTestId('swap-cta');
      expect(button.props.accessibilityLabel).toBe('Swap');
      expect(button.props.accessibilityState?.disabled).toBe(false);
    });

    it('stays a plain "Swap" for the default USDC -> ETH pair — no fiat leg, no relabel', async () => {
      await renderSwapScreen();
      await connectWallet();
      // default pair is USDC -> ETH; both crypto, neither is fiat
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '100');

      const button = screen.getByTestId('swap-cta');
      expect(button.props.accessibilityLabel).toBe('Swap');
      expect(button.props.accessibilityState?.disabled).toBe(false);
    });

    it('opens the mobile-money sheet instead of the instant swap when GHS is involved (offramp)', async () => {
      await renderSwapScreen();
      await connectWallet();

      // USDC -> GHS ("to" changes to GHS, "from" stays the default USDC):
      // any non-fiat crypto to fiat is an offramp.
      await fireEvent.press(screen.getByTestId('to-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('token-row-ghs-momo'));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1');

      const button = screen.getByTestId('swap-cta');
      expect(button.props.accessibilityLabel).toBe('Offramp');

      await fireEvent.press(button);

      // the momo sheet's form is now up, not the instant "Swapping" mock
      expect(screen.getAllByText('Offramp').length).toBeGreaterThanOrEqual(2); // button label + sheet title
      expect(screen.getByTestId('momo-phone-input')).toBeTruthy();
      expect(screen.queryByText(/^Swapping/)).toBeNull();
    });

    it('opens the mobile-money sheet for the reverse direction (GHS -> USDC is onramp)', async () => {
      await renderSwapScreen();
      await connectWallet();

      // "from" GHS (fiat), "to" stays the default ETH — fiat -> crypto is
      // an onramp regardless of what's on the other side.
      await fireEvent.press(screen.getByTestId('from-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('token-row-ghs-momo'));
      // "from" balance is fiat, so typing doesn't get blocked by insufficient funds
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '50000'); // 500.00 GHS

      const button = screen.getByTestId('swap-cta');
      expect(button.props.accessibilityLabel).toBe('Onramp');

      await fireEvent.press(button);
      // Wallet's already connected, so the sheet's "where to receive" step
      // defaults to it and lets Continue straight through to the phone form.
      expect(screen.getByTestId('momo-receive-continue').props.accessibilityState?.disabled).toBe(false);
      await fireEvent.press(screen.getByTestId('momo-receive-continue'));

      expect(screen.getByTestId('momo-phone-input')).toBeTruthy();
      expect(screen.getByTestId('balance-chip')).toBeTruthy();
      expect(screen.queryByText(/^Swapping/)).toBeNull();
    });

    it('onramp never enforces wallet connection on the primary button — paying is via mobile money, not a wallet', async () => {
      await renderSwapScreen(); // wallet left disconnected

      await fireEvent.press(screen.getByTestId('from-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('token-row-ghs-momo'));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '50000');

      const button = screen.getByTestId('swap-cta');
      expect(button.props.accessibilityLabel).toBe('Onramp');
      // The top balance chip reflects "paying via mobile money" instead of
      // demanding a wallet connection just to see the swap card.
      expect(screen.getByText('Paying via Mobile Money')).toBeTruthy();

      await fireEvent.press(button);
      // Disconnected, so the receive step's address field starts empty
      // rather than defaulting to anything.
      expect(screen.getByTestId('momo-receive-address-input').props.value).toBe('');
      expect(screen.getByTestId('momo-receive-continue').props.accessibilityState?.disabled).toBe(true);

      await fireEvent.changeText(
        screen.getByTestId('momo-receive-address-input'),
        '0x2222222222222222222222222222222222222222',
      );
      expect(screen.getByTestId('momo-receive-continue').props.accessibilityState?.disabled).toBe(false);
    });

    it('shows a pending "Swapping…" state on press, signs+sends a real transaction, and resolves back to a cleared form', async () => {
      let resolveExecute: (hash: string) => void = () => {};
      mockSwapExecute.mockReturnValue(new Promise<string>((resolve) => { resolveExecute = resolve; }));

      await renderSwapScreen();
      await connectWallet();
      // ETH -> SOL: neither stable, but ETH is major so it's a plain ready
      // swap, not low-liquidity. "from" is pinned explicitly away from the
      // new default (stable USDC, which is also "major" but for a
      // different reason) so this stays specifically an ETH-precision test.
      await selectFromToken('eth-native');
      await fireEvent.press(screen.getByTestId('to-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('token-row-sol-native'));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1');

      await fireEvent.press(screen.getByTestId('swap-cta'));

      expect(mockSwapExecute).toHaveBeenCalledWith(
        expect.objectContaining({ amount: expect.any(Number) }),
      );
      const pendingButton = screen.getByTestId('swap-cta');
      expect(pendingButton.props.accessibilityLabel).toBe('Swapping…');
      expect(pendingButton.props.accessibilityState?.busy).toBe(true);

      await act(async () => {
        resolveExecute('0xtxhash');
        await Promise.resolve();
      });

      const settledButton = screen.getByTestId('swap-cta');
      expect(settledButton.props.accessibilityLabel).toBe('Swap');
      expect(screen.getByTestId('from-amount-input').props.value).toBe('0.000000'); // ETH's own decimal zero
    });

    it('surfaces a real execution failure inline and leaves the amount untouched to retry', async () => {
      mockSwapExecute.mockRejectedValue(new Error('User rejected the request.'));

      await renderSwapScreen();
      await connectWallet();
      // Pinned to ETH — the default "from" is now the 2-decimal USDC.
      await selectFromToken('eth-native');
      await fireEvent.press(screen.getByTestId('to-amount-input-unit'));
      await fireEvent.press(screen.getByTestId('token-row-sol-native'));
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '1000000'); // 1.000000 ETH

      await act(async () => {
        await fireEvent.press(screen.getByTestId('swap-cta'));
      });

      expect(screen.getByText('User rejected the request.')).toBeTruthy();
      expect(screen.getByTestId('swap-cta').props.accessibilityLabel).toBe('Swap');
      // Amount is preserved so the user can just retry, not re-type everything.
      expect(screen.getByTestId('from-amount-input').props.value).toBe('1.000000');
    });
  });

  describe('token switch preserves the typed amount', () => {
    it('keeps whatever "from" amount was typed when switching the "to" token', async () => {
      await renderSwapScreen();
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '500'); // 5.00 USDC (default "from" is stable, 2 decimals)
      await selectToToken('sol-native');

      // Switching "to" used to always reset amountSource back to zero —
      // it no longer does, since the typed amount is still a perfectly
      // meaningful request once the pair changes.
      expect(screen.getByTestId('from-amount-input').props.value).toBe('5.00');
    });

    it('keeps whatever "from" amount was typed when switching the "from" token itself', async () => {
      await renderSwapScreen();
      await fireEvent.changeText(screen.getByTestId('from-amount-input'), '500'); // 5.00 USDC
      await selectFromToken('eth-native');

      // amountSource itself (still exactly 5) is untouched by the switch —
      // only the display re-derives at the newly-selected token's own
      // decimal precision (ETH's 6, vs USDC's 2).
      expect(screen.getByTestId('from-amount-input').props.value).toBe('5.000000');
    });
  });

  describe('quick amount pills', () => {
    it('shows dollar quick-amount pills instead of percent pills when disconnected with a stable "from" token, and pressing one sets that amount', async () => {
      await renderSwapScreen(); // default "from" is USDC (stable), wallet starts disconnected
      expect(screen.queryByRole('button', { name: '25%' })).toBeNull();
      expect(screen.getByTestId('quick-amount-20')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('quick-amount-50'));

      // 1 stablecoin unit === $1, no quote/conversion needed.
      expect(screen.getByTestId('from-amount-input').props.value).toBe('50.00');
    });

    it('shows percent pills again once a wallet connects, even with the same stable "from" token', async () => {
      await renderSwapScreen();
      expect(screen.getByTestId('quick-amount-20')).toBeTruthy();

      await connectWallet(); // flips hasKnownBalance true, since fromToken.type !== 'fiat'

      expect(screen.queryByTestId('quick-amount-20')).toBeNull();
      expect(screen.getByRole('button', { name: '25%' })).toBeTruthy();
    });
  });

  describe('last-traded token pair (AsyncStorage restore on mount)', () => {
    it('restores the last-traded pair on a fresh mount instead of the hardcoded defaults', async () => {
      await AsyncStorage.setItem(
        'morapay:last-traded-tokens',
        JSON.stringify({ fromId: 'sol-native', toId: 'usdt-ethereum' }),
      );

      await renderSwapScreen();

      // The restore effect resolves loadLastTradedTokens() asynchronously
      // (a real Promise, even against the mock), so it lands a microtask
      // after the initial render — wait for it rather than asserting
      // synchronously.
      await waitFor(() => {
        expect(screen.getByTestId('from-amount-input-unit').props.accessibilityLabel).toBe(
          'Choose token, currently SOL',
        );
      });
      expect(screen.getByTestId('to-amount-input-unit').props.accessibilityLabel).toBe(
        'Choose token, currently USDT',
      );
    });

    it('ignores a stored pair whose ids aren\'t in the currently loaded token list, falling back to the real defaults with no crash', async () => {
      await AsyncStorage.setItem(
        'morapay:last-traded-tokens',
        JSON.stringify({ fromId: 'nonexistent-token', toId: 'also-missing' }),
      );

      await act(async () => {
        renderSwapScreen();
        // Flush the restore effect's promise chain (AsyncStorage.getItem's
        // own mock implementation is itself a couple of awaits deep) —
        // since a miss is a deliberate no-op there's no new state to poll
        // for with waitFor, so drain the microtask queue directly instead.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId('from-amount-input-unit').props.accessibilityLabel).toBe(
        'Choose token, currently USDC',
      );
      expect(screen.getByTestId('to-amount-input-unit').props.accessibilityLabel).toBe(
        'Choose token, currently ETH',
      );
    });
  });

  it('disables the Send button once connected until an amount, a recipient, and what they receive are all set', async () => {
    await renderSwapScreen();
    await connectWallet();
    await fireEvent.press(screen.getByRole('button', { name: 'Send', selected: false }));

    expect(screen.getByTestId('send-cta').props.accessibilityLabel).toBe('Send');
    expect(screen.getByTestId('send-cta').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: '50%' }));
    // A real address, not a truncated one — a value that doesn't parse as any
    // kind of destination is its own case (see "never leaves an enabled Send
    // that silently does nothing", which this test previously asserted the
    // opposite of by using a 6-character stub address).
    await fireEvent.changeText(screen.getByTestId('destination-input'), '0x1234567890123456789012345678901234567890');

    expect(screen.getByTestId('send-cta').props.accessibilityLabel).toBe('Choose Destination Token');
    expect(screen.getByTestId('send-cta').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId('send-destination-token-pill'));
    await fireEvent.press(screen.getByTestId('token-row-usdc-base'));

    expect(screen.getByTestId('send-cta').props.accessibilityLabel).toBe('Send');
    expect(screen.getByTestId('send-cta').props.accessibilityState?.disabled).toBe(false);
  });
});
