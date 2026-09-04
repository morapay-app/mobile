import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ChevronDown } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from './theme';
import { noOutlineStyle } from './webNoOutline';
import { CountrySelect } from './components/CountrySelect';
import { CountrySelectSheet } from './components/CountrySelectSheet';
import { WalletMenuSheet } from './components/WalletMenuSheet';
import { PayLinkSheet } from './components/PayLinkSheet';
import { SwapCardSkeleton } from './components/SwapCardSkeleton';
import { PaymentRequestDeliverySheet, type DeliveryChannel } from './components/PaymentRequestDeliverySheet';
import { ReceiveDestinationCard, type ReceivePayout } from './components/ReceiveDestinationCard';
import { SegmentedToggle } from './components/SegmentedToggle';
import { PercentPills } from './components/PercentPills';
import { QuickAmountPills } from './components/QuickAmountPills';
import { AmountRow } from './components/AmountRow';
import { AmountRowSkeleton } from './components/AmountRowSkeleton';
import { BalanceChip } from './components/BalanceChip';
import { FooterInfo } from './components/FooterInfo';
import { MomoSheet } from './components/MomoSheet';
import { PrimaryButton } from './components/PrimaryButton';
import { TokenSelectSheet } from './components/TokenSelectSheet';
import { DEFAULT_FROM_TOKEN, DEFAULT_TO_TOKEN, findToken, shortenAddress, type SwapToken } from './data/tokens';
import { loadLastTradedTokens, saveLastTradedTokens } from './tokenPreference';
import { charsForWidth, truncateMiddle } from './truncateMiddle';
import { describePhoneForCountry, detectDestination, toE164Phone } from './destinationDetect';
import { useWallet } from '../../dynamic/useWallet';
import { useWalletConnectActions } from '../../dynamic/useWalletConnectActions';
import { getSwapButtonState, isStableToken, SWAP_BUTTON_BLOCKED_STATES, SWAP_BUTTON_LABEL } from './swapButtonState';
import { rampAmountBelowMin, useRampLimits } from './useRampLimits';
import { useSwapExecution } from './useSwapExecution';
import { useTokenTransfer } from './useTokenTransfer';
import { useSwapQuote } from './useSwapQuote';
import { useFiatToFiatQuote } from './useFiatToFiatQuote';
import { useSwapTokens } from './useSwapTokens';
import { useWalletBalance } from './useWalletBalance';
import { useEnsResolution } from './useEnsResolution';
import { contactSendBlockedReason, useContactSend } from './useContactSend';
import { useDebouncedValue } from './useDebouncedValue';
import { ContactSendResultSheet } from './components/ContactSendResultSheet';
import { swapAndForwardBlockedReason, useSwapAndForward } from './useSwapAndForward';
import { coreChainCode } from './coreChain';
import { createPaymentRequest, type CreatedPaymentRequest } from '../../api/paymentRequests';
import { buildPaymentRequestDeepLink } from '../pay/payRequestLink';
import { ActiveTransactionPill } from '../transactions/ActiveTransactionPill';
import { TransactionProgressSheet } from '../transactions/TransactionProgressSheet';
import { DevTransactionSimulator } from '../transactions/DevTransactionSimulator';
import { ReceiptModal } from '../receipt/components/ReceiptModal';
import { explorerTxUrl } from '../receipt/receiptStatements';
import type { ReceiptData } from '../receipt/types';

const USD_LABEL = 'USD';
const PERCENTS = [0.25, 0.5, 0.75, 1];
// Flat dollar-amount quick picks — the replacement for the percent pills
// when there's no wallet balance yet to take a percentage of (see
// `showQuickAmounts` below).
const QUICK_USD_AMOUNTS = [20, 50, 100, 250];
// Same idea, but for paying with a fiat rail (mobile money / bank) instead
// of a wallet — there's no balance to take a percentage of there either, so
// "25% / 50% / 75% / Max" (which is what used to show, unconditionally) was
// meaningless: it read as if an account balance existed to divide up, when
// paying via mobile money never has one. Round numbers within each
// currency's real, configured onramp range (`RAMP_LIMIT_FALLBACKS`) — a
// currency with no real onramp rail yet (anything besides GHS/NGN) falls
// back to a generic set rather than blocking the quick-pick row entirely.
const FIAT_QUICK_AMOUNTS: Record<string, number[]> = {
  GHS: [100, 300, 500, 1000],
  NGN: [5000, 10000, 20000, 50000],
};
const DEFAULT_FIAT_QUICK_AMOUNTS = [50, 100, 200, 500];

type Unit = 'token' | 'usd';
type PickerField = 'from' | 'to' | 'send-destination' | null;

/** Crypto tokens can carry up to 18 on-chain decimals (native gas tokens) —
 * far more precision than the digit-shift keypad below can usefully offer,
 * so entry is capped at a sane maximum while tokens that genuinely have
 * fewer (stablecoins, GHS) keep using their real, smaller count. This is
 * what lets a token like ETH accept something like "0.0003" instead of
 * being clamped to 2-decimal cents-style entry. */
const MAX_INPUT_DECIMALS = 6;

/** USD is always 2 decimals (cents), regardless of which token is selected.
 * Stablecoins (and the fiat momo rail) are dollar-pegged, so they're shown
 * like currency too rather than at their on-chain decimal count (USDC is
 * 6 decimals on-chain, but "0.00" reads as an amount, not "0.000000").
 * Everything else uses that token's own precision, capped for entry. */
function inputDecimalsFor(unit: Unit, token: SwapToken): number {
  if (unit === 'usd' || isStableToken(token)) return 2;
  return Math.min(token.decimals, MAX_INPUT_DECIMALS);
}

/** Financial-style formatting — thousand separators plus a fixed decimal
 * count ("5,000.00"), same convention `useRampLimits.ts`'s ported
 * `rampAmountBelowMin` already uses for limit messages ("Minimum buy is
 * 2,900 GHS."). Safe for the calculator-style keypad fields too:
 * `amountFromKeypadText` strips every non-digit character, commas
 * included, so they never affect what a keystroke actually computes to. */
function formatAmount(value: number, decimals: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Calculator/POS-style amount entry: every keystroke is read as "the next
 * digit," entering at the smallest supported decimal place for the active
 * unit/token and pushing everything already typed one place further left
 * (2 → "0.02", then 0 → "0.20", then 0 → "2.00" for a 2-decimal unit like
 * USD; a token with more decimals just has more places to fill before it
 * reaches whole numbers) — same mechanic as Cash App's amount screen.
 * There's no manual decimal point to manage; strip everything but digits
 * from whatever the field currently holds and treat the whole thing as a
 * count of the smallest unit. Backspacing falls out of this for free
 * (removing the trailing digit and re-deriving shifts the value back down
 * a place).
 */
function amountFromKeypadText(text: string, decimals: number): number {
  const digitsOnly = text.replace(/[^0-9]/g, '');
  if (!digitsOnly) return 0;
  const units = parseInt(digitsOnly, 10);
  return Number.isNaN(units) ? 0 : units / 10 ** decimals;
}

// The destination field's own font size/line-height (see `destinationInput`
// below) — pulled out as constants since the truncation and height math
// both need to reason about exactly how much a "line" holds here.
const DESTINATION_FONT_SIZE = 20;
const DESTINATION_LINE_HEIGHT = 26;
const DESTINATION_MAX_LINES = 2;

/** How many characters of this field's font actually fit on one line of its
 * real measured width — the shared unit both the truncation budget and the
 * line-count decision below are built from, so "how much to truncate" and
 * "how tall to render" can never disagree with each other. */
function destinationCharsPerLine(measuredWidth: number): number {
  return charsForWidth(measuredWidth, DESTINATION_FONT_SIZE);
}

/** How many characters of a truncated address (front segment + the fixed
 * 4-character tail) fill up to two lines of the field's real measured
 * width — i.e. exactly as much room as the field's own two-line height cap
 * gives it, no more and no less. */
function destinationCharBudget(measuredWidth: number): number {
  return destinationCharsPerLine(measuredWidth) * DESTINATION_MAX_LINES;
}

/** How many of the field's own lines (capped at the two-line max) a given
 * displayed string actually needs. Derived purely from the string length
 * and the field's measured width, rather than the rendered DOM node's own
 * `scrollHeight` (the more obvious-looking approach) — on web, a
 * `<textarea>`'s `scrollHeight` can't report shorter than its own current
 * `clientHeight`, so once the field had grown to two lines for a long
 * address it would never measure its way back down to one line for
 * shorter content typed afterward (confirmed live: typing a long address
 * then clearing it down to a short email left the box stuck at two lines).
 * Computing it directly from the content sidesteps that trap entirely, and
 * works identically on every platform. */
function destinationLineCount(text: string, measuredWidth: number): number {
  const charsPerLine = destinationCharsPerLine(measuredWidth);
  if (charsPerLine <= 0) return 1;
  return text.length <= charsPerLine ? 1 : DESTINATION_MAX_LINES;
}

// Below this width the card fills nearly the full viewport (little of the
// generous surrounding whitespace that makes it read as "spacious" on a
// tablet), so the same fixed pixel gaps read as noticeably tighter — widen
// the vertical rhythm a bit to compensate, and trim the outer horizontal
// margin so the card sits close to the screen edges. Set well above the
// widest phones (iPhone Pro Max class devices report ~430pt) and well below
// the narrowest tablets (~744pt), so it reliably separates "phone" from
// "tablet" rather than just "small phone" from "large phone".
const COMPACT_BREAKPOINT = 600;

// The main card's horizontal edge margin at each breakpoint.
const HERO_MARGIN = 20;
const HERO_MARGIN_COMPACT = 10;


// Satisfies Core's non-empty, "@"-shaped `payer_email` requirement for a
// send-to-contact (see useContactSend's own doc) without asking the sender
// for a real address in the UI. Not a real inbox — for an EMAIL recipient
// Core emails the claim code straight to THEM regardless of this value, and
// there's no automatic channel for a PHONE recipient either way, so nothing
// this app can display actually depends on mail delivered here.
const PLACEHOLDER_PAYER_EMAIL = 'sender@morapay.io';

export function SwapScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < COMPACT_BREAKPOINT;
  const { tokens, loading: tokensLoading } = useSwapTokens();

  const [mode, setMode] = useState<0 | 1>(0); // 0 = Swap, 1 = Send
  const [sendMode, setSendMode] = useState<0 | 1>(0); // 0 = Send, 1 = Receive — only relevant when mode === 1
  const [percentIndex, setPercentIndex] = useState<number | null>(null);
  const [quickAmountIndex, setQuickAmountIndex] = useState<number | null>(null);
  const [recipient, setRecipient] = useState('');
  // Only meaningful once the destination resolves to a real crypto address
  // (not a phone/email) — the token/chain the recipient should actually
  // receive, picked via its own bottom sheet since a raw address doesn't
  // imply one the way a swap's own "to" token does.
  const [sendDestinationToken, setSendDestinationToken] = useState<SwapToken | null>(null);
  const [sendExecuting, setSendExecuting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);
  // Drives ContactSendResultSheet — set once a send-to-contact actually
  // completes, since that outcome gets its own confirmation sheet rather
  // than the plain inline `sendSuccessMessage` line.
  const [contactSendResult, setContactSendResult] = useState<{
    kind: 'email' | 'phone';
    destination: string;
    notified: boolean;
    confirmed: boolean;
  } | null>(null);
  // The real settlement destination for a payment request — set by
  // ReceiveDestinationCard once it has something submittable; `null` while
  // the user hasn't finished (or the requested token has no real
  // destination shape at all, e.g. a currency with no rail here).
  const [receivePayout, setReceivePayout] = useState<ReceivePayout | null>(null);
  // The real created request, once one exists — its `payLink` is what
  // PayLinkSheet's QR code and copy action hand out.
  const [paymentRequest, setPaymentRequest] = useState<CreatedPaymentRequest | null>(null);
  // Captured at creation time (same string sent as `receiveSummary`) —
  // `resetSendForm` clears the amount/token that produced it, so the sheet
  // needs its own copy to still have something to show afterward.
  const [paymentRequestSummary, setPaymentRequestSummary] = useState<string | null>(null);
  const [payLinkCopied, setPayLinkCopied] = useState(false);
  const [payLinkSheetOpen, setPayLinkSheetOpen] = useState(false);
  // Opened once the requester's own side (amount, payout destination) is
  // complete — collects HOW to reach the payer (email/phone/QR-only) before
  // the real request actually gets created. See PaymentRequestDeliverySheet.
  const [paymentDeliverySheetOpen, setPaymentDeliverySheetOpen] = useState(false);
  // Set right before opening MomoSheet from the Send tab (destination is a
  // crypto address, paying with fiat) — tells MomoSheet to skip its own
  // "where do you want to receive" step and use this address directly, and
  // tells this screen the sheet it's about to complete is a Send, not a
  // Swap-tab onramp, so `handleMomoComplete` knows to also clear the Send
  // form once it does. `null` the rest of the time.
  const [momoPresetAddress, setMomoPresetAddress] = useState<string | null>(null);
  // Only meaningful once a phone number is detected — null means "go with
  // whatever detectDestination guessed," set once the user picks a country
  // from the CountrySelect dropdown themselves.
  const [countryOverride, setCountryOverride] = useState<string | null>(null);
  const [destinationFocused, setDestinationFocused] = useState(false);
  // Both pickers render at the screen root (see SheetShell) rather than as
  // dropdowns anchored to their triggers, so their open state lives here
  // instead of inside the chip that opens them.
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [transactionSheetOpen, setTransactionSheetOpen] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  // The field's own real rendered width — used to size how much of a long
  // address the truncated (blurred) display can actually fill, and how
  // many lines the field itself renders at (see `destinationCharBudget`/
  // `destinationLineCount`). 220 is a reasonable pre-layout guess (close to
  // what this field measures at the compact breakpoint) so the very first
  // paint doesn't briefly show an untruncated address before the real
  // width lands.
  const [destinationInputWidth, setDestinationInputWidth] = useState(220);
  const [pickerField, setPickerField] = useState<PickerField>(null);

  const [fromToken, setFromToken] = useState<SwapToken>(DEFAULT_FROM_TOKEN);
  const [toToken, setToToken] = useState<SwapToken>(DEFAULT_TO_TOKEN);
  // Set once a stored pair has been restored (or the user has made their
  // own manual pick, which counts as "handled" too) — stops the retry
  // below from clobbering a deliberate in-session choice the moment the
  // full token catalog loads after it.
  const restoredTokenPreferenceRef = useRef(false);
  // Gates the very first paint (see the skeleton branch below) so the
  // hardcoded defaults never render even for one frame before a real
  // stored pair replaces them — AsyncStorage is a local, synchronous-speed
  // read (no network wait), so this delays first paint by, in practice, a
  // handful of milliseconds rather than reintroducing the flash it exists
  // to prevent.
  const [preferenceResolved, setPreferenceResolved] = useState(false);

  // Restores the last pair the user actually traded, so a refresh doesn't
  // dump them back on the hardcoded defaults. Only the bootstrap tokens
  // exist on the very first render (see useSwapTokens) — if the stored ids
  // aren't in that small list yet, this retries once `tokens` updates to
  // the full live catalog, rather than giving up just because the catalog
  // hadn't loaded yet.
  useEffect(() => {
    if (restoredTokenPreferenceRef.current) {
      setPreferenceResolved(true);
      return;
    }
    let cancelled = false;
    void loadLastTradedTokens().then((pref) => {
      if (cancelled) return;
      if (!restoredTokenPreferenceRef.current && pref) {
        const restoredFrom = findToken(tokens, pref.fromId);
        const restoredTo = findToken(tokens, pref.toId);
        if (restoredFrom && restoredTo) {
          restoredTokenPreferenceRef.current = true;
          setFromToken(restoredFrom);
          setToToken(restoredTo);
        }
      }
      // Unblocks first paint either way — a stored pair not found in the
      // bootstrap list still gets one more chance once the full catalog
      // arrives (this same effect re-runs on `tokens` changing), but that
      // rare retry isn't worth holding every load hostage to a network
      // fetch just to avoid a flash that mostly doesn't happen anyway.
      setPreferenceResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [tokens]);

  // Real wallet-connect, real Dynamic SDK either way — `useWallet` and
  // `useWalletConnectActions` each resolve to a native (`ReactNativeExtension`
  // + its own embedded WebView) or web (`sdk-react-core` + `DynamicWidget`)
  // implementation via Metro's platform-specific file resolution, so this
  // component itself doesn't branch on platform at all.
  const wallet = useWallet();
  const walletConnectActions = useWalletConnectActions();
  const walletConnected = wallet.connected;
  const walletAddress = wallet.address;
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const swapExecution = useSwapExecution();
  const tokenTransfer = useTokenTransfer();
  const contactSend = useContactSend();
  const swapForward = useSwapAndForward();

  // Whichever chain the "from" token lives on is where a real balance check
  // and a real swap execution both actually happen — nudge the wallet's
  // own active chain to match automatically, so a connected wallet doesn't
  // sit on whatever chain it happened to be on before. This never blocks
  // or surfaces anything: an injected wallet will still show its own
  // "Switch network?" prompt (nothing in this app can suppress that), and
  // `switchToChain` silently no-ops for a wallet/chain that can't switch —
  // see its doc comment. Balance reads already work regardless (see
  // useWalletBalance, which queries the token's chain directly rather than
  // whatever the wallet is currently active on), so a failed/ignored switch
  // here never blocks anything else on this screen.
  useEffect(() => {
    if (!walletConnected || fromToken.type !== 'crypto' || !fromToken.chainId) return;
    void walletConnectActions.switchToChain(fromToken.chainId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletConnected, fromToken.chainId, fromToken.type]);

  // Whichever side the user is actively typing into — the ONLY amount state
  // set directly by a keystroke. The other side's amount always comes
  // straight from the quote's own input/output amount (see below), never
  // from our own rate math, so it's exactly what the backend computed
  // rather than an approximation — and, critically, it means either side
  // can be the starting point: type into "from", "to", or (when one side is
  // a stablecoin) a USD figure, and the other side fills in once the quote
  // resolves.
  const [amountSource, setAmountSource] = useState<{ side: 'from' | 'to'; amount: number }>({ side: 'from', amount: 0 });
  const [fromUnit, setFromUnit] = useState<Unit>('token');
  const [toUnit, setToUnit] = useState<Unit>('token');

  const { balance: walletBalance } = useWalletBalance(walletAddress, fromToken);
  const balance = walletConnected ? walletBalance : 0;
  // A percentage is only a useful quick-pick once there's a real wallet
  // balance to take a percentage *of* — no wallet connected yet, or a fiat
  // "from" (onramp pays over mobile money/bank, not a wallet balance at
  // all) both mean "25% of 0" every time, which is what the percent pills
  // used to silently offer. `quickAmounts`/`fiatQuickAmounts` below are the
  // replacement for those two cases specifically.
  const hasKnownBalance = walletConnected && fromToken.type !== 'fiat';
  // Only ever shown for a real dollar-pegged stablecoin "from" token — "$20"
  // then always means exactly 20 of it, no live price feed required. A
  // non-stable crypto (ETH, SOL, ...) has no USD anchor to convert a dollar
  // figure through until a quote has already resolved (see fromUsdPrice
  // below) — showing quick amounts before that would mean guessing, so
  // there's deliberately no quick-pick row for that case at all yet.
  const showQuickAmounts = !hasKnownBalance && isStableToken(fromToken);
  // Paying via a fiat rail (mobile money / bank) never has a wallet balance
  // to take a percentage of, connected or not — this used to fall through
  // to the percent pills regardless (see the comment above; the intent was
  // always to cover this case too, the check just never actually did), which
  // read as "25% of your mobile money account" — nothing backs that number.
  const payingWithFiat = fromToken.type === 'fiat';
  const fiatQuickAmounts = FIAT_QUICK_AMOUNTS[fromToken.symbol.toUpperCase()] ?? DEFAULT_FIAT_QUICK_AMOUNTS;

  // Only a plain crypto<->crypto pair can drive a *live backend* quote off
  // the "to" side — real backend constraint (confirmed live): reverse
  // quoting (`inputSide: 'to'`) only works for a plain crypto<->crypto SWAP;
  // ONRAMP rejects it outright, OFFRAMP accepts it but truncates the
  // computed crypto amount to 2 decimals. That does NOT mean "to" can't be
  // typed into for onramp/offramp — see `estimatedFromAmount` below, which
  // still lets the user drive off "to" (or a USD figure) for those, just by
  // estimating the equivalent "from" amount client-side off the last real
  // rate and asking the backend a real, forward (`inputSide: 'from'`)
  // question about THAT instead. Every number on screen still comes from a
  // real quote; this only decides which side gets asked.
  const isPureSwap = fromToken.type === 'crypto' && toToken.type === 'crypto';

  // Fiat<->fiat (e.g. GHS<->NGN, NGN<->BOB) has no SWAP/ONRAMP/OFFRAMP
  // action on `/api/public/quotes` at all (confirmed live — the backend
  // rejects it, and the real app's own `useTransferQuote` has the identical
  // restriction). It gets quoted through a completely different, simpler
  // rail instead — see `useFiatToFiatQuote`. This only covers getting a
  // rate; there's no execute/confirm step wired for this pair type yet.
  const isFiatToFiat = fromToken.type === 'fiat' && toToken.type === 'fiat';
  const fiatToFiatQuote = useFiatToFiatQuote(fromToken.symbol, toToken.symbol, isFiatToFiat);

  // The last real, backend-confirmed rate for the current pair — the seed
  // an estimated reverse entry converts through the moment a keystroke
  // lands, before its own quote has had a chance to come back. Cleared the
  // instant the pair changes so a stale ETH/GHS rate never seeds a fresh
  // SOL/NGN guess (guarded, idempotent — safe to run during render, same
  // pattern React's own docs use for resetting state when a prop changes).
  const lastRateRef = useRef(0);
  const lastRatePairRef = useRef('');
  const pairKey = `${fromToken.id}:${toToken.id}`;
  if (lastRatePairRef.current !== pairKey) {
    lastRatePairRef.current = pairKey;
    lastRateRef.current = 0;
  }

  // True whenever the user is driving off "to" for a pair whose backend
  // can't take a real reverse quote (anything that isn't a pure swap) — the
  // only case that needs the rate-estimate detour at all.
  const needsEstimatedForwardQuery = !isPureSwap && amountSource.side === 'to';
  const estimatedFromAmount =
    needsEstimatedForwardQuery && lastRateRef.current > 0 ? amountSource.amount / lastRateRef.current : 0;

  // One real quote source for every leg combination — SWAP (crypto<->crypto),
  // ONRAMP (fiat->crypto), OFFRAMP (crypto->fiat) all go through the same
  // morapay pricing engine via `/api/public/quotes`, differentiated only by
  // the `action` field (see useSwapQuote). No more flat mock price table:
  // while a quote hasn't resolved yet, the rate is simply 0 rather than a
  // guessed number. For the estimated-reverse case, this always queries
  // forward (`inputSide: 'from'`) off the estimate above — never the raw
  // "to" side the backend doesn't support for these actions.
  const queryInputSide: 'from' | 'to' = needsEstimatedForwardQuery ? 'from' : amountSource.side;
  const queryAmount = needsEstimatedForwardQuery ? estimatedFromAmount : amountSource.amount;
  const swapQuote = useSwapQuote({ fromToken, toToken, amount: queryAmount, inputSide: queryInputSide });

  // Whichever side isn't the one being typed into comes straight from the
  // quote's own `input`/`output` amount — those are always the literal
  // fromToken/toToken amounts regardless of which side was given, so this
  // works the same whether the user typed "from", "to", or a USD figure
  // that resolved to either. The estimated-reverse case prefers the fresh
  // client-side estimate over the quote's own `input.amount`, deliberately
  // — that quote object can still be the PREVIOUS query's result (the new
  // one, for `estimatedFromAmount`, is debounced and hasn't resolved yet),
  // and showing a stale, mismatched "from" figure here was a real bug: once
  // `lastRateRef` below got seeded off that stale/fresh mismatch, every
  // later estimate compounded the error further (a user reported this
  // exact symptom — a reverse "to" entry producing a "from" figure many
  // orders of magnitude too large). The estimate and the real quote
  // converge anyway once that quote actually answers this same amount, so
  // preferring the estimate costs nothing once it's resolved.
  const fromTokenAmount = isFiatToFiat
    ? amountSource.side === 'from'
      ? amountSource.amount
      : fiatToFiatQuote.rate > 0
        ? amountSource.amount / fiatToFiatQuote.rate
        : 0
    : amountSource.side === 'from'
      ? amountSource.amount
      : needsEstimatedForwardQuery
        ? estimatedFromAmount || parseFloat(swapQuote.quote?.input.amount ?? '') || 0
        : parseFloat(swapQuote.quote?.input.amount ?? '0') || 0;
  const toTokenAmount = isFiatToFiat
    ? amountSource.side === 'to'
      ? amountSource.amount
      : amountSource.amount * fiatToFiatQuote.rate
    : amountSource.side === 'to'
      ? amountSource.amount
      : parseFloat(swapQuote.quote?.output.amount ?? '0') || 0;

  // Purely for display — "1 fromToken = N toToken" computed off whatever's
  // actually on screen right now, which can momentarily mix a fresh side
  // with a side still catching up (see the estimate-preference note above).
  // NOT the same value the rate cache below stores, on purpose — that one
  // has to stay internally consistent (a single real quote's own input vs.
  // its own output) or it risks the exact poisoning bug described above.
  // Fiat<->fiat has no such poisoning risk — `fiatToFiatQuote.rate` IS the
  // rate, straight from the USD-pivot table, not derived from mismatched
  // on-screen amounts — so it's used directly rather than re-derived here.
  const exchangeRate = isFiatToFiat ? fiatToFiatQuote.rate : fromTokenAmount > 0 ? toTokenAmount / fromTokenAmount : 0;

  // The rate estimate cache — seeded ONLY from a single real quote's own
  // `input`/`output` pair (both numbers from the SAME backend response),
  // never from this screen's own `fromTokenAmount`/`toTokenAmount`, which
  // can transiently pair a stale side with a fresh one (see above). Mixing
  // those here is exactly what corrupted this cache before: a mismatched
  // rate got stored, then every subsequent reverse-estimate compounded it.
  // Fiat<->fiat doesn't use this cache at all (see above) — skip seeding it.
  const quoteInputAmount = parseFloat(swapQuote.quote?.input.amount ?? '0') || 0;
  const quoteOutputAmount = parseFloat(swapQuote.quote?.output.amount ?? '0') || 0;
  if (!isFiatToFiat && quoteInputAmount > 0 && quoteOutputAmount > 0) {
    lastRateRef.current = quoteOutputAmount / quoteInputAmount;
  }

  // Any real quote fetch in flight — the first one for a pair, a later
  // re-fetch off a changed amount, or the ~25-30s background auto-refresh
  // (see useSwapQuote's own doc). Previously scoped to only the very first
  // fetch ever (`swapQuote.loading && !swapQuote.quote`) so a later re-fetch
  // kept showing the OLD amount with no skeleton at all — since the typed
  // side's own USD line updates instantly off client math while this one
  // waits on the network, that read as "the other value doesn't update in
  // real time" (a real bug report, not a stale-rate feature): no visible
  // sign anything was happening, and if the new quote happened to land on
  // the same number as before, it could look like the app never responded
  // to the edit at all. Fiat<->fiat keeps the narrower first-fetch-only
  // gate — that pivot table isn't debounced/re-fetched per keystroke the
  // way a real quote is, so there's no equivalent "typing looks frozen"
  // risk to fix.
  const quoteIsPending = isFiatToFiat ? fiatToFiatQuote.loading && fiatToFiatQuote.rate === 0 : swapQuote.loading;
  // The side actually being typed into never shows a skeleton over itself
  // — only whichever side is waiting on the quote to fill in.
  const fromAmountIsPending = quoteIsPending && amountSource.side === 'to';
  const toAmountIsPending = quoteIsPending && amountSource.side === 'from';

  // Real onramp/offramp min/max — `/api/public/ramp/limits`, same source
  // app.morapay.io's own `useRampLimits` reads. Checked BEFORE the quote
  // engine's own error, same priority order as the real app's
  // `rampBuyBelowMinFromQuote`: a `50 GHS minimum` is worth catching with a
  // clean message before ever hitting the quote endpoint's own, much less
  // friendly rejection for the same reason (confirmed live against
  // app.morapay.io itself: amounts that clear this check but still aren't
  // enough for the pricing engine to route show that raw quote error
  // verbatim there too — that part isn't something either app can smooth
  // over client-side, so this only covers the "obviously too small" case).
  const rampMode: 'onramp' | 'offramp' | null =
    fromToken.type === 'fiat' && toToken.type !== 'fiat'
      ? 'onramp'
      : fromToken.type !== 'fiat' && toToken.type === 'fiat'
        ? 'offramp'
        : null;
  const rampLimits = useRampLimits(rampMode === 'onramp' ? fromToken.symbol : rampMode === 'offramp' ? toToken.symbol : null);
  const rampLimitError =
    rampMode && fromTokenAmount > 0
      ? rampAmountBelowMin(fromTokenAmount, rampLimits, rampMode, rampMode === 'offramp' ? fromToken.symbol : toToken.symbol)
      : null;

  // The backend rejects specific amounts (below a minimum, above a
  // liquidity cap, unsupported pair, etc.) with a real, user-facing message
  // — same as app.morapay.io's "Minimum is 50 GHS"-style errors — surface
  // it instead of letting the rate silently fall back to whatever was last
  // good. Only relevant once something's actually been typed — gated on
  // `amountSource.amount` (what was actually typed) rather than
  // `fromTokenAmount`: for a reverse quote (typed into "to", or a USD
  // figure that resolved to the "to" side) `fromTokenAmount` is itself
  // derived FROM the quote, so it's 0 exactly when the quote failed —
  // gating on it would hide the very error that explains why it's 0.
  const quoteErrorMessage = isFiatToFiat
    ? amountSource.amount > 0
      ? fiatToFiatQuote.error
      : null
    : (rampLimitError ?? (amountSource.amount > 0 ? swapQuote.error : null));

  // What's actually shown on screen, as opposed to what blocks the button
  // above. A raw quote-fetch failure (a network hiccup, an upstream
  // DEX/bridge provider erroring out — e.g. a literal "0x request failed:
  // fetch failed" leaking through unfiltered) tells the user nothing
  // actionable, so it stays silent here; `quoteErrorMessage` above still
  // requires a real quote before the swap button unblocks either way.
  // `rampLimitError` is the one exception — always a clean, client-computed
  // "Minimum is 50 GHS"-style message, safe and worth showing as-is.
  const quoteErrorDisplay = isFiatToFiat ? null : rampLimitError;

  // The secondary "$ X.XX" line only has something real to show when one
  // side of the live rate is a USD-pegged stablecoin — that IS the trade's
  // USD value on both legs. Anything else (e.g. ETH<->SOL, or a fiat
  // currency with no stablecoin counterpart) has no live USD anchor to
  // point at, so it stays 0 rather than inventing one.
  const fromUsdPrice = isStableToken(toToken) ? exchangeRate : isStableToken(fromToken) ? 1 : 0;
  const toUsdPrice = isStableToken(fromToken) ? (exchangeRate > 0 ? 1 / exchangeRate : 0) : isStableToken(toToken) ? 1 : 0;
  const fromUsdAmount = fromTokenAmount * fromUsdPrice;
  const toUsdAmount = toTokenAmount * toUsdPrice;

  const fromDecimals = inputDecimalsFor(fromUnit, fromToken);
  const toDecimals = inputDecimalsFor(toUnit, toToken);

  const fromPrimaryAmount = formatAmount(fromUnit === 'token' ? fromTokenAmount : fromUsdAmount, fromDecimals);
  const fromPrimaryUnitLabel = fromUnit === 'token' ? fromToken.symbol : USD_LABEL;
  const fromSecondaryLabel =
    fromUnit === 'token'
      ? `$ ${formatAmount(fromUsdAmount, 2)}`
      : `${formatAmount(fromTokenAmount, inputDecimalsFor('token', fromToken))} ${fromToken.symbol}`;

  const toPrimaryAmount = formatAmount(toUnit === 'token' ? toTokenAmount : toUsdAmount, toDecimals);
  const toPrimaryUnitLabel = toUnit === 'token' ? toToken.symbol : USD_LABEL;
  const toSecondaryLabel =
    toUnit === 'token'
      ? `$ ${formatAmount(toUsdAmount, 2)}`
      : `${formatAmount(toTokenAmount, inputDecimalsFor('token', toToken))} ${toToken.symbol}`;

  const handleFromChange = (text: string) => {
    const value = amountFromKeypadText(text, fromDecimals);
    setPercentIndex(null);
    setQuickAmountIndex(null);
    if (fromUnit === 'token') {
      setAmountSource({ side: 'from', amount: value });
      return;
    }
    // USD unit on the "from" side — only meaningful once something is
    // actually a $-anchor to convert through.
    if (isStableToken(fromToken)) {
      // 1:1, no quote needed at all — this literally IS the "from" amount.
      setAmountSource({ side: 'from', amount: value });
    } else if (isStableToken(toToken)) {
      // The "to" side is the stable/USD anchor — ask for exactly $value
      // worth of it. A real bidirectional quote for a pure crypto<->crypto
      // swap, or a rate-estimated forward quote (see
      // `needsEstimatedForwardQuery` above) for onramp/offramp — either
      // way this always resolves to a real, backend-confirmed number.
      setAmountSource({ side: 'to', amount: value });
    } else {
      // No USD anchor on either side for this pair/direction (plain fiat
      // like GHS/NGN, or two non-stable crypto legs) — there's no live USD
      // price this app tracks outside of a stablecoin leg.
      setAmountSource({ side: 'from', amount: 0 });
    }
  };

  const handleToChange = (text: string) => {
    const value = amountFromKeypadText(text, toDecimals);
    setPercentIndex(null);
    setQuickAmountIndex(null);
    if (toUnit === 'token') {
      // Always accepted, even for onramp/offramp: see
      // `needsEstimatedForwardQuery` above for how a fiat-involving pair
      // still gets a real quote out of a "to"-side keystroke.
      setAmountSource({ side: 'to', amount: value });
      return;
    }
    // USD unit on the "to" side — same anchor logic as the "from" side, mirrored.
    if (isStableToken(toToken)) {
      setAmountSource({ side: 'to', amount: value });
    } else if (isStableToken(fromToken)) {
      setAmountSource({ side: 'from', amount: value });
    }
  };

  const handlePercentSelect = (index: number) => {
    setPercentIndex(index);
    setAmountSource({ side: 'from', amount: balance * PERCENTS[index] });
  };

  // 1 dollar-pegged stablecoin === $1 — no quote/conversion needed, same
  // reasoning as the USD-unit "from" field's own 1:1 branch above.
  const handleQuickAmountSelect = (index: number) => {
    setQuickAmountIndex(index);
    setAmountSource({ side: 'from', amount: QUICK_USD_AMOUNTS[index] });
  };

  // Same idea as `handleQuickAmountSelect`, but the amount is already in
  // the fiat "from" token's own currency (GHS, NGN, ...) — no USD anchor or
  // conversion involved, unlike the stablecoin case above.
  const handleFiatQuickAmountSelect = (index: number) => {
    setQuickAmountIndex(index);
    setAmountSource({ side: 'from', amount: fiatQuickAmounts[index] });
  };

  const toggleFromUnit = () => {
    setFromUnit((unit) => (unit === 'token' ? 'usd' : 'token'));
  };

  const toggleToUnit = () => {
    setToUnit((unit) => (unit === 'token' ? 'usd' : 'token'));
  };

  const handleTokenSelected = (token: SwapToken) => {
    // Send's own destination-token pick isn't a swap-pair change at all —
    // it doesn't touch fromToken/toToken or the remembered last-traded
    // pair, just which asset the typed address should receive.
    if (pickerField === 'send-destination') {
      setSendDestinationToken(token);
      setPickerField(null);
      setSendError(null);
      return;
    }
    // Deliberately NOT resetting `amountSource` here — whatever the user
    // already typed on either side is still a perfectly meaningful request
    // ("I want to spend 50 of whichever token this now is" / "I want to
    // receive 50 of it") once the token changes; only the derived side
    // needs a fresh quote, which the pair-change already triggers on its
    // own. Zeroing it out used to force a full re-type after every single
    // token switch — the exact disconnect this avoids.
    // A manual pick always wins over the stored preference — stops the
    // restore effect above from later overwriting it once the full token
    // catalog loads in.
    restoredTokenPreferenceRef.current = true;
    let nextFromToken = fromToken;
    let nextToToken = toToken;
    if (pickerField === 'from') {
      nextFromToken = token;
      setFromToken(token);
      setFromUnit('token');
      // The percent pills are a percentage of *this* token's wallet
      // balance — switching it makes the old selection describe a
      // different amount than what's on screen, so it's cleared rather
      // than silently staying "selected" against a balance it no longer
      // matches. Switching "to" doesn't touch the balance the pills key
      // off, so it doesn't need to clear them.
      setPercentIndex(null);
      setQuickAmountIndex(null);
    } else if (pickerField === 'to') {
      nextToToken = token;
      setToToken(token);
      setToUnit('token');
    }
    setPickerField(null);
    setSwapError(null);
    void saveLastTradedTokens(nextFromToken.id, nextToToken.id);
  };

  // MomoSheet's own network picker (inside "where do you want to receive")
  // re-picks a real chain-variant of the same token symbol — functionally
  // the same as picking "to" from the main token sheet, just triggered from
  // inside that other sheet instead, so it goes through the identical
  // reset/persist logic rather than a parallel copy of it.
  const handleSelectToTokenFromReceiveStep = (token: SwapToken) => {
    restoredTokenPreferenceRef.current = true;
    setToToken(token);
    setToUnit('token');
    void saveLastTradedTokens(fromToken.id, token.id);
  };

  const handleConnectWallet = () => {
    void walletConnectActions.connect();
  };
  const handleDisconnectWallet = () => {
    void walletConnectActions.disconnect();
  };
  // Manual retry of the same auto-switch the effect above already attempts
  // — useful if that first silent attempt was missed (e.g. the wallet
  // wasn't ready yet) or a prompt was dismissed.
  const handleSwitchChain = () => {
    if (fromToken.type === 'crypto' && fromToken.chainId) void walletConnectActions.switchToChain(fromToken.chainId);
  };

  // Real execution — signs and sends an actual on-chain transaction via the
  // connected wallet (see useSwapExecution.web.ts). Same-chain pairs only:
  // that's what 0x's quote covers, and it's the only swap-execution path
  // morapay's own backend exposes publicly — Squid's real calldata is only
  // ever requested server-side (`for_execution: true`, set exclusively by
  // internal ramp/bridge services, never accepted from a public request).
  const runRealSwap = async () => {
    setIsSwapping(true);
    setSwapError(null);
    const startedAt = Date.now();
    try {
      const txHash = await swapExecution.execute({ fromToken, toToken, amount: fromTokenAmount });
      // A real, measured duration — not a guessed/typical figure — and a
      // real explorer link for the same chain both legs settle on (same-
      // chain only, see this function's own doc comment above). Falls back
      // to this app's own site only when the chain isn't one of the
      // handful `explorerTxUrl` knows a block explorer for — still a real
      // URL, never a fabricated one.
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      setReceiptData({
        id: txHash.slice(2, 8).toUpperCase(),
        type: 'SWAP',
        status: 'SETTLED',
        from: { amount: formatAmount(fromTokenAmount, inputDecimalsFor('token', fromToken)), symbol: fromToken.symbol },
        to: { amount: formatAmount(toTokenAmount, inputDecimalsFor('token', toToken)), symbol: toToken.symbol },
        timestamp: Date.now(),
        verifyUrl: explorerTxUrl(fromToken.chainId, txHash) ?? 'https://morapay.io',
        stats: { settlementTime: `${elapsedSeconds}s`, settlementMethod: 'ON-CHAIN' },
      });
      setAmountSource({ side: 'from', amount: 0 });
      setPercentIndex(null);
    setQuickAmountIndex(null);
    } catch (err) {
      setSwapError(err instanceof Error ? err.message : 'Could not complete this swap. Please try again.');
    } finally {
      setIsSwapping(false);
    }
  };

  // Mobile money doesn't have a balance we can check in-app, so it never
  // blocks on funds — only the crypto leg does.
  const insufficientFunds = walletConnected && fromToken.type !== 'fiat' && fromTokenAmount > balance;

  const swapButtonState = getSwapButtonState({
    walletConnected,
    isSwapping,
    amount: fromTokenAmount,
    balance,
    fromToken,
    toToken,
  });
  const swapButtonBlocked = SWAP_BUTTON_BLOCKED_STATES.has(swapButtonState);
  const swapButtonLabel = swapButtonState === 'swapping' ? 'Swapping…' : SWAP_BUTTON_LABEL[swapButtonState];

  const [momoSheetOpen, setMomoSheetOpen] = useState(false);
  const [momoDirection, setMomoDirection] = useState<'onramp' | 'offramp'>('offramp');

  const handleSwapPress = () => {
    if (swapButtonState === 'connect-wallet') {
      handleConnectWallet();
    } else if (swapButtonState === 'onramp' || swapButtonState === 'offramp') {
      // getSwapButtonState only returns these when a fiat leg is actually
      // involved, so this always means "open the momo form," never the
      // crypto-crypto execution path.
      setMomoDirection(swapButtonState);
      setMomoSheetOpen(true);
    } else if (swapButtonState === 'ready') {
      void runRealSwap();
    }
  };

  // Momo-tab AND Send-tab onramp both finish through the same sheet, so
  // this has to know which one just completed: a Send also needs its
  // destination/recipient state cleared, not just the amount.
  const handleMomoComplete = () => {
    setAmountSource({ side: 'from', amount: 0 });
    setPercentIndex(null);
    setQuickAmountIndex(null);
    if (momoPresetAddress) {
      setRecipient('');
      setCountryOverride(null);
      setSendDestinationToken(null);
      setMomoPresetAddress(null);
      setSendSuccessMessage(`Sent to ${shortenAddress(momoPresetAddress) ?? momoPresetAddress}.`);
    }
  };

  // Receiving isn't spending from the connected balance, so it never blocks
  // on "insufficient funds" the way sending does.
  const isReceiveMode = mode === 1 && sendMode === 1;
  const detectedDestination = detectDestination(recipient);

  // An ENS name is a real destination, but only once it resolves — that's a
  // live lookup against `/api/ens/address`, so it's kept separate from the
  // purely shape-based classification above.
  const isEnsKind = detectedDestination?.kind === 'ens';
  const ens = useEnsResolution(isEnsKind ? recipient.trim() : null);

  // Addresses that are literally typed out, vs. one this app had to resolve.
  const isLiteralAddressKind =
    detectedDestination?.kind === 'evm' || detectedDestination?.kind === 'bitcoin' || detectedDestination?.kind === 'solana';
  const isAddressKind = isLiteralAddressKind || (isEnsKind && Boolean(ens.address));
  const isContactKind = detectedDestination?.kind === 'phone' || detectedDestination?.kind === 'email';
  // Holds off showing the CountrySelect prefix until the typed value has
  // settled for a moment — without this it pops in (and can re-guess the
  // country) on every single keystroke once the digit count crosses the
  // phone-shape threshold, which reads as flicker rather than a confident
  // detection. Only gates when it APPEARS; it still disappears immediately
  // once the value stops looking like a phone number (see the render site).
  const showCountrySelect = useDebouncedValue(detectedDestination?.kind === 'phone', 350);
  // Whether a send-to-contact is even possible for the current "from" token
  // — see useContactSend's own doc. Checked here (not just inside
  // runContactSend) so the button itself can go straight to a disabled
  // "Coming soon" state instead of being enabled and bouncing an error.
  const contactSendBlocked = isContactKind ? contactSendBlockedReason(fromToken) : null;
  const resolvedRecipientAddress = isLiteralAddressKind ? recipient.trim() : isEnsKind ? ens.address : null;
  // Something was typed, but it isn't a recognizable destination of any kind.
  // Tracked explicitly so the button can say so, instead of sitting there
  // enabled and doing nothing when pressed.
  const isUnrecognizedDestination = recipient.trim().length > 0 && !detectedDestination;

  // Real, useful copy for the gaps the badge/token-pill/blocked-caption
  // below don't cover — see destinationSubcard's own doc for why this
  // exists at all (replaces a fixed `minHeight` that just left blank space
  // in exactly these states). `null` whenever one of those three already
  // has something to say, so nothing ever renders twice.
  const sendDestinationHint =
    isContactKind && !contactSendBlocked
      ? `We'll ${detectedDestination?.kind === 'phone' ? 'text' : 'email'} them a claim code once this clears.`
      : recipient.trim().length === 0
        ? "We'll detect the network automatically from an address, ENS name, phone number, or email."
        : isUnrecognizedDestination
          ? "We don't recognize this as an address, ENS name, phone number, or email."
          : null;

  // If the user picked a different country than what was auto-detected,
  // that choice should actually change the label shown, not just the chip.
  // For an ENS name the label reports the live lookup instead of a static
  // description — resolving, the address it landed on, or that it doesn't
  // resolve at all.
  const destinationLabel =
    detectedDestination?.kind === 'phone' && countryOverride
      ? describePhoneForCountry(recipient, countryOverride)
      : isEnsKind
        ? ens.loading
          ? 'Resolving ENS name…'
          : ens.address
            ? `ENS · ${shortenAddress(ens.address) ?? ens.address}`
            : ens.failed
              ? "That ENS name doesn't resolve"
              : detectedDestination?.label
        : detectedDestination?.label;

  // Only collapse long addresses to "front...back" while the field isn't
  // actively being edited — mid-typing this always shows exactly what's
  // been typed, full and untruncated. An ENS name is short and readable as
  // typed, so it's never truncated.
  const destinationDisplayValue =
    !destinationFocused && isLiteralAddressKind
      ? truncateMiddle(recipient, destinationCharBudget(destinationInputWidth))
      : recipient;
  // Derived straight from what's actually displayed (not the DOM node's
  // own measured height — see destinationLineCount's doc for why), so this
  // always agrees with whatever destinationDisplayValue just resolved to:
  // one line for short content or an address that already fits, two for
  // anything genuinely long enough to need the field's max.
  const destinationInputHeight = destinationLineCount(destinationDisplayValue, destinationInputWidth) * DESTINATION_LINE_HEIGHT;

  /** The typed contact in the form the backend can actually reach: an email
   * as-is, a phone number normalized to E.164 against whichever country the
   * user settled on. */
  const contactIdentifier =
    detectedDestination?.kind === 'phone'
      ? toE164Phone(recipient, countryOverride ?? detectedDestination.countryCode)
      : recipient.trim();

  const handleRecipientChange = (text: string) => {
    setRecipient(text);
    if (text.length === 0) setCountryOverride(null); // start fresh next time
    setSendError(null);
    setSendSuccessMessage(null);
  };

  // The token/chain a crypto address should actually receive doesn't come
  // from anywhere else the way a swap's own "to" token does (a raw address
  // implies nothing about which asset it wants) — it's picked here, once
  // the destination resolves to one. Cleared the moment that stops being
  // true (a different kind of destination, or a different "from" token —
  // both change what a previous pick would mean).
  useEffect(() => {
    setSendDestinationToken(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedDestination?.kind, fromToken.id]);

  // Sending a fiat/momo balance pays out over the mobile money rail, not a
  // wallet — same reasoning as the swap card's onramp: nothing to connect
  // just to send it.
  const sendPayingWithFiat = fromToken.type === 'fiat';
  const sendReady = walletConnected || sendPayingWithFiat;
  // A crypto-to-address send additionally needs its destination token
  // picked before there's anything real to submit.
  const needsDestinationToken = !isReceiveMode && isAddressKind && !sendDestinationToken;
  // Receive mode just needs a real settlement destination for whatever
  // token is being requested (see ReceiveDestinationCard) — the payer's and
  // the requester's own contact are collected afterward, in
  // PaymentRequestDeliverySheet.
  const receiveNeedsPayout = isReceiveMode && !receivePayout;
  const sendDisabled =
    (!isReceiveMode && Boolean(contactSendBlocked)) ||
    (sendReady &&
      (fromTokenAmount === 0 ||
        (!isReceiveMode && insufficientFunds) ||
        (!isReceiveMode && recipient.length === 0) ||
        (!isReceiveMode && isUnrecognizedDestination) ||
        (!isReceiveMode && isEnsKind && !ens.address) ||
        (!isReceiveMode && needsDestinationToken) ||
        receiveNeedsPayout ||
        sendExecuting));
  const sendLabel = !isReceiveMode && contactSendBlocked
    ? 'Coming soon'
    : !sendReady
      ? SWAP_BUTTON_LABEL['connect-wallet']
      : sendExecuting
        ? isReceiveMode
          ? 'Requesting…'
          : 'Sending…'
        : isEnsKind && ens.loading
          ? 'Resolving…'
          : isUnrecognizedDestination || (isEnsKind && ens.failed)
            ? 'Check Destination'
            : isReceiveMode
              ? receiveNeedsPayout
                ? 'Add Payout Details'
                : 'Request'
              : insufficientFunds
                ? SWAP_BUTTON_LABEL['insufficient-funds']
                : needsDestinationToken
                  ? 'Choose Destination Token'
                  : 'Send';
  const sendWarning = sendReady && !isReceiveMode && insufficientFunds;

  /** Clears the Send/Receive form after something actually completed. */
  const resetSendForm = () => {
    setAmountSource({ side: 'from', amount: 0 });
    setPercentIndex(null);
    setQuickAmountIndex(null);
    setRecipient('');
    setCountryOverride(null);
    setSendDestinationToken(null);
    setReceivePayout(null);
  };

  /** Receive mode — files a real payment request against
   * `POST /api/public/requests`, which (unless `skipNotify`) notifies the
   * payer and always returns the shareable pay link. The payer has to be an
   * email or phone: that endpoint bills someone over a notification
   * channel, so a wallet address is not a payer it can reach. Only ever
   * called from PaymentRequestDeliverySheet's Continue — the requester's own
   * side (amount, payout destination) is validated before that sheet even
   * opens, see handleSendPress. */
  const runPaymentRequest = async (payerContact: string, channel: DeliveryChannel, skipNotify: boolean, requesterIdentifier: string) => {
    // A real chain code for crypto (coreChainCode); for fiat, the special
    // strings `onRequestPaymentSettled` itself checks for non-crypto
    // settlement ("MOMO"/"BANK") — see ReceiveDestinationCard's own doc for
    // why sending the honest value still matters even though Core
    // currently overrides it whenever the payer pays over the fiat
    // pay-link (this app's only payer flow today).
    const fiatSymbol = fromToken.symbol.trim().toUpperCase();
    const chainCode =
      fromToken.type === 'crypto' ? coreChainCode(fromToken.chainId) : fiatSymbol === 'GHS' ? 'MOMO' : fiatSymbol === 'NGN' ? 'BANK' : null;
    if (!chainCode || !receivePayout) {
      setSendError('Could not create that request. Please try again.');
      return;
    }

    const payerIsEmail = channel === 'email';
    const summary = `${formatAmount(fromTokenAmount, inputDecimalsFor('token', fromToken))} ${fromToken.symbol} on ${fromToken.chainName}`;
    setSendExecuting(true);
    try {
      const created = await createPaymentRequest({
        payerEmail: payerIsEmail ? payerContact : undefined,
        payerPhone: payerIsEmail ? undefined : payerContact,
        requesterIdentifier,
        amount: fromTokenAmount.toString(),
        tokenSymbol: fromToken.symbol,
        chainCode,
        receiveSummary: summary,
        channels: skipNotify ? [] : payerIsEmail ? ['EMAIL'] : ['SMS'],
        payoutTarget: receivePayout.kind === 'crypto' ? receivePayout.address : undefined,
        payoutFiat: receivePayout.kind === 'fiat' ? receivePayout.payoutFiat : undefined,
        skipPaymentRequestNotification: skipNotify,
      });
      setPaymentRequest(created);
      setPaymentRequestSummary(summary);
      setPayLinkCopied(false);
      setPaymentDeliverySheetOpen(false);
      setPayLinkSheetOpen(true);
      resetSendForm();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not create that request. Please try again.');
    } finally {
      setSendExecuting(false);
    }
  };

  /** Send to a phone number or email — the real custody + claim flow (see
   * useContactSend for the three steps it actually runs). */
  const runContactSend = async () => {
    const blocked = contactSendBlockedReason(fromToken);
    if (blocked) return; // the button itself is disabled ("Coming soon") for this case
    if (!walletAddress) {
      handleConnectWallet();
      return;
    }

    const contactValue = contactIdentifier;
    const kind = detectedDestination?.kind === 'email' ? 'email' : 'phone';
    setSendExecuting(true);
    try {
      const result = await contactSend.sendToContact({
        fromToken,
        // Nothing is being converted on the way in — the recipient claims
        // this value and picks their own payout at that point, so both legs
        // are the token actually being deposited.
        toToken: fromToken,
        amount: fromTokenAmount,
        toAmount: fromTokenAmount,
        senderAddress: walletAddress,
        senderEmail: PLACEHOLDER_PAYER_EMAIL,
        recipient: { kind, value: contactValue },
      });
      setContactSendResult({ kind, destination: contactValue, notified: result.notified, confirmed: result.confirmed });
      resetSendForm();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send. Please try again.');
    } finally {
      setSendExecuting(false);
    }
  };

  /** Send to a wallet address — a plain transfer when the recipient is
   * getting the same token being sent, or a swap-then-forward when they're
   * getting a different one. */
  const runAddressSend = async (toAddress: string, destinationToken: SwapToken) => {
    if (destinationToken.id === fromToken.id) {
      setSendExecuting(true);
      try {
        await tokenTransfer.transfer({
          token: fromToken,
          toAddress,
          amount: fromTokenAmount.toString(),
        });
        setSendSuccessMessage(`Sent to ${shortenAddress(toAddress) ?? toAddress}.`);
        resetSendForm();
      } catch (err) {
        setSendError(err instanceof Error ? err.message : 'Could not send. Please try again.');
      } finally {
        setSendExecuting(false);
      }
      return;
    }

    // A different destination token means swapping first, then forwarding the
    // proceeds — two signed transactions (see useSwapAndForward for why).
    const blocked = swapAndForwardBlockedReason(fromToken, destinationToken);
    if (blocked) {
      setSendError(blocked);
      return;
    }
    const senderAddress = walletAddress;
    if (!senderAddress) {
      handleConnectWallet();
      return;
    }

    setSendExecuting(true);
    try {
      const result = await swapForward.swapAndForward({
        fromToken,
        toToken: destinationToken,
        amount: fromTokenAmount,
        toAddress,
        senderAddress,
      });
      setSendSuccessMessage(
        `Sent ${result.forwardedAmount} ${destinationToken.symbol} to ${shortenAddress(toAddress) ?? toAddress}.`,
      );
      resetSendForm();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send. Please try again.');
    } finally {
      setSendExecuting(false);
    }
  };

  const handleSendPress = async () => {
    if (!sendReady) {
      handleConnectWallet();
      return;
    }
    setSendSuccessMessage(null);
    setSendError(null);
    setPaymentRequest(null);

    // Nothing recognizable was typed — say so rather than leaving an enabled
    // button that quietly does nothing (the button is already disabled for
    // this case; this is the belt-and-braces path).
    if (isUnrecognizedDestination) {
      setSendError("That doesn't look like a wallet address, ENS name, phone number, or email.");
      return;
    }
    if (isEnsKind && !ens.address) {
      setSendError(ens.loading ? 'Still resolving that ENS name.' : "That ENS name doesn't resolve to an address.");
      return;
    }

    if (isReceiveMode) {
      // The payout destination is already validated by sendDisabled /
      // receiveNeedsPayout before this button is even enabled — all that's
      // left is confirming this token/currency has a real chain code, then
      // handing off to the delivery sheet for both contacts.
      const fiatSymbol = fromToken.symbol.trim().toUpperCase();
      const chainCode =
        fromToken.type === 'crypto' ? coreChainCode(fromToken.chainId) : fiatSymbol === 'GHS' ? 'MOMO' : fiatSymbol === 'NGN' ? 'BANK' : null;
      if (!chainCode) {
        setSendError(`Requesting ${fromToken.symbol} isn't supported yet.`);
        return;
      }
      setPaymentDeliverySheetOpen(true);
      return;
    }

    if (isContactKind) {
      await runContactSend();
      return;
    }

    if (!isAddressKind || !resolvedRecipientAddress) {
      setSendError('Enter a wallet address, ENS name, phone number, or email.');
      return;
    }

    if (needsDestinationToken) {
      setPickerField('send-destination');
      return;
    }

    if (sendPayingWithFiat) {
      // Identical to the swap card's own onramp — the only difference is
      // where the purchased crypto ends up, which MomoSheet's preset
      // address handles by skipping its own "where do you want to
      // receive" step entirely.
      setMomoPresetAddress(resolvedRecipientAddress);
      setMomoDirection('onramp');
      setMomoSheetOpen(true);
      return;
    }

    if (!sendDestinationToken) return; // sendDisabled already guards this
    await runAddressSend(resolvedRecipientAddress, sendDestinationToken);
  };

  // This app's own working link, not Core's `payLink` — see
  // payRequestLink.ts's doc for why: that web route doesn't exist yet, and
  // (verified live) the deployed by-link endpoint this app's own Pay screen
  // calls doesn't return a transactionId to pay with, so it's carried here
  // as a query param instead.
  const paymentRequestLink = paymentRequest ? buildPaymentRequestDeepLink(paymentRequest.linkId, paymentRequest.transactionId) : null;

  const handleCopyPayLink = async () => {
    if (!paymentRequestLink) return;
    try {
      await Clipboard.setStringAsync(paymentRequestLink);
      setPayLinkCopied(true);
    } catch {
      // Clipboard access can be refused (a browser without permission, for
      // one) — the link itself is on screen and selectable either way, so
      // there's nothing worth interrupting the user over.
    }
  };

  if (!preferenceResolved) {
    return (
      <SafeAreaView style={[styles.hero, isCompact && styles.heroCompact]}>
        <SwapCardSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={[styles.hero, isCompact && styles.heroCompact]}>
        <View style={[styles.card, isCompact && styles.cardCompact]}>
          <SegmentedToggle options={['Swap', 'Send']} value={mode} onChange={setMode} />

          <View style={styles.balanceRow}>
            <BalanceChip
              walletConnected={walletConnected}
              balance={formatAmount(balance, inputDecimalsFor('token', fromToken))}
              tokenSymbol={fromToken.symbol}
              insufficient={!isReceiveMode && insufficientFunds}
              fiatSource={fromToken.type === 'fiat'}
              onConnect={handleConnectWallet}
              onOpenMenu={() => setWalletMenuOpen(true)}
            />
            {showQuickAmounts ? (
              <QuickAmountPills amounts={QUICK_USD_AMOUNTS} selected={quickAmountIndex} onSelect={handleQuickAmountSelect} />
            ) : payingWithFiat ? (
              <QuickAmountPills
                amounts={fiatQuickAmounts}
                currency={fromToken.symbol}
                selected={quickAmountIndex}
                onSelect={handleFiatQuickAmountSelect}
              />
            ) : (
              <PercentPills selected={percentIndex} onSelect={handlePercentSelect} />
            )}
          </View>

          <View>
            <View style={[styles.amountBlock, isCompact && styles.amountBlockCompact]}>
              {mode === 0 ? (
                <Text style={styles.subcardLabel}>Sell</Text>
              ) : (
                <SegmentedToggle compact options={['Send', 'Receive']} value={sendMode} onChange={setSendMode} />
              )}
              {mode === 0 && fromAmountIsPending ? (
                <AmountRowSkeleton />
              ) : (
                <AmountRow
                  testID="from-amount-input"
                  editable
                  primaryAmount={fromPrimaryAmount}
                  primaryUnitLabel={fromPrimaryUnitLabel}
                  primaryUnitIcon={fromUnit === 'token' ? fromToken.logoUri : undefined}
                  secondaryLabel={fromSecondaryLabel}
                  onChangePrimaryAmount={handleFromChange}
                  onToggleUnit={toggleFromUnit}
                  onPressUnitLabel={() => setPickerField('from')}
                />
              )}
            </View>

            <View style={styles.divider}></View>
            {mode === 0 ? (
              <>
                <View style={[styles.subcard, isCompact && styles.subcardCompact]}>
                  <Text style={styles.subcardLabel}>You will receive</Text>
                  {toAmountIsPending ? (
                    <AmountRowSkeleton />
                  ) : (
                    <AmountRow
                      testID="to-amount-input"
                      editable
                      primaryAmount={toPrimaryAmount}
                      primaryUnitLabel={toPrimaryUnitLabel}
                      primaryUnitIcon={toUnit === 'token' ? toToken.logoUri : undefined}
                      secondaryLabel={toSecondaryLabel}
                      onChangePrimaryAmount={handleToChange}
                      onToggleUnit={toggleToUnit}
                      onPressUnitLabel={() => setPickerField('to')}
                    />
                  )}
                </View>

                <FooterInfo
                  compact={isCompact}
                  loading={quoteIsPending}
                  // Fiat<->fiat rates come from a different hook
                  // (useFiatToFiatQuote), which counts down its own
                  // client-driven refresh cadence — see its own doc for why
                  // that's not a real server-enforced expiry the way a real
                  // swap quote's `expiresAt` is, just the same UI cadence.
                  secondsUntilRefresh={isFiatToFiat ? fiatToFiatQuote.secondsUntilRefresh : swapQuote.secondsUntilExpiry}
                  primary={{
                    label: 'Exchange Rate',
                    value: `1 ${fromToken.symbol} = ${formatAmount(exchangeRate, exchangeRate < 1 ? 6 : 2)} ${toToken.symbol}`,
                  }}
                  items={[
                    // The backend's own fee field is always "0.00" right
                    // now (not a real number yet, whatever the actual cost
                    // is), and the old fallback here was an outright made-up
                    // placeholder — a permanent skeleton is more honest than
                    // either.
                    { label: 'Fee', loading: true },
                  ]}
                />
                {quoteErrorDisplay && (
                  <Text testID="quote-error" style={styles.swapErrorText}>
                    {quoteErrorDisplay}
                  </Text>
                )}
                {swapError && (
                  <Text testID="swap-error" style={styles.swapErrorText}>
                    {swapError}
                  </Text>
                )}
                <PrimaryButton
                  testID="swap-cta"
                  label={swapButtonLabel}
                  variant={swapButtonBlocked ? 'warning' : 'primary'}
                  loading={swapButtonState === 'swapping'}
                  disabled={
                    swapButtonBlocked ||
                    (swapButtonState === 'ready' && fromTokenAmount === 0) ||
                    // Blocks 'ready' (plain swap), 'onramp', and 'offramp' alike —
                    // a rejected amount shouldn't let any of them through.
                    ((swapButtonState === 'ready' || swapButtonState === 'onramp' || swapButtonState === 'offramp') &&
                      Boolean(quoteErrorMessage))
                  }
                  onPress={handleSwapPress}
                />
              </>
            ) : (
              <>
                {!isReceiveMode && fromTokenAmount > 0 && (
                  <View style={[styles.subcard, isCompact && styles.subcardCompact, styles.destinationSubcard]}>
                    <Text style={styles.subcardLabel}>Destination</Text>
                    {/* Always the same row/TextInput, whether or not CountrySelect is
                        showing — switching between two entirely different element
                        trees here would unmount and remount the input the moment a
                        phone number gets detected mid-typing, dropping focus. */}
                    <View style={styles.destinationRow}>
                      {showCountrySelect && detectedDestination?.kind === 'phone' && (
                        <CountrySelect
                          countryCode={countryOverride ?? detectedDestination.countryCode ?? null}
                          onPress={() => setCountrySheetOpen(true)}
                        />
                      )}
                      <TextInput
                        testID="destination-input"
                        value={destinationDisplayValue}
                        onChangeText={handleRecipientChange}
                        onFocus={() => setDestinationFocused(true)}
                        onBlur={() => setDestinationFocused(false)}
                        onLayout={(event) => setDestinationInputWidth(event.nativeEvent.layout.width)}
                        placeholder="Address, ENS, phone, or email"
                        placeholderTextColor={swapColors.textMuted}
                        keyboardType={detectedDestination?.kind === 'phone' ? 'phone-pad' : 'default'}
                        underlineColorAndroid="transparent"
                        multiline
                        style={[
                          styles.destinationInput,
                          styles.destinationInputFlex,
                          { height: destinationInputHeight },
                          noOutlineStyle,
                        ]}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                    {/* Not shown for a contact (email/phone) destination —
                        that badge only ever repeated back what the person
                        just typed ("Email — redeemable once claimed",
                        "MTN.GH") without adding anything new. Still shown for
                        an address/ENS destination, where it's the only place
                        the detected chain/network shows up. */}
                    {destinationLabel && !isContactKind && (
                      <View style={styles.destinationBadge}>
                        <Text style={styles.destinationBadgeText}>{destinationLabel}</Text>
                      </View>
                    )}
                    {isAddressKind && (
                      <Pressable
                        testID="send-destination-token-pill"
                        accessibilityRole="button"
                        accessibilityLabel={
                          sendDestinationToken ? `Receiving ${sendDestinationToken.symbol} on ${sendDestinationToken.chainName}` : 'Choose what they receive'
                        }
                        onPress={() => setPickerField('send-destination')}
                        style={styles.sendDestinationTokenPill}
                      >
                        {sendDestinationToken ? (
                          <>
                            <Image source={{ uri: sendDestinationToken.logoUri }} style={styles.sendDestinationTokenIcon} />
                            <Text style={styles.sendDestinationTokenLabel}>
                              Receiving {sendDestinationToken.symbol} on {sendDestinationToken.chainName}
                            </Text>
                          </>
                        ) : (
                          <Text style={styles.sendDestinationTokenPlaceholder}>Choose what they receive</Text>
                        )}
                        <ChevronDown size={13} color={swapColors.textMuted} />
                      </Pressable>
                    )}
                    {/* Coming-soon caption for a contact destination this
                        token can't actually pay yet — the primary button
                        itself already reads "Coming soon" and is disabled
                        (see `contactSendBlocked`); this just says why. */}
                    {isContactKind && contactSendBlocked && (
                      <Text testID="contact-send-blocked-caption" style={styles.contactSendBlockedCaption}>
                        {contactSendBlocked}
                      </Text>
                    )}
                    {sendDestinationHint && (
                      <Text testID="send-destination-hint" style={styles.contactSendBlockedCaption}>
                        {sendDestinationHint}
                      </Text>
                    )}
                  </View>
                )}
                {/* Receive mode: the requester fills in only what they're
                    owed and where it should land. The payer never touches
                    this screen (they're not the one running it) — that
                    contact, plus the requester's own, is collected
                    afterward in PaymentRequestDeliverySheet. This card sits
                    in the exact slot Send mode's "Destination" card uses. */}
                {isReceiveMode && fromTokenAmount > 0 && (
                  <ReceiveDestinationCard
                    token={fromToken}
                    walletConnected={walletConnected}
                    walletAddress={walletAddress}
                    onConnectWallet={handleConnectWallet}
                    onResolvedChange={setReceivePayout}
                  />
                )}
                {sendError && (
                  <Text testID="send-error" style={styles.swapErrorText}>
                    {sendError}
                  </Text>
                )}
                {/* A payment request's own result lives entirely in
                    PayLinkSheet (opened automatically), so runPaymentRequest
                    never sets this — it's only ever the other send
                    outcomes (contact send, address send, swap-and-forward). */}
                {sendSuccessMessage && !sendError && (
                  <Text testID="send-success" style={styles.sendSuccessText}>
                    {sendSuccessMessage}
                  </Text>
                )}
                <PrimaryButton
                  testID="send-cta"
                  label={sendLabel}
                  variant={sendWarning ? 'warning' : 'primary'}
                  loading={sendExecuting}
                  disabled={sendDisabled}
                  onPress={handleSendPress}
                />
              </>
            )}
          </View>
        </View>
        <ActiveTransactionPill onPress={() => setTransactionSheetOpen(true)} />
      </SafeAreaView>

      <TransactionProgressSheet visible={transactionSheetOpen} onClose={() => setTransactionSheetOpen(false)} />
      <DevTransactionSimulator
        onPreviewReceipt={() =>
          setReceiptData({
            id: 'DEV0001',
            type: 'SWAP',
            status: 'SETTLED',
            from: { amount: '500', symbol: 'USDC' },
            to: { amount: '7,481.20', symbol: 'GHS' },
            timestamp: Date.now(),
            verifyUrl: 'https://basescan.org/tx/0xdev0000000000000000000000000000000000000000000000000000000000',
            stats: { settlementTime: '42s', settlementMethod: 'ON-CHAIN' },
            promo: { emoji: '🎁', text: 'Invite a merchant, earn $10 when they process their first payment.' },
          })
        }
      />
      <ReceiptModal visible={receiptData !== null} data={receiptData} onClose={() => setReceiptData(null)} />

      <TokenSelectSheet
        visible={pickerField !== null}
        tokens={tokens}
        loading={tokensLoading}
        onClose={() => setPickerField(null)}
        onSelect={handleTokenSelected}
        selectedId={
          pickerField === 'from'
            ? fromToken.id
            : pickerField === 'to'
              ? toToken.id
              : pickerField === 'send-destination'
                ? sendDestinationToken?.id
                : undefined
        }
      />

      <MomoSheet
        visible={momoSheetOpen}
        direction={momoDirection}
        fromToken={fromToken}
        // A Send-to-address onramp buys `sendDestinationToken` (picked in
        // the Send tab's own sheet), not the Swap tab's separate `toToken`
        // — the two are independent selections that happen to share this
        // one sheet's plumbing.
        toToken={momoPresetAddress && sendDestinationToken ? sendDestinationToken : toToken}
        amount={fromTokenAmount}
        toAmount={toTokenAmount}
        walletConnected={walletConnected}
        walletAddress={walletAddress}
        onConnectWallet={handleConnectWallet}
        onClose={() => {
          setMomoSheetOpen(false);
          setMomoPresetAddress(null);
        }}
        onComplete={handleMomoComplete}
        tokens={tokens}
        onSelectToToken={handleSelectToTokenFromReceiveStep}
        presetReceiveAddress={momoPresetAddress ?? undefined}
      />

      {/* Both render last, so they paint above the card AND above MomoSheet —
          each owns a full-screen backdrop, which is the whole point: an
          anchored dropdown nested in the card can't be dismissed by tapping
          outside it (see SheetShell). Selecting a row closes the sheet from
          here rather than letting it animate itself out, so the choice takes
          effect immediately. */}
      <CountrySelectSheet
        visible={countrySheetOpen}
        countryCode={countryOverride ?? (detectedDestination?.kind === 'phone' ? detectedDestination.countryCode : undefined) ?? '233'}
        onSelect={(code) => {
          setCountryOverride(code);
          setCountrySheetOpen(false);
        }}
        onClose={() => setCountrySheetOpen(false)}
      />

      <WalletMenuSheet
        visible={walletMenuOpen}
        chainName={fromToken.chainName}
        onSwitchChain={() => {
          setWalletMenuOpen(false);
          handleSwitchChain();
        }}
        onDisconnect={() => {
          setWalletMenuOpen(false);
          handleDisconnectWallet();
        }}
        onClose={() => setWalletMenuOpen(false)}
      />

      {paymentRequest && paymentRequestLink && (
        <PayLinkSheet
          visible={payLinkSheetOpen}
          onClose={() => setPayLinkSheetOpen(false)}
          payLink={paymentRequestLink}
          label={`Payment link · ${paymentRequest.code}`}
          amountLabel={paymentRequestSummary ?? ''}
          onCopy={handleCopyPayLink}
          copied={payLinkCopied}
        />
      )}

      <PaymentRequestDeliverySheet
        visible={paymentDeliverySheetOpen}
        onClose={() => {
          setPaymentDeliverySheetOpen(false);
          setSendError(null);
        }}
        amountLabel={`${formatAmount(fromTokenAmount, inputDecimalsFor('token', fromToken))} ${fromToken.symbol} on ${fromToken.chainName}`}
        submitting={sendExecuting}
        error={sendError}
        onSubmit={runPaymentRequest}
      />

      {contactSendResult && (
        <ContactSendResultSheet
          visible={Boolean(contactSendResult)}
          onClose={() => setContactSendResult(null)}
          kind={contactSendResult.kind}
          destination={contactSendResult.destination}
          notified={contactSendResult.notified}
          confirmed={contactSendResult.confirmed}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  swapErrorText: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.warningText,
    marginTop: 8,
    marginHorizontal: 4,
  },
  sendSuccessText: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.textPrimary,
    marginTop: 8,
    marginHorizontal: 4,
  },
  // The destination token pill — same nested-contrast pattern as
  // MomoSheet's own network pill (a `subcard`-toned pill inside this
  // `subcard`-toned card steps to `card` for contrast instead).
  sendDestinationTokenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: swapRadii.pill,
    backgroundColor: swapColors.card,
  },
  contactSendBlockedCaption: {
    marginTop: 10,
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
  },
  sendDestinationTokenIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: swapColors.subcard,
  },
  sendDestinationTokenLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textPrimary,
  },
  sendDestinationTokenPlaceholder: {
    flex: 1,
    minWidth: 0,
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textMuted,
  },
  hero: {
    flex: 1,
    backgroundColor: swapColors.hero,
    paddingVertical: 20,
    paddingHorizontal: HERO_MARGIN,
    justifyContent: 'flex-start',
  },
  heroCompact: {
    // A little breathing room on mobile, not the full margin used on wider
    // screens — enough that the card doesn't look glued to the bezel.
    paddingHorizontal: HERO_MARGIN_COMPACT,
  },
  card: {
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.card,
    paddingVertical: 24,
    gap: 0,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    paddingHorizontal: 8,
  },
  cardCompact: {
    gap: 0,
  },
  balanceRow: {
    flexDirection: 'row',
    margin: 10,
    marginTop:28,
    alignItems: 'center',
    justifyContent: 'space-between',
    // marginHorizontal: 24,
    // BalanceChip's connected-state menu is an absolutely-positioned
    // descendant a few levels down — its own z-index only outranks its
    // own siblings, not amountBlock (a later sibling of this row), so
    // this row itself needs to out-rank amountBlock for the popup to
    // actually paint above the card beneath it.
    zIndex: 20,
  },
  amountBlock: {
    backgroundColor: swapColors.subcard,
    padding: 20,
    borderRadius: swapRadii.subcard,
    gap: 8,
    // marginHorizontal: 24,
  },
  amountBlockCompact: {
    paddingVertical: 20,
  },
  subcard: {
    backgroundColor: swapColors.subcard,
    borderRadius: swapRadii.subcard,
    padding: 20,
    gap: 8,
  },
  subcardCompact: {
    gap: 8,
    paddingVertical: 24,
  },
  subcardLabel: {
    fontFamily: swapFonts.label,
    fontSize: 15,
    color: swapColors.textPrimary,
  },
  destinationInput: {
    fontFamily: swapFonts.label,
    fontSize: DESTINATION_FONT_SIZE,
    lineHeight: DESTINATION_LINE_HEIGHT,
    color: swapColors.textPrimary,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    // The field's actual height is driven dynamically (see
    // `destinationInputHeight`/`destinationLineCount`) so it only ever
    // takes up as many lines as the content genuinely needs — this
    // `maxHeight` is just the hard outer clamp so it still can't grow
    // past two lines while actively typing something very long.
    maxHeight: DESTINATION_LINE_HEIGHT * DESTINATION_MAX_LINES,
  },
  // CountrySelect's dropdown is an absolutely-positioned descendant — its
  // own z-index only outranks its own siblings, not the PrimaryButton
  // below (a later sibling of this subcard), so the subcard itself needs
  // to out-rank that button for the dropdown to actually paint above it.
  destinationSubcard: {
    zIndex: 15,
    // Height parity with the "Sell"/amount card above used to come from a
    // fixed `minHeight` guess, which just left blank space below the input
    // for whichever destination state didn't happen to render a badge/pill/
    // caption. Now it comes from always having a real second line instead
    // (see `sendDestinationHint`'s own doc) — same "label + two content
    // rows" shape the amount card has, so the two cards match naturally
    // rather than by a magic number.
  },
  destinationRow: {
    flexDirection: 'row',
    // Centered, not top-aligned: the CountrySelect chip and the input's
    // own single line of text have different internal padding/line-height,
    // so top-aligning them left the phone number's text sitting visibly
    // higher than the chip's. Safe unconditionally — CountrySelect only
    // ever appears next to a single-line phone number, never next to
    // multi-line address content, so there's no taller sibling here that
    // centering would misalign instead.
    alignItems: 'center',
    gap: 10,
    // Same story as destinationSubcard/balanceRow: CountrySelect's dropdown
    // is a descendant of this row, and the detection badge below is a
    // later sibling of this same row — without this, the badge (later in
    // DOM order, same default z-index) paints over the dropdown.
    zIndex: 5,
  },
  destinationInputFlex: {
    flex: 1,
    minWidth: 0,
  },
  destinationBadge: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: swapRadii.pill,
    backgroundColor: swapColors.card,
  },
  destinationBadgeText: {
    fontFamily: swapFonts.label,
    fontSize: 11,
    color: swapColors.textMuted,
  },
  divider: {
    height: 0.0,
    backgroundColor: swapColors.divider,
    marginVertical: 6,
  },
});
