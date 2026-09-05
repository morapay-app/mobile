import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { swapColors, swapFonts, swapRadii } from '../swap/theme';
import { PrimaryButton } from '../swap/components/PrimaryButton';
import { PayScreenSkeleton } from './components/PayScreenSkeleton';
import { useWallet } from '../../dynamic/useWallet';
import { useWalletConnectActions } from '../../dynamic/useWalletConnectActions';
import { useTokenTransfer } from '../swap/useTokenTransfer';
import { confirmCryptoPayment } from '../../api/payRequest';
import type { RootStackParamList } from '../../navigation/types';
import { usePayRequest } from './usePayRequest';

type PayScreenRouteProp = RouteProp<RootStackParamList, 'Pay'>;
type PayScreenNavigation = NativeStackNavigationProp<RootStackParamList, 'Pay'>;

function formatDisplayAmount(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

/**
 * The payer's side of a payment request — reached via
 * `morapay://pay/request/:linkId` (see `navigation/linking.ts`), never via
 * the real `payLink`'s web URL, since that web page doesn't exist yet (see
 * `api/payRequest.ts`'s doc). Crypto-only: a request whose real `calldata`
 * doesn't resolve to an `evm_erc20_transfer` instruction (fiat-only, or a
 * non-EVM chain) shows an honest "can't be completed in-app yet" state
 * rather than a half-built flow — see `usePayRequest`'s own doc for why
 * that's decided from the real backend response, not guessed ahead of time.
 */
export function PayScreen() {
  const route = useRoute<PayScreenRouteProp>();
  const navigation = useNavigation<PayScreenNavigation>();
  const { linkId, transactionId } = route.params;
  const state = usePayRequest(linkId, transactionId);

  const wallet = useWallet();
  const walletConnectActions = useWalletConnectActions();
  const tokenTransfer = useTokenTransfer();

  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [paidMessage, setPaidMessage] = useState<string | null>(null);

  // Best-effort, silent chain switch once there's a real instruction to pay
  // — same semantics SwapScreen.tsx already relies on for its own sends
  // (see useWalletConnectActions.switchToChain's own doc).
  useEffect(() => {
    if (state.status !== 'ready' || !wallet.connected) return;
    void walletConnectActions.switchToChain(String(state.instruction.chainId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status === 'ready' ? state.instruction.chainId : null, wallet.connected]);

  const goHome = () => navigation.navigate('Swap');

  const handlePay = async () => {
    if (!wallet.connected) {
      walletConnectActions.connect();
      return;
    }
    if (state.status !== 'ready') return;
    const { instruction, transactionId: readyTransactionId } = state;

    setPayError(null);
    setPaying(true);
    let hash: string;
    try {
      hash = await tokenTransfer.transfer({
        token: { chainId: String(instruction.chainId), address: instruction.tokenAddress, decimals: instruction.decimals },
        toAddress: instruction.toAddress,
        amount: instruction.amount,
      });
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Could not send this payment. Please try again.');
      setPaying(false);
      return;
    }

    setTxHash(hash);
    setPaying(false);
    setConfirming(true);
    try {
      const result = await confirmCryptoPayment(readyTransactionId, hash);
      setPaidMessage(result.message);
      setPaid(true);
    } catch (err) {
      // The transfer already happened on-chain at this point — this is not
      // "try again from scratch," it's "we sent it but couldn't confirm."
      setPayError(
        `Your payment was sent (${hash.slice(0, 10)}…) but we couldn't confirm it just now. ` +
          (err instanceof Error ? err.message : 'Please try again in a moment.'),
      );
    } finally {
      setConfirming(false);
    }
  };

  if (state.status === 'loading') {
    return (
      <SafeAreaView style={styles.hero}>
        <PayScreenSkeleton />
      </SafeAreaView>
    );
  }

  if (state.status === 'not-found') {
    return (
      <SafeAreaView style={styles.hero}>
        <View style={styles.card}>
          <Text style={styles.title}>Payment link not found</Text>
          <Text style={styles.body}>This payment link isn't valid or has expired.</Text>
          <PrimaryButton testID="pay-go-home" label="Open Morapay" onPress={goHome} />
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'error') {
    return (
      <SafeAreaView style={styles.hero}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text testID="pay-error" style={styles.body}>
            {state.message}
          </Text>
          <PrimaryButton testID="pay-go-home" label="Open Morapay" onPress={goHome} />
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'already-completed' || paid) {
    return (
      <SafeAreaView style={styles.hero}>
        <View style={[styles.card, styles.successCard]}>
          <Text style={[styles.title, styles.successText]}>{paid ? 'Payment sent' : 'Already paid'}</Text>
          <Text testID="pay-success" style={[styles.body, styles.successText]}>
            {paid ? (paidMessage ?? 'Your payment was confirmed.') : 'This request has already been paid.'}
          </Text>
          <PrimaryButton testID="pay-go-home" label="Open Morapay" onPress={goHome} />
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === 'unsupported') {
    return (
      <SafeAreaView style={styles.hero}>
        <View style={styles.card}>
          <Text style={styles.title}>Can't pay this in-app yet</Text>
          <Text testID="pay-unsupported" style={styles.warning}>
            {state.reason}
          </Text>
          <PrimaryButton testID="pay-go-home" label="Open Morapay" onPress={goHome} />
        </View>
      </SafeAreaView>
    );
  }

  // state.status === 'ready'
  const { instruction, request } = state;
  // `receiveSummary` and `claim` aren't present in the deployed by-link
  // response today (see api/payRequest.ts's doc) — `transaction.toIdentifierHint`
  // is the one recipient field actually verified live, so it's the real
  // fallback. Deliberately never the raw identifier (Core's own
  // `serializePublicRequestByLink` doesn't send one at all any more, and
  // this screen shouldn't reach for `request.claim?.toIdentifier` as a
  // workaround either — this endpoint has no auth guard, so a real
  // email/phone here would be visible to anyone who opens the link, not
  // just the payer it's meant for).
  const recipientLabel =
    request.transaction.receiveSummary ??
    (request.transaction.toIdentifierHint ? `To ${request.transaction.toIdentifierHint}` : null);
  const busy = paying || confirming;
  const buttonLabel = !wallet.connected
    ? 'Connect wallet to pay'
    : confirming
      ? 'Confirming payment…'
      : `Pay ${formatDisplayAmount(instruction.amount)} ${instruction.token}`;

  return (
    <SafeAreaView style={styles.hero}>
      <View style={styles.card}>
        <Text style={styles.label}>Payment request</Text>
        <Text style={styles.amount}>
          {formatDisplayAmount(instruction.amount)} {instruction.token}
        </Text>
        {recipientLabel && <Text style={styles.body}>{recipientLabel}</Text>}

        {payError && (
          <Text testID="pay-error" style={styles.warning}>
            {payError}
          </Text>
        )}

        <PrimaryButton testID="pay-cta" label={buttonLabel} loading={busy} onPress={handlePay} />

        {!busy && (
          <Pressable testID="pay-go-home-link" onPress={goHome} style={styles.linkButton}>
            <Text style={styles.linkText}>Not now</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    backgroundColor: swapColors.hero,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.card,
    padding: 28,
    gap: 12,
    alignItems: 'center',
  },
  successCard: {
    backgroundColor: swapColors.successBg,
  },
  title: {
    fontFamily: swapFonts.headingBold,
    fontSize: 20,
    color: swapColors.textPrimary,
    textAlign: 'center',
  },
  successText: {
    color: swapColors.successCard,
  },
  label: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textMuted,
  },
  amount: {
    fontFamily: swapFonts.numberBold,
    fontSize: 32,
    color: swapColors.textPrimary,
  },
  body: {
    fontFamily: swapFonts.body,
    fontSize: 14,
    color: swapColors.textMuted,
    textAlign: 'center',
  },
  hint: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
    textAlign: 'center',
  },
  warning: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.warningText,
    textAlign: 'center',
  },
  linkButton: {
    paddingVertical: 8,
  },
  linkText: {
    fontFamily: swapFonts.label,
    fontSize: 14,
    color: swapColors.textMuted,
  },
});
