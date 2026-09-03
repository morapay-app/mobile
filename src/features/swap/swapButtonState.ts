import type { SwapToken } from './data/tokens';

export type SwapButtonState =
  | 'connect-wallet'
  | 'ready'
  | 'onramp'
  | 'offramp'
  | 'insufficient-funds'
  | 'low-liquidity'
  | 'fiat-to-fiat-unavailable'
  | 'swapping';

// By symbol, not a handful of hardcoded chain/address ids — a stablecoin is
// a stablecoin on whichever chain it lives on (USDC-on-Arbitrum, USDT-on-
// Solana, DAI, ...), not just the couple of Ethereum/Base entries this used
// to special-case. Swapping one of these for SOL is still an ordinary
// on-chain swap, not an onramp — nothing about it needs a phone number or a
// momo rail. Only a real `type: 'fiat'` token (GHS) does, so onramp/offramp
// below key off that alone.
const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'FDUSD', 'USDE', 'PYUSD']);
// Not dollar-pegged themselves (major native gas tokens) but deep enough in
// every real DEX pool to never be the "low liquidity" side of a pair.
const MAJOR_NATIVE_IDS = new Set(['eth-native', 'weth-ethereum', 'eth-base']);

function isFiat(token: SwapToken): boolean {
  return token.type === 'fiat';
}

/** Dollar-pegged, so worth displaying like currency (2 decimals) rather
 * than at its on-chain decimal count, and the one thing a live rate can
 * anchor a "$" figure to — also used by SwapScreen's amount field to
 * decide how much precision to offer while typing. Fiat currencies (GHS,
 * NGN, ...) are excluded even though they have a real USD value too —
 * they're not 1:1 pegged, so treating them as a $1-per-unit anchor here
 * would be wrong, not just imprecise. */
export function isStableToken(token: SwapToken): boolean {
  if (isFiat(token)) return false;
  return STABLE_SYMBOLS.has(token.symbol.trim().toUpperCase());
}

function isMajor(token: SwapToken): boolean {
  // Fiat legs settle over a payment rail, not a DEX pool, so they're never
  // the low-liquidity side either.
  return isFiat(token) || isStableToken(token) || MAJOR_NATIVE_IDS.has(token.id);
}

export type SwapButtonStateInput = {
  walletConnected: boolean;
  isSwapping: boolean;
  amount: number;
  balance: number;
  fromToken: SwapToken;
  toToken: SwapToken;
};

/**
 * Priority order matters: a disconnected wallet or an in-flight swap
 * overrides everything else, and running out of funds/liquidity overrides
 * the onramp/offramp relabeling (there's no point calling a broken swap
 * "onramp" instead of telling the user why it's blocked).
 *
 * A wallet is only required up front when the crypto leg is actually being
 * sent FROM it — swap (both legs crypto) and offramp (crypto -> fiat) both
 * need one connected before anything else can happen. Onramp pays with
 * mobile money instead, so there's nothing to connect just to open that
 * flow; the bottom sheet itself asks where to send the purchased crypto
 * (connected wallet if there is one, or a manually typed address) as its
 * own first step.
 */
export function getSwapButtonState({
  walletConnected,
  isSwapping,
  amount,
  balance,
  fromToken,
  toToken,
}: SwapButtonStateInput): SwapButtonState {
  const payingWithFiat = isFiat(fromToken);
  // Fiat<->fiat (GHS<->NGN, NGN<->BOB, ...) can get a real rate (see
  // `useFiatToFiatQuote`) but has no execute/confirm rail wired yet — surface
  // that plainly rather than routing "Swap" into a crypto-swap path that was
  // never built to handle two fiat legs.
  if (isFiat(fromToken) && isFiat(toToken)) return 'fiat-to-fiat-unavailable';
  if (!walletConnected && !payingWithFiat) return 'connect-wallet';
  if (isSwapping) return 'swapping';
  if (amount === 0) return 'ready';
  if (!payingWithFiat && amount > balance) return 'insufficient-funds';
  if (!isMajor(fromToken) && !isMajor(toToken)) return 'low-liquidity';
  if (isFiat(fromToken) && !isFiat(toToken)) return 'onramp';
  if (!isFiat(fromToken) && isFiat(toToken)) return 'offramp';
  return 'ready';
}

export const SWAP_BUTTON_LABEL: Record<SwapButtonState, string> = {
  'connect-wallet': 'Connect Wallet',
  ready: 'Swap',
  onramp: 'Onramp',
  offramp: 'Offramp',
  'insufficient-funds': 'Not Enough Funds',
  'low-liquidity': 'Low Liquidity',
  'fiat-to-fiat-unavailable': 'Coming Soon',
  // SwapScreen overrides this with a live "Swapping Xs" countdown while
  // actually pending — this is just the fallback for any other consumer.
  swapping: 'Swapping',
};

export const SWAP_BUTTON_BLOCKED_STATES: ReadonlySet<SwapButtonState> = new Set([
  'insufficient-funds',
  'low-liquidity',
  'fiat-to-fiat-unavailable',
]);
