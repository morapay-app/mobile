import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, ChevronDown, ClipboardPaste, Wallet, X } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';
import { noOutlineStyle } from '../webNoOutline';
import { detectDestination } from '../destinationDetect';
import {
  detectMomoNetwork,
  formatMomoNumber,
  isCompleteMomoNumber,
  MOMO_NETWORK_LOGOS,
  resolveGhsInstitution,
  toMomoReceiver,
} from '../momoNetwork';
import { getPaymentRail } from '../paymentRail';
import { getChainMeta } from '../chainMeta';
import { loadRecentAddresses, saveRecentAddress } from '../addressHistory';
import { useRampBanks } from '../useRampBanks';
import { useValidateMomo } from '../useValidateMomo';
import { shortenAddress, type SwapToken } from '../data/tokens';
import { charsForWidth, truncateMiddle } from '../truncateMiddle';
import { NetworkSelectSheet } from './NetworkSelectSheet';
import {
  confirmOfframp,
  confirmOnramp,
  forwardOfframpHub,
  getRampTransaction,
  initiateOfframp,
  initiateOnramp,
  isRampFullySettled,
  setOfframpPayoutAccount,
  startOnrampMobileMoney,
  verifyOnrampOtp,
  type BankDepositInstructions,
} from '../../../api/ramp';
import { sanitizeMessage } from '../../../api/sanitizeApiError';
import { matchesRampCorridor } from '../rampCorridor';
import { useRampDepositSend } from '../useRampDepositSend';
import { PrimaryButton } from './PrimaryButton';

export type MomoSheetProps = {
  visible: boolean;
  direction: 'onramp' | 'offramp';
  fromToken: SwapToken;
  toToken: SwapToken;
  /** Amount being paid — in fromToken units (crypto for offramp, GHS for onramp). */
  amount: number;
  /** Amount being received — in toToken units. Only used for onramp's success copy. */
  toAmount: number;
  /** Onramp pays with mobile money, not a wallet, so a wallet is no longer
   * required just to open this sheet — but the bought crypto still has to
   * land somewhere, so the sheet itself now asks: the connected wallet if
   * there is one, or a manually typed address otherwise. */
  walletConnected: boolean;
  walletAddress: string | null;
  onConnectWallet: () => void;
  onClose: () => void;
  /** Called once the user dismisses a successful transfer — the caller resets the swap form. */
  onComplete: () => void;
  /** Whatever's currently loaded from useSwapTokens — used only to find
   * other real chain-variants of `toToken`'s symbol for the "receive"
   * step's network picker (e.g. USDC on Base vs. Ethereum, if the live
   * catalog has both). Never used to invent a network that isn't a real
   * catalog entry. */
  tokens: SwapToken[];
  /** Re-picking a network in the "receive" step's network sheet is really
   * re-picking the target token (a different chain-variant of the same
   * symbol) — this changes what's actually being bought/quoted, so it has
   * to go back up to SwapScreen's own `toToken` state rather than being
   * handled locally. */
  onSelectToToken: (token: SwapToken) => void;
  /** Set when this sheet is opened from the Send tab with an already-typed
   * destination address — the "receive" step (pick a network, connect a
   * wallet or paste one) exists to ask a question that's already been
   * answered in that case, so it's skipped entirely: the sheet opens
   * straight on 'form' with this as the (non-editable) payout wallet. */
  presetReceiveAddress?: string;
};

// 'receive' only ever runs for onramp — offramp's payout destination is the
// mobile money number collected in 'form' already, so it skips straight
// there (see the `visible` effect below). 'otp' only runs for onramp's
// mobile-money rail, and only when the charge actually asks for one.
// 'deposit' only runs for onramp's bank rail (NGN today) — there's no
// user-provided payment detail for that rail at all, so once `initiate` +
// `confirm` return a real deposit account, this just shows it.
type Phase = 'receive' | 'form' | 'otp' | 'deposit' | 'awaiting' | 'success' | 'failure';

const CRYPTO_ADDRESS_KINDS = new Set(['evm', 'bitcoin', 'solana']);
// The recent-address row's own text font size — see `recentAddressText`
// below; kept as a constant since the width-aware truncation needs to
// reason in the exact same units the text is actually rendered at.
const RECENT_ADDRESS_FONT_SIZE = 14;

/** Financial-style formatting — thousand separators plus two decimals
 * ("500,000.00"), same convention SwapScreen's own formatAmount uses. */
function formatFinancial(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Duck-typed rather than `instanceof RampRequestError` — the backend's
 * error code (`customer.name.mismatch`, etc.), when present. */
function rampErrorCode(err: unknown): string | undefined {
  return err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
    ? (err as { code: string }).code
    : undefined;
}

/** Sanitized ramp/API error text, or `fallback` if the error carries
 * nothing safe to show (or isn't even an Error). Every call site supplies
 * its own fallback rather than an optional-chained `?? fallback` at the
 * call site — that pattern previously left one case (a name/account
 * mismatch) with no fallback at all, silently showing nothing if the
 * backend's message ever came back empty. Running the message through
 * `sanitizeMessage` (not just `instanceof Error` + raw `.message`) is what
 * stops a real backend error like `"customer.name.mismatch"` copy from
 * ever being replaced by, or standing alongside, something an unrelated
 * thrown TypeError/network error might carry. */
function rampErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : undefined;
  return sanitizeMessage(raw, fallback);
}

/**
 * Edge-to-edge bottom sheet for the fiat leg of a swap — flush to the
 * screen edges with a flat bottom, same shape and palette as the full-bleed
 * token picker (TokenSelectSheet): the swap card's own cream/pink, not a
 * separate identity, so this doesn't read as a different app bolted onto
 * the swap flow. Every phase (receive, form, awaiting, success, failure)
 * renders inside the same "hero card"/pill-input treatment — a bold,
 * oversized primary value on a soft card, echoing a deposit-amount entry
 * screen — so the sheet reads as one consistent surface as it walks through
 * the flow.
 *
 * The detected network still drives the success/failure outcome
 * internally, but isn't shown — the user only needs the two things they
 * actually typed reflected back at them.
 *
 * Offramp pays the crypto leg out to mobile money — the "awaiting" step is
 * a momo payout landing on the given number. Onramp charges that momo
 * number first (a prompt the user approves on their phone), then sends the
 * bought token to wherever the 'receive' step resolved — a materially
 * different wait, so the copy for each phase is direction-specific rather
 * than shared.
 */
export function MomoSheet({
  visible,
  direction,
  fromToken,
  toToken,
  amount,
  toAmount,
  walletConnected,
  walletAddress,
  onConnectWallet,
  onClose,
  onComplete,
  tokens,
  onSelectToToken,
  presetReceiveAddress,
}: MomoSheetProps) {
  const isOfframp = direction === 'offramp';
  const { sendToRampDepositAddress } = useRampDepositSend();
  const [phase, setPhase] = useState<Phase>('form');
  // A pending close (X pressed, or backdrop tapped) while `requiresCloseConfirmation`
  // is true — shows a "are you sure" step instead of closing immediately.
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [networkSheetOpen, setNetworkSheetOpen] = useState(false);
  const [recentAddresses, setRecentAddresses] = useState<string[]>([]);
  // Measured once from the first recent-address row's own rendered width —
  // every row is the same full width, so one measurement covers them all.
  const [recentRowWidth, setRecentRowWidth] = useState(0);
  const [phone, setPhone] = useState('');
  const [manualName, setManualName] = useState('');
  const [receiveAddress, setReceiveAddress] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [merchantReference, setMerchantReference] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [nameMismatchError, setNameMismatchError] = useState<string | undefined>(undefined);
  // Only meaningful for GHS offramp — the momo brand a phone number resolves
  // to can genuinely need a manual pick (see resolveGhsInstitution's doc:
  // AirtelTigo can't safely auto-resolve to one of two real Quidax codes).
  const [selectedGhsCode, setSelectedGhsCode] = useState<string | null>(null);
  // Only meaningful for NGN offramp.
  const [ngnBankCode, setNgnBankCode] = useState<string | null>(null);
  const [ngnBankPickerOpen, setNgnBankPickerOpen] = useState(false);
  const [ngnAccountNumber, setNgnAccountNumber] = useState('');
  // The name actually shown on the success screen — set immediately for
  // GHS (the momo account-name lookup already resolved it before
  // submitting), or once the backend resolves it for NGN (Quidax verifies
  // the NUBAN and hands back the real account holder name in the payout-
  // account response itself — there's no pre-flight lookup for bank
  // accounts the way there is for momo).
  const [resolvedPayoutName, setResolvedPayoutName] = useState<string | null>(null);
  // Only set for onramp's bank rail (NGN) — the real deposit account to
  // show once `confirmOnramp` returns one.
  const [bankDeposit, setBankDeposit] = useState<BankDepositInstructions | null>(null);

  const translateY = useRef(new Animated.Value(40)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Bumped whenever the sheet (re)opens or is closed, so an in-flight poll
  // loop from a previous attempt notices it's stale and stops updating
  // state instead of racing a fresh one.
  const pollGenerationRef = useRef(0);

  useEffect(() => {
    if (visible) {
      // Offramp already asks for its payout destination (the mobile money
      // number) inside the 'form' step below — only onramp needs this extra
      // step, since paying with mobile money means there's no wallet
      // guaranteed to already be connected as the receive destination. A
      // preset address (Send-to-address, opened with the destination
      // already typed) answers that same question from outside, so it
      // skips 'receive' too.
      setPhase(isOfframp || presetReceiveAddress ? 'form' : 'receive');
      setConfirmingClose(false);
      setNetworkSheetOpen(false);
      setPhone('');
      setManualName('');
      setOtp('');
      setOtpError(null);
      setMerchantReference(null);
      setStatusMessage(null);
      setFailureMessage(null);
      setNameMismatchError(undefined);
      setSelectedGhsCode(null);
      setNgnBankCode(null);
      setNgnBankPickerOpen(false);
      setNgnAccountNumber('');
      setResolvedPayoutName(null);
      setBankDeposit(null);
      pollGenerationRef.current += 1;
      // Pre-fill with the preset address (Send-to-address), or whatever's
      // already connected — one less thing to type when there's an obvious
      // right answer already; still just a starting point when it's not a
      // preset — the field stays fully editable either way.
      setReceiveAddress(presetReceiveAddress ?? (walletConnected && walletAddress ? walletAddress : ''));
      translateY.setValue(40);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 10, tension: 70 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
    // Deliberately keyed off `visible` (plus the direction/animated refs it
    // depends on) rather than `walletConnected` — the initial prefill should
    // reflect wallet state at the moment the sheet opens, not reset every
    // time the wallet connects mid-flow (see the effect below for that).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isOfframp, translateY, backdropOpacity]);

  // If the user opened this without a wallet, then connects one from inside
  // the receive step (Dynamic's own connect UI, outside this component
  // tree), fill the address in automatically — but only if the field is
  // still empty, so connecting doesn't clobber something already typed.
  useEffect(() => {
    if (phase === 'receive' && walletConnected && walletAddress && receiveAddress.trim().length === 0) {
      setReceiveAddress(walletAddress);
    }
  }, [walletConnected, walletAddress, phase, receiveAddress]);

  // Real, previously-used addresses for THIS chain only (see
  // addressHistory.ts's doc — never shown for a different chain, even one
  // that happens to share the same address format). Re-loads whenever the
  // sheet opens or the target chain changes (e.g. the user re-picks a
  // network below).
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void loadRecentAddresses(toToken.chainId).then((addresses) => {
      if (!cancelled) setRecentAddresses(addresses);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, toToken.chainId]);

  const network = detectMomoNetwork(phone);
  // Real account-name lookup (`/api/public/validate/momo`) — read-only,
  // never initiates a charge. This is tried first so a mistyped number
  // gets caught before anything is sent, but it isn't the only way
  // forward: the lookup only covers Ghana today (see useValidateMomo), and
  // even there it can fail for reasons that have nothing to do with the
  // number being wrong (the network being briefly unreachable, say) — so a
  // failed/unavailable lookup falls back to letting the user type the name
  // themselves rather than dead-ending the flow.
  const validation = useValidateMomo(phone, network);
  const resolvedName = validation.accountName ?? (manualName.trim().length > 1 ? manualName.trim() : null);
  // Real offramp settlement only ever deposits the fixed corridor asset
  // (USDC on Base — see rampCorridor.ts) — it isn't a live re-quote into
  // that asset, so this only actually works when fromToken already is it.
  const offrampCorridorEligible = !isOfframp || matchesRampCorridor(fromToken);

  // The real settlement rail for each side of this transaction, driven
  // purely by asset type/currency (see paymentRail.ts) — a crypto token
  // always settles on-chain, a fiat token settles over whichever rail is
  // real for that currency today. `toRail` is "how do you want to
  // receive" (a wallet address for crypto, a payout collection for fiat);
  // `fromRail` is "how are you paying" (nothing extra for crypto — the
  // connected wallet already holds it — a charge/deposit for fiat).
  // `fiatRail` is whichever of the two is actually the fiat leg for this
  // direction — onramp's fromToken, offramp's toToken — since that's the
  // one that ever needs a payment-method form at all.
  const toRail = getPaymentRail(toToken);
  const fromRail = getPaymentRail(fromToken);
  const fiatRail = isOfframp ? toRail : fromRail;
  const banks = useRampBanks(fiatRail?.assetType === 'fiat' ? fiatRail.currency : null);

  // Only offramp's `bank_code` field actually needs Quidax's real
  // institution code — onramp's mobile-money charge takes the brand name
  // directly (`networkProvider`), so this resolution only runs when it's
  // needed. `null` while nothing's matched (or matched exactly once and
  // auto-resolved); an ambiguous match (AirtelTigo) surfaces its real
  // candidates for the picker below instead.
  const ghsMatch =
    isOfframp && fiatRail?.method === 'momo' && network ? resolveGhsInstitution(network, banks.mobileMoney) : null;
  const ghsAmbiguousCandidates = ghsMatch && 'ambiguous' in ghsMatch ? ghsMatch.candidates : null;
  const ghsInstitutionCode = (ghsMatch && 'code' in ghsMatch ? ghsMatch.code : null) ?? selectedGhsCode;

  const ngnAccountValid = /^\d{10}$/.test(ngnAccountNumber.trim()); // NUBAN is always 10 digits
  const selectedNgnBankName = banks.banks.find((bank) => bank.code === ngnBankCode)?.name ?? null;

  const canSubmit = !offrampCorridorEligible
    ? false
    : !fiatRail
      ? false
      : fiatRail.method === 'momo'
        ? isOfframp
          ? Boolean(resolvedName) && Boolean(ghsInstitutionCode)
          : Boolean(resolvedName)
        : fiatRail.method === 'bank'
          ? isOfframp
            ? ngnAccountValid && Boolean(ngnBankCode)
            : true // onramp's bank rail: nothing to collect, just confirm — see the 'deposit' phase
          : false;
  // The lookup replaces this once it resolves a name — until then (loading,
  // failed, unavailable for this network, or nothing typed yet) typing a
  // name manually is always an option, not something unlocked only after
  // a failure.
  const showManualNameField = !validation.accountName;

  // Best-effort shape check only (same as the Send tab's destination field)
  // — good enough to catch an obviously wrong paste before this UI-only flow
  // moves on, not a guarantee the address is real or matches toToken's chain.
  const receiveAddressKind = detectDestination(receiveAddress.trim())?.kind;
  const receiveAddressValid = Boolean(receiveAddressKind && CRYPTO_ADDRESS_KINDS.has(receiveAddressKind));
  const resolvedReceiveAddress = receiveAddressValid ? receiveAddress.trim() : null;
  const canContinueReceive = Boolean(resolvedReceiveAddress);

  // One icon, two jobs depending on wallet state: already connected, it
  // pastes that address back in (handy after editing it away); not yet
  // connected, it starts the real connect flow instead.
  const handleAddressIconPress = () => {
    if (walletConnected && walletAddress) {
      setReceiveAddress(walletAddress);
    } else {
      onConnectWallet();
    }
  };

  const handlePasteAddress = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text.trim().length > 0) setReceiveAddress(text.trim());
    } catch {
      // Permission denied, or nothing on the clipboard to read — the field
      // just stays as it was, same as any other no-op paste.
    }
  };

  // Real chain-variants of the current toToken's symbol — every distinct
  // chainId this app's own live catalog actually has an entry for, never a
  // hardcoded chain list. A single-entry result still renders one row (the
  // network pill still opens to show/confirm it), it just has nothing to
  // switch to.
  const networkOptions = (() => {
    const seenChainIds = new Set<string>();
    const options: SwapToken[] = [];
    for (const token of tokens) {
      if (token.type !== 'crypto' || token.symbol !== toToken.symbol || seenChainIds.has(token.chainId)) continue;
      seenChainIds.add(token.chainId);
      options.push(token);
    }
    return options;
  })();
  const currentNetworkMeta = getChainMeta(toToken.chainId, { chainName: toToken.chainName, logoUri: toToken.logoUri });

  const handleReceiveContinue = () => {
    if (resolvedReceiveAddress) void saveRecentAddress(toToken.chainId, resolvedReceiveAddress);
    setPhase('form');
  };

  const close = () => {
    pollGenerationRef.current += 1; // stop any in-flight poll loop
    Animated.parallel([
      Animated.timing(translateY, { toValue: 40, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  // Real `/api/public/ramp/transactions/:ref` polling — same 4s interval,
  // same up-to-60-attempt cap, and the same HUB_SWAP-aware "fully settled"
  // check as frontend/apps/app's TransferContainer.tsx (`pollRampUntilSettled`
  // / `isRampFullySettled`). `generation` guards against updating state from
  // a poll loop the sheet has since moved past (closed, reopened, retried).
  // Shared between onramp and offramp — the polling/settlement logic is
  // identical either way, only the in-progress copy differs (a mobile-money
  // charge landing vs. a payout going out), so that's the only thing each
  // direction supplies.
  const pollRampUntilSettled = async (
    ref: string,
    walletAddr: string,
    generation: number,
    copy: { pending: string; distributionPending: string; defaultFailure: string },
  ) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      if (pollGenerationRef.current !== generation) return;
      try {
        const transaction = await getRampTransaction({ merchantReference: ref, walletAddress: walletAddr });
        if (pollGenerationRef.current !== generation) return;
        const status = (transaction.status ?? '').toUpperCase();
        if (status === 'FAILED' || status === 'CANCELLED') {
          // `transaction.errorMessage` is real data off an otherwise-
          // successful poll response, not something that ever passes
          // through client.ts's own error-response sanitization — has to
          // be sanitized here instead, same as everything else on screen.
          setFailureMessage(sanitizeMessage(transaction.errorMessage, copy.defaultFailure));
          setPhase('failure');
          return;
        }
        if (isRampFullySettled(transaction)) {
          setPhase('success');
          return;
        }
        setStatusMessage(
          (transaction.distributionStatus ?? '').toUpperCase() === 'PENDING' &&
            (transaction.settlementMode ?? '').toUpperCase() === 'HUB_SWAP' &&
            status === 'COMPLETED'
            ? copy.distributionPending
            : copy.pending,
        );
      } catch {
        // Keep polling through transient errors — same as the real app.
      }
    }
    if (pollGenerationRef.current !== generation) return;
    setFailureMessage('This is taking longer than usual. Check back shortly, or try again.');
    setPhase('failure');
  };

  // Bank (NGN) and mobile-money (GHS) onramp wait on completely different
  // real-world events — a wire landing vs. a phone approval clearing — so
  // sharing one hardcoded "mobile money" pending message was actively wrong
  // for the bank rail (it showed up right under the real deposit account
  // instructions, describing a charge that was never made). `railMethod`
  // picks the copy that actually matches what the rail is waiting on.
  const pollOnrampUntilSettled = (ref: string, walletAddr: string, generation: number, railMethod: 'momo' | 'bank') =>
    pollRampUntilSettled(ref, walletAddr, generation, {
      pending:
        railMethod === 'bank' ? 'Waiting for your bank transfer to arrive…' : 'Waiting for your mobile money confirmation…',
      distributionPending: `Payment received — sending ${toToken.symbol} to your wallet…`,
      defaultFailure:
        railMethod === 'bank' ? "The bank transfer couldn't be completed." : "The mobile money payment couldn't be completed.",
    });

  const pollOfframpUntilSettled = (ref: string, walletAddr: string, generation: number) =>
    pollRampUntilSettled(ref, walletAddr, generation, {
      pending: 'Waiting for your payout to confirm…',
      distributionPending: 'Payment received. Sending your payout…',
      defaultFailure: "The payout couldn't be completed.",
    });

  const handleContinue = async () => {
    if (isOfframp) {
      // canSubmit already guards all of this, but the direct call site
      // doesn't know that.
      if (!offrampCorridorEligible || !walletAddress || !fiatRail) return;

      let bankCode: string;
      let accountNumber: string;
      let customerName: string | undefined;
      let initialDisplayName: string | null;
      if (fiatRail.method === 'momo') {
        if (!ghsInstitutionCode || !resolvedName) return;
        bankCode = ghsInstitutionCode;
        accountNumber = toMomoReceiver(phone);
        customerName = resolvedName;
        initialDisplayName = resolvedName;
      } else if (fiatRail.method === 'bank') {
        if (!ngnBankCode || !ngnAccountValid) return;
        bankCode = ngnBankCode;
        accountNumber = ngnAccountNumber.trim();
        // No pre-flight name lookup for a bank account the way there is
        // for momo — Quidax verifies the NUBAN and hands back the real
        // account holder name once we actually submit it below.
        customerName = undefined;
        initialDisplayName = null;
      } else {
        return; // NGN onramp — not wired yet, canSubmit already blocks this
      }

      setPhase('awaiting');
      setStatusMessage('Starting your transfer…');
      setFailureMessage(null);
      setResolvedPayoutName(initialDisplayName);
      const generation = ++pollGenerationRef.current;
      try {
        const initiated = await initiateOfframp({
          currency: toToken.symbol.toLowerCase(),
          tokenAmount: amount.toString(),
          walletAddress,
          customerName,
        });
        if (pollGenerationRef.current !== generation) return;
        setMerchantReference(initiated.merchantReference);

        const payout = await setOfframpPayoutAccount({
          merchantReference: initiated.merchantReference,
          walletAddress,
          bankCode,
          accountNumber,
          currency: toToken.symbol.toLowerCase(),
        });
        if (pollGenerationRef.current !== generation) return;
        // Real for NGN: Quidax resolves and returns the actual account
        // holder name here. For GHS this just reaffirms what the momo
        // lookup already resolved before submitting.
        if (payout.accountName) setResolvedPayoutName(payout.accountName);

        const confirmed = await confirmOfframp({ merchantReference: initiated.merchantReference, walletAddress });
        if (pollGenerationRef.current !== generation) return;

        // The deposit address is what actually turns this into a real
        // transfer — the connected wallet signs and sends the fixed
        // corridor asset there. No address back (a settlement mode this
        // app hasn't seen) just means polling picks up wherever the
        // backend already is, same as the real app's own fallback.
        if (confirmed.depositAddress) {
          setStatusMessage('Confirm the transfer in your wallet…');
          await sendToRampDepositAddress({ depositAddress: confirmed.depositAddress, humanAmount: amount.toString() });
          if (pollGenerationRef.current !== generation) return;
          try {
            await forwardOfframpHub({ merchantReference: initiated.merchantReference, walletAddress });
          } catch {
            // Best-effort — the poll loop below retries this from the
            // backend side once the deposit is visible on-chain, same as
            // ramp.ts's own doc comment for forwardOfframpHub explains.
          }
        }

        setStatusMessage(null);
        void pollOfframpUntilSettled(initiated.merchantReference, walletAddress, generation);
      } catch (err) {
        if (pollGenerationRef.current !== generation) return;
        setFailureMessage(rampErrorMessage(err, 'Could not complete this sale. Please try again.'));
        setPhase('failure');
      }
      return;
    }

    if (!resolvedReceiveAddress || !fiatRail) return; // canSubmit already guards this
    if (fiatRail.method === 'momo' && !resolvedName) return;
    setPhase('awaiting');
    setStatusMessage(null);
    setFailureMessage(null);
    setNameMismatchError(undefined);
    const generation = ++pollGenerationRef.current;
    try {
      const initiated = await initiateOnramp({
        currency: fromToken.symbol.toLowerCase(),
        fiatAmount: amount.toString(),
        payoutWalletAddress: resolvedReceiveAddress,
        // Only meaningful for the momo rail — the bank rail (NGN) has no
        // pre-flight name lookup at all, see confirmOnramp's doc.
        customerName: resolvedName ?? undefined,
        targetChainId: toToken.chainId ? Number.parseInt(toToken.chainId, 10) : undefined,
        targetTokenSymbol: toToken.symbol,
        targetTokenAddress: toToken.address !== 'native' ? toToken.address : undefined,
        quotedToAmount: toAmount.toString(),
      });
      if (pollGenerationRef.current !== generation) return;
      setMerchantReference(initiated.merchantReference);

      if (fiatRail.method === 'bank') {
        // No user-provided payment detail for this rail — confirming is
        // what actually gets back a real account to pay into.
        const confirmed = await confirmOnramp({ merchantReference: initiated.merchantReference, walletAddress: resolvedReceiveAddress });
        if (pollGenerationRef.current !== generation) return;
        if (confirmed.bankDeposit) {
          setBankDeposit(confirmed.bankDeposit);
          setPhase('deposit');
        }
        void pollOnrampUntilSettled(initiated.merchantReference, resolvedReceiveAddress, generation, 'bank');
        return;
      }

      const momo = await startOnrampMobileMoney({
        merchantReference: initiated.merchantReference,
        walletAddress: resolvedReceiveAddress,
        phoneNumber: toMomoReceiver(phone),
        networkProvider: network ?? '',
      });
      if (pollGenerationRef.current !== generation) return;

      if (momo.requiresOtp) {
        setPhase('otp');
        return;
      }
      // Same reasoning as transaction.errorMessage above — this is raw
      // backend copy, not something that's passed through any error
      // sanitization on its way here. An empty fallback plus `|| null`
      // just means "fall back to awaitingSubtitle's own default text"
      // rather than a hardcoded string, since there's nothing in-context
      // to say instead of a leaked one.
      setStatusMessage(sanitizeMessage(momo.paymentInstructions?.awaitingPaymentMessage, '') || null);
      void pollOnrampUntilSettled(initiated.merchantReference, resolvedReceiveAddress, generation, 'momo');
    } catch (err) {
      if (pollGenerationRef.current !== generation) return;
      // Matches frontend/apps/app's TransferContainer.tsx: a name/account
      // mismatch sends the user back to fix what they typed rather than
      // treating it as a dead-end failure — everything else is fatal.
      if (rampErrorCode(err) === 'customer.name.mismatch') {
        setNameMismatchError(rampErrorMessage(err, "The name on this account doesn't match. Check the details and try again."));
        setPhase('form');
        return;
      }
      setFailureMessage(rampErrorMessage(err, 'Could not start this payment. Please try again.'));
      setPhase('failure');
    }
  };

  const handleOtpSubmit = async () => {
    if (!merchantReference || !resolvedReceiveAddress) return;
    const generation = pollGenerationRef.current;
    setOtpError(null);
    setPhase('awaiting');
    try {
      await verifyOnrampOtp({ merchantReference, walletAddress: resolvedReceiveAddress, otp: otp.trim() });
      if (pollGenerationRef.current !== generation) return;
      // OTP only ever exists on the mobile-money rail — bank onramp never
      // reaches this phase (see confirmOnramp's doc).
      void pollOnrampUntilSettled(merchantReference, resolvedReceiveAddress, generation, 'momo');
    } catch (err) {
      if (pollGenerationRef.current !== generation) return;
      setOtpError(rampErrorMessage(err, 'Could not verify that code. Please try again.'));
      setPhase('otp');
    }
  };

  const handleDone = () => {
    onComplete();
    close();
  };

  if (!visible) return null;

  const title = phase === 'receive' ? 'Where do you want to receive?' : isOfframp ? 'Offramp' : 'Onramp';
  const subtitle =
    phase === 'receive'
      ? `We'll send your ${toToken.symbol} here once the payment clears.`
      : phase === 'otp'
        ? 'Enter the code sent to your phone'
        : phase === 'deposit'
          ? `Add ${toToken.symbol} with a bank transfer`
          : isOfframp
            ? fiatRail?.method === 'bank'
              ? `Cash out ${fromToken.symbol} to your bank account`
              : `Cash out ${fromToken.symbol} to mobile money`
            : fiatRail?.method === 'momo'
              ? `Add ${toToken.symbol} with mobile money`
              : fiatRail?.method === 'bank'
                ? `Add ${toToken.symbol} with a bank transfer`
                : `Add ${toToken.symbol}`;

  // Bank (NGN) onramp's "awaiting" only ever covers `initiate` + `confirm`
  // resolving into a real deposit account (see handleContinue — it moves
  // straight to 'deposit' from there, never back to 'awaiting' for this
  // rail) — nothing has asked the user to approve a mobile money charge,
  // so that copy would be describing an event that never happens.
  const onrampAwaitingIsBank = !isOfframp && fiatRail?.method === 'bank';
  const awaitingTitle = isOfframp ? 'Awaiting Confirmation' : onrampAwaitingIsBank ? 'Preparing Your Transfer' : 'Awaiting Approval';
  const awaitingSubtitle =
    statusMessage ??
    (isOfframp
      ? 'Confirming your transfer.'
      : onrampAwaitingIsBank
        ? "Setting up your bank transfer — you'll get a real account to pay into in a moment."
        : `Approve the mobile money charge on your phone — we'll send ${toToken.symbol} to your destination once it clears.`);

  // Only a step reached by moving *forward* from an earlier, still-valid
  // step can go back — 'receive'/offramp's 'form' are the first thing the
  // user sees (nothing behind them but closing), and 'deposit'/'awaiting'/
  // 'success'/'failure' are all past the point where a backend call has
  // already fired for this attempt, so "back" would just be confusing.
  const canGoBack = (phase === 'form' && !isOfframp) || phase === 'otp';
  const handleBack = () => {
    if (phase === 'otp') {
      setPhase('form');
    } else if (phase === 'form' && !isOfframp) {
      setPhase('receive');
    }
  };

  // 'awaiting' (a charge/payout/on-chain send actually in flight) and
  // 'deposit' (a real account is on screen, waiting on the user's own bank
  // transfer) are the two steps where something real — money or an
  // approval — is genuinely expected. Closing out of either shouldn't be
  // one accidental tap away, but it also shouldn't be *impossible* the way
  // 'awaiting' used to make it (no close button at all) — a confirmation
  // covers both: still reachable, just not by mistake.
  const requiresCloseConfirmation = phase === 'awaiting' || phase === 'deposit';
  const handleCloseRequest = () => {
    if (requiresCloseConfirmation) {
      setConfirmingClose(true);
    } else {
      close();
    }
  };

  const receiveDisplay = resolvedReceiveAddress ? shortenAddress(resolvedReceiveAddress) ?? resolvedReceiveAddress : 'your wallet';
  const successTitle = isOfframp ? 'Transfer Successful' : 'Transaction Sent';
  const successSubtitle = isOfframp
    ? `${formatFinancial(amount)} ${fromToken.symbol} sent to ${resolvedPayoutName ?? 'your account'}.`
    : `${formatFinancial(toAmount)} ${toToken.symbol} sent to ${receiveDisplay}.`;

  return (
    <>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleCloseRequest} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View testID="momo-sheet" style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {canGoBack && (
              <Pressable
                testID="momo-sheet-back"
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={handleBack}
                style={styles.backButton}
                hitSlop={8}
              >
                <Text style={styles.backGlyph}>‹</Text>
              </Pressable>
            )}
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
          </View>
          <Pressable
            testID="momo-sheet-close"
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={handleCloseRequest}
            style={styles.closeButton}
            hitSlop={8}
          >
            <X size={22} color={swapColors.textMuted} />
          </Pressable>
        </View>

        {confirmingClose && (
          <View style={styles.body}>
            <View style={[styles.heroCard, styles.statusCard]}>
              <Text style={styles.statusTitle}>Cancel this transfer?</Text>
              <Text style={styles.statusSubtitle}>
                {phase === 'deposit'
                  ? "You haven't sent your bank transfer yet. Do you want to cancel?"
                  : "This operation won't stop a payment already in progress."}
              </Text>
            </View>
            <PrimaryButton
              testID="momo-cancel-keep-waiting"
              label="Keep Waiting"
              variant="primary"
              onPress={() => setConfirmingClose(false)}
            />
            <PrimaryButton
              testID="momo-cancel-confirm"
              label="Close Anyway"
              variant="warning"
              onPress={() => {
                setConfirmingClose(false);
                close();
              }}
            />
          </View>
        )}

        {!confirmingClose && phase === 'receive' && (
          <View style={styles.body}>
            {/* One container for network + address + actions — same
                treatment as the swap card's own "You will receive" block
                (a soft card, a transparent input sitting directly on it,
                nothing boxed separately inside). */}
            <View style={styles.heroCard}>
              <Pressable
                testID="momo-network-pill"
                accessibilityRole="button"
                accessibilityLabel={`Network: ${currentNetworkMeta.name}`}
                onPress={() => setNetworkSheetOpen(true)}
                style={styles.networkPill}
              >
                <Image source={{ uri: currentNetworkMeta.logoUri }} style={styles.networkPillIcon} />
                <Text style={styles.networkPillLabel}>{currentNetworkMeta.name}</Text>
                <ChevronDown size={13} color={swapColors.textMuted} />
              </Pressable>

              <TextInput
                testID="momo-receive-address-input"
                value={receiveAddress}
                onChangeText={setReceiveAddress}
                placeholder="Wallet address"
                placeholderTextColor={swapColors.textMuted}
                underlineColorAndroid="transparent"
                multiline
                style={[styles.addressBigInput, noOutlineStyle]}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Address Book and Scan aren't real features yet — Paste and
                  the connected wallet are the two that actually work today. */}
              <View style={styles.addressActionRow}>
                <Pressable
                  testID="momo-receive-paste"
                  accessibilityRole="button"
                  accessibilityLabel="Paste address"
                  onPress={handlePasteAddress}
                  style={styles.addressActionPill}
                >
                  <ClipboardPaste size={13} color={swapColors.textOnDark} />
                  <Text style={styles.addressActionLabel}>Paste</Text>
                </Pressable>
                <Pressable
                  testID="momo-receive-wallet-chip"
                  accessibilityRole="button"
                  accessibilityLabel={walletConnected ? 'Use connected wallet address' : 'Connect wallet'}
                  onPress={handleAddressIconPress}
                  style={styles.addressActionPill}
                >
                  <Wallet size={13} color={swapColors.textOnDark} />
                  <Text style={styles.addressActionLabel}>{walletConnected ? 'Connected Wallet' : 'Connect Wallet'}</Text>
                </Pressable>
              </View>
            </View>
            {walletConnected && walletAddress && (
              <Text style={styles.addressHint}>Connected wallet: {shortenAddress(walletAddress) ?? walletAddress}</Text>
            )}

            {recentAddresses.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.heroCardLabel}>Recent</Text>
                {recentAddresses.map((address) => {
                  const budget = charsForWidth(recentRowWidth, RECENT_ADDRESS_FONT_SIZE);
                  const display = recentRowWidth > 0 ? truncateMiddle(address, budget) : address;
                  return (
                    <Pressable
                      key={address}
                      testID={`momo-recent-address-${address}`}
                      accessibilityRole="button"
                      onPress={() => setReceiveAddress(address)}
                      style={styles.recentAddressRow}
                    >
                      <Text
                        testID={`momo-recent-address-text-${address}`}
                        style={styles.recentAddressText}
                        numberOfLines={1}
                        onLayout={(event) => setRecentRowWidth(event.nativeEvent.layout.width)}
                      >
                        {display}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <PrimaryButton
              testID="momo-receive-continue"
              label="Continue"
              variant="primary"
              disabled={!canContinueReceive}
              onPress={handleReceiveContinue}
            />
          </View>
        )}

        {!confirmingClose && phase === 'form' && (
          <View style={styles.body}>
            {!fiatRail ? (
              <Text testID="momo-rail-unsupported" style={styles.otpError}>
                This currency isn't supported yet.
              </Text>
            ) : fiatRail.method === 'bank' && !isOfframp ? (
              // Real NGN onramp: nothing to collect up front — the actual
              // deposit account only exists once `initiate` + `confirm`
              // both return, so this is just a plain confirmation step.
              <View style={styles.heroCard}>
                <Text style={styles.heroCardLabel}>Bank Transfer</Text>
                <Text style={styles.accountNameValue}>
                  Pay {formatFinancial(amount)} {fromToken.symbol}
                </Text>
                <Text style={styles.subtitle}>
                  We'll show you a real bank account to transfer to on the next step.
                </Text>
              </View>
            ) : fiatRail.method === 'momo' ? (
              <>
                <View style={styles.heroCard}>
                  {network ? (
                    <View style={styles.detectedNetworkRow}>
                      <View style={styles.networkLogoChip}>
                        <Image source={MOMO_NETWORK_LOGOS[network]} style={styles.networkLogo} resizeMode="contain" />
                      </View>
                      <Text style={styles.heroCardLabel}>{network}</Text>
                    </View>
                  ) : (
                    <Text style={styles.heroCardLabel}>Phone Number</Text>
                  )}
                  <TextInput
                    testID="momo-phone-input"
                    value={phone}
                    onChangeText={(text) => {
                      setPhone(formatMomoNumber(text));
                      setNameMismatchError(undefined);
                      setSelectedGhsCode(null); // a new number can resolve to a different network
                    }}
                    placeholder="024 123 4567"
                    placeholderTextColor={swapColors.textMuted}
                    keyboardType="phone-pad"
                    underlineColorAndroid="transparent"
                    style={[styles.phoneInput, noOutlineStyle]}
                  />
                </View>

                {validation.accountName && (
                  <View testID="momo-account-name" style={[styles.field, styles.accountNameField]}>
                    <Text style={styles.accountNameLabel}>Account name</Text>
                    <Text style={styles.accountNameValue}>{validation.accountName}</Text>
                  </View>
                )}

                {!isOfframp && nameMismatchError && (
                  <Text testID="momo-name-mismatch-error" style={styles.otpError}>
                    {nameMismatchError}
                  </Text>
                )}

                {/* Airtel and Tigo merged as one brand in the real world,
                    but Quidax's institution list can still carry them as
                    two separate codes — see resolveGhsInstitution's doc.
                    Only offramp needs a real institution code at all. */}
                {isOfframp && ghsAmbiguousCandidates && (
                  <View style={styles.field}>
                    <Text style={styles.heroCardLabel}>Which network?</Text>
                    <View style={styles.institutionRow}>
                      {ghsAmbiguousCandidates.map((candidate) => (
                        <Pressable
                          key={candidate.code}
                          testID={`momo-institution-${candidate.code}`}
                          accessibilityRole="button"
                          onPress={() => setSelectedGhsCode(candidate.code)}
                          style={[styles.institutionChip, selectedGhsCode === candidate.code && styles.institutionChipSelected]}
                        >
                          <Text
                            style={[
                              styles.institutionChipLabel,
                              selectedGhsCode === candidate.code && styles.institutionChipLabelSelected,
                            ]}
                          >
                            {candidate.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}

                {showManualNameField && (
                  <View style={[styles.field, styles.fieldRow]}>
                    {/* A failed/unavailable lookup fails silently — the manual
                        name field below is already the fallback, so surfacing
                        an error here would just be noise on top of it. */}
                    <TextInput
                      testID="momo-name-input"
                      value={manualName}
                      onChangeText={(text) => {
                        setManualName(text);
                        setNameMismatchError(undefined);
                      }}
                      placeholder="Full name as registered"
                      placeholderTextColor={swapColors.textMuted}
                      underlineColorAndroid="transparent"
                      editable
                      style={[styles.input, styles.nameInput, styles.nameInputFlex, noOutlineStyle]}
                      autoCapitalize="words"
                    />
                    {validation.loading && (
                      <ActivityIndicator size="small" color={swapColors.pillActive} style={styles.manualNameLoading} />
                    )}
                  </View>
                )}
              </>
            ) : (
              // fiatRail.method === 'bank' && isOfframp — real NGN offramp:
              // a bank picked from the live institution list plus the
              // NUBAN to pay out to. No name field — Quidax resolves and
              // returns the real account holder name once this submits.
              <>
                <View style={styles.field}>
                  <Pressable
                    testID="ngn-bank-select"
                    accessibilityRole="button"
                    onPress={() => setNgnBankPickerOpen((open) => !open)}
                    style={styles.input}
                  >
                    <Text style={selectedNgnBankName ? styles.accountNameValue : styles.ngnBankPlaceholder}>
                      {selectedNgnBankName ?? (banks.loading ? 'Loading banks…' : 'Select your bank')}
                    </Text>
                  </Pressable>
                  {ngnBankPickerOpen && (
                    <View testID="ngn-bank-picker" style={styles.bankPicker}>
                      <ScrollView style={styles.bankPickerScroll} showsVerticalScrollIndicator={false}>
                        {banks.banks.map((bank) => (
                          <Pressable
                            key={bank.code}
                            testID={`ngn-bank-${bank.code}`}
                            accessibilityRole="button"
                            onPress={() => {
                              setNgnBankCode(bank.code);
                              setNgnBankPickerOpen(false);
                            }}
                            style={styles.bankPickerItem}
                          >
                            <Text style={styles.bankPickerItemLabel}>{bank.name}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                <View style={styles.field}>
                  <TextInput
                    testID="ngn-account-number-input"
                    value={ngnAccountNumber}
                    onChangeText={(text) => setNgnAccountNumber(text.replace(/\D/g, '').slice(0, 10))}
                    placeholder="Account number"
                    placeholderTextColor={swapColors.textMuted}
                    keyboardType="number-pad"
                    underlineColorAndroid="transparent"
                    style={[styles.input, noOutlineStyle]}
                  />
                </View>
              </>
            )}

            {isOfframp && !offrampCorridorEligible && (
              <Text testID="momo-corridor-ineligible" style={styles.otpError}>
                Selling is only available for USDC on Base right now. Choose that token to continue.
              </Text>
            )}

            <PrimaryButton
              testID="momo-continue"
              label="Continue"
              variant="primary"
              disabled={!canSubmit}
              onPress={handleContinue}
            />
          </View>
        )}

        {!confirmingClose && phase === 'otp' && (
          <View style={styles.body}>
            <View style={styles.heroCard}>
              <Text style={styles.heroCardLabel}>One-time code</Text>
              <TextInput
                testID="momo-otp-input"
                value={otp}
                onChangeText={(text) => {
                  setOtp(text.replace(/\D/g, ''));
                  setOtpError(null);
                }}
                placeholder="1234"
                placeholderTextColor={swapColors.textMuted}
                keyboardType="number-pad"
                underlineColorAndroid="transparent"
                style={[styles.phoneInput, noOutlineStyle]}
              />
            </View>
            {otpError && (
              <Text testID="momo-otp-error" style={styles.otpError}>
                {otpError}
              </Text>
            )}
            <PrimaryButton
              testID="momo-otp-continue"
              label="Continue"
              variant="primary"
              disabled={otp.trim().length < 4}
              onPress={handleOtpSubmit}
            />
          </View>
        )}

        {!confirmingClose && phase === 'deposit' && bankDeposit && (
          <View style={styles.body}>
            <View style={styles.heroCard}>
              <Text style={styles.heroCardLabel}>Transfer to this account</Text>
              <View testID="ngn-deposit-instructions" style={styles.depositFields}>
                <View style={styles.depositField}>
                  <Text style={styles.accountNameLabel}>Amount</Text>
                  <Text style={styles.accountNameValue}>₦{formatFinancial(Number.parseFloat(bankDeposit.amount) || 0)}</Text>
                </View>
                <View style={styles.depositField}>
                  <Text style={styles.accountNameLabel}>Bank</Text>
                  <Text style={styles.accountNameValue}>{bankDeposit.bankName}</Text>
                </View>
                <View style={styles.depositField}>
                  <Text style={styles.accountNameLabel}>Account number</Text>
                  <Text style={styles.accountNameValue}>{bankDeposit.accountNumber}</Text>
                </View>
                <View style={styles.depositField}>
                  <Text style={styles.accountNameLabel}>Account name</Text>
                  <Text style={styles.accountNameValue}>{bankDeposit.accountName}</Text>
                </View>
              </View>
              {bankDeposit.expiresAt && (
                <Text style={styles.depositExpiry}>
                  Complete this transfer before {new Date(bankDeposit.expiresAt).toLocaleString()}.
                </Text>
              )}
            </View>
            <View style={styles.depositStatusRow}>
              <ActivityIndicator size="small" color={swapColors.pillActive} />
              <Text style={styles.statusSubtitle}>{statusMessage ?? 'Waiting for your transfer to confirm…'}</Text>
            </View>
          </View>
        )}

        {!confirmingClose && phase === 'awaiting' && (
          <View style={styles.body}>
            <View style={[styles.heroCard, styles.statusCard]}>
              <ActivityIndicator size="large" color={swapColors.pillActive} />
              <Text style={styles.statusTitle}>{awaitingTitle}</Text>
              <Text style={styles.statusSubtitle}>{awaitingSubtitle}</Text>
            </View>
          </View>
        )}

        {!confirmingClose && phase === 'success' && (
          <View style={styles.body}>
            <View style={[styles.heroCard, styles.statusCard]}>
              <View style={[styles.statusIcon, styles.successIcon]}>
                <Check size={24} color="#1B5E20" strokeWidth={2.5} />
              </View>
              <Text style={styles.statusTitle}>{successTitle}</Text>
              <Text style={styles.statusSubtitle}>{successSubtitle}</Text>
            </View>
            <PrimaryButton testID="momo-done" label="Done" variant="primary" onPress={handleDone} />
          </View>
        )}

        {!confirmingClose && phase === 'failure' && (
          <View style={styles.body}>
            <View style={[styles.heroCard, styles.statusCard]}>
              <View style={[styles.statusIcon, styles.failureIcon]}>
                <X size={24} color="#B3261E" strokeWidth={2.5} />
              </View>
              <Text style={styles.statusTitle}>Transfer Failed</Text>
              <Text style={styles.statusSubtitle}>
                {failureMessage ?? "We couldn't reach that network. Check the number and try again."}
              </Text>
            </View>
            <PrimaryButton testID="momo-retry" label="Try Again" variant="primary" onPress={() => setPhase('form')} />
          </View>
        )}
      </Animated.View>

      <NetworkSelectSheet
        visible={networkSheetOpen}
        options={networkOptions}
        selectedChainId={toToken.chainId}
        onClose={() => setNetworkSheetOpen(false)}
        onSelect={onSelectToToken}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Same dim as the token picker's backdrop — one consistent overlay
    // treatment across every sheet in this app, not a separate identity.
    backgroundColor: 'rgba(20,10,25,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: swapColors.subcard,
    borderTopLeftRadius: swapRadii.card,
    borderTopRightRadius: swapRadii.card,
    paddingTop: 20,
    paddingBottom: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flexShrink: 1,
  },
  headerText: {
    flexShrink: 1,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: swapColors.card,
  },
  backGlyph: {
    fontSize: 20,
    lineHeight: 20,
    color: swapColors.textPrimary,
  },
  title: {
    fontFamily: swapFonts.headingBold,
    fontSize: 20,
    color: swapColors.textPrimary,
  },
  subtitle: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.textMuted,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
  },
  // The bold "hero" card every phase shares — a big primary value (phone
  // number while filling in the form, a status message while it resolves)
  // on the same soft card surface, so the sheet reads as one consistent
  // control rather than a form screen bolted to a separate result screen.
  heroCard: {
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.subcard,
    padding: 20,
    gap: 6,
  },
  heroCardLabel: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textMuted,
  },
  detectedNetworkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  networkLogoChip: {
    width: 34,
    height: 20,
    borderRadius: 6,
    backgroundColor: swapColors.subcard,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  networkLogo: {
    width: '100%',
    height: '100%',
  },
  phoneInput: {
    fontFamily: swapFonts.numberBold,
    fontSize: 32,
    color: swapColors.textPrimary,
    padding: 0,
    margin: 0,
    borderWidth: 0,
  },
  field: {
    gap: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  manualNameLoading: {
    marginLeft: 8,
  },
  addressHint: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
    paddingHorizontal: 4,
  },
  // "Select Network" pill, matching the reference design's own network
  // affordance at the top of the receive step — display-only here (the
  // network is already fixed by the token picked on the swap card), tap
  // opens NetworkSelectSheet to confirm or re-pick a real chain-variant.
  // Nested one level inside `heroCard` now, so it steps to `subcard` for
  // contrast the same way every other nested pill in this app does.
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: swapRadii.pill,
    backgroundColor: swapColors.subcard,
  },
  networkPillIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: swapColors.card,
  },
  networkPillLabel: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textPrimary,
  },
  // Sits directly on `heroCard` with no separate pill/border of its own —
  // same treatment as the swap card's own amount fields, just wallet-address
  // sized text instead of a giant number. `multiline` (rather than a fixed
  // single-line height) lets a full-length address wrap instead of
  // clipping, since there's no separate truncated/focused display mode
  // here the way the Send tab's destination field has.
  addressBigInput: {
    fontFamily: swapFonts.label,
    fontSize: 18,
    lineHeight: 24,
    color: swapColors.textPrimary,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  // Paste / Connected Wallet — the two real actions here (Address Book and
  // Scan aren't wired to anything real yet, so they aren't offered at all
  // rather than shown disabled). Small, content-sized pills sitting inside
  // the same card as the address input, not full-width chips of their own.
  addressActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addressActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: swapRadii.pill,
    backgroundColor: swapColors.toggleTrack,
  },
  addressActionLabel: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textOnDark,
  },
  // Full-width rows (not content-sized chips) — each one's own text is
  // truncated to fill exactly this width (see RECENT_ADDRESS_FONT_SIZE /
  // truncateMiddle), so the address reads as far as it can before the
  // fixed last-4-characters tail.
  recentAddressRow: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: swapRadii.subcard,
    backgroundColor: swapColors.card,
  },
  recentAddressText: {
    fontFamily: swapFonts.label,
    fontSize: RECENT_ADDRESS_FONT_SIZE,
    color: swapColors.textPrimary,
    width: '100%',
  },
  input: {
    fontFamily: swapFonts.label,
    // 16px, not 15 — under 16px, mobile Safari auto-zooms the whole page on
    // focus (this is also a Pressable label in the bank-select trigger, not
    // just the two real TextInputs that use this style — harmless there).
    fontSize: 16,
    color: swapColors.textPrimary,
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  // The momo name field sits directly on the card, not in its own pill —
  // same treatment ReceiveDestinationCard's own manual-name field uses.
  nameInput: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  nameInputFlex: {
    flex: 1,
  },
  accountNameField: {
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.subcard,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 2,
  },
  accountNameLabel: {
    fontFamily: swapFonts.label,
    fontSize: 12,
    color: swapColors.textMuted,
  },
  accountNameValue: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 16,
    color: swapColors.textPrimary,
  },
  institutionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  institutionChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: swapRadii.pill,
    backgroundColor: swapColors.card,
  },
  institutionChipSelected: {
    backgroundColor: swapColors.pillActive,
  },
  institutionChipLabel: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textPrimary,
  },
  institutionChipLabelSelected: {
    color: swapColors.textOnDark,
  },
  ngnBankPlaceholder: {
    fontFamily: swapFonts.label,
    fontSize: 15,
    color: swapColors.textMuted,
  },
  bankPicker: {
    marginTop: 6,
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.subcard,
    paddingVertical: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  bankPickerScroll: {
    maxHeight: 220,
  },
  bankPickerItem: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  bankPickerItemLabel: {
    fontFamily: swapFonts.label,
    fontSize: 14,
    color: swapColors.textPrimary,
  },
  depositFields: {
    gap: 10,
    marginTop: 4,
  },
  depositField: {
    gap: 2,
  },
  depositExpiry: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
    marginTop: 10,
  },
  depositStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  otpError: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: '#B3261E',
    paddingHorizontal: 4,
  },
  statusCard: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 28,
  },
  statusIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successIcon: {
    backgroundColor: '#E3F2E5',
  },
  failureIcon: {
    backgroundColor: '#FDE8E8',
  },
  statusTitle: {
    fontFamily: swapFonts.headingBold,
    fontSize: 18,
    color: swapColors.textPrimary,
    marginTop: 4,
  },
  statusSubtitle: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.textMuted,
    textAlign: 'center',
  },
});
