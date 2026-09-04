import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { swapColors, swapFonts, swapRadii } from '../swap/theme';
import { PrimaryButton } from '../swap/components/PrimaryButton';
import { SwapCardSkeleton } from '../swap/components/SwapCardSkeleton';
import { useWallet } from '../../dynamic/useWallet';
import { useWalletConnectActions } from '../../dynamic/useWalletConnectActions';
import type { RootStackParamList } from '../../navigation/types';
import { useClaimRedeem } from './useClaimRedeem';

type ClaimScreenRouteProp = RouteProp<RootStackParamList, 'Claim'>;
type ClaimScreenNavigation = NativeStackNavigationProp<RootStackParamList, 'Claim'>;

/**
 * The RECEIVER's side of a claim — someone with an email or phone number
 * redeeming money sent to them, reached via `morapay://claim/:claimLinkId`
 * (see `navigation/linking.ts`). Walks Core's real, required sequence (see
 * `api/claims.ts`'s doc): confirm you're the recipient → verify an OTP sent
 * to your own contact → enter the claim code the SENDER was given to relay
 * to you → pick where the payout goes.
 *
 * Payout is crypto-to-wallet only for now. Every claim's real
 * `claim_crypto_allowed`/`claim_fiat_allowed` flags come back from
 * `unlocked` — when a claim can only pay out in fiat (crypto not allowed),
 * this shows an honest "can't be completed in-app yet" state rather than a
 * half-built bank/mobile-money payout form, same pattern `PayScreen.tsx`
 * uses for a request it can't pay in-app either.
 */
export function ClaimScreen() {
  const route = useRoute<ClaimScreenRouteProp>();
  const navigation = useNavigation<ClaimScreenNavigation>();
  const { claimLinkId } = route.params;
  const { state, submitRecipient, submitOtp, submitClaimCode, submitCryptoPayout } = useClaimRedeem(claimLinkId);

  const wallet = useWallet();
  const walletConnectActions = useWalletConnectActions();

  const [recipientInput, setRecipientInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [payoutTarget, setPayoutTarget] = useState('');

  const goHome = () => navigation.navigate('Swap');

  if (state.step === 'loading') {
    return (
      <SafeAreaView style={styles.hero}>
        <SwapCardSkeleton />
      </SafeAreaView>
    );
  }

  if (state.step === 'not-found') {
    return (
      <SafeAreaView style={styles.hero}>
        <View style={styles.card}>
          <Text style={styles.title}>Claim link not found</Text>
          <Text style={styles.body}>This claim link isn't valid or has already been redeemed.</Text>
          <PrimaryButton testID="claim-go-home" label="Open Morapay" onPress={goHome} />
        </View>
      </SafeAreaView>
    );
  }

  if (state.step === 'error') {
    return (
      <SafeAreaView style={styles.hero}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text testID="claim-error" style={styles.body}>
            {state.message}
          </Text>
          <PrimaryButton testID="claim-go-home" label="Open Morapay" onPress={goHome} />
        </View>
      </SafeAreaView>
    );
  }

  if (state.step === 'success') {
    return (
      <SafeAreaView style={styles.hero}>
        <View style={[styles.card, styles.successCard]}>
          <Text style={[styles.title, styles.successText]}>Claimed</Text>
          <Text testID="claim-success" style={[styles.body, styles.successText]}>
            {state.message}
          </Text>
          <PrimaryButton testID="claim-go-home" label="Open Morapay" onPress={goHome} />
        </View>
      </SafeAreaView>
    );
  }

  if (state.step === 'recipient') {
    return (
      <SafeAreaView style={styles.hero}>
        <View style={styles.card}>
          <Text style={styles.title}>Claim your money</Text>
          <Text style={styles.body}>Sent to {state.link.recipient_hint}. Enter your full email or phone number to continue.</Text>
          <TextInput
            testID="claim-recipient-input"
            value={recipientInput}
            onChangeText={setRecipientInput}
            placeholder="Email or phone number"
            placeholderTextColor={swapColors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          {state.error && (
            <Text testID="claim-recipient-error" style={styles.warning}>
              {state.error}
            </Text>
          )}
          <PrimaryButton
            testID="claim-recipient-continue"
            label="Continue"
            loading={state.busy}
            disabled={recipientInput.trim().length < 3}
            onPress={() => submitRecipient(recipientInput.trim())}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (state.step === 'otp') {
    return (
      <SafeAreaView style={styles.hero}>
        <View style={styles.card}>
          <Text style={styles.title}>Enter your code</Text>
          <Text style={styles.body}>We sent a one-time code to {state.recipient}.</Text>
          <TextInput
            testID="claim-otp-input"
            value={otpInput}
            onChangeText={(text) => setOtpInput(text.replace(/\D/g, ''))}
            placeholder="1234"
            placeholderTextColor={swapColors.textMuted}
            keyboardType="number-pad"
            style={styles.input}
          />
          {state.error && (
            <Text testID="claim-otp-error" style={styles.warning}>
              {state.error}
            </Text>
          )}
          <PrimaryButton
            testID="claim-otp-continue"
            label="Continue"
            loading={state.busy}
            disabled={otpInput.trim().length < 4}
            onPress={() => submitOtp(otpInput.trim())}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (state.step === 'claim-code') {
    return (
      <SafeAreaView style={styles.hero}>
        <View style={styles.card}>
          <Text style={styles.title}>Enter the claim code</Text>
          <Text style={styles.body}>Ask whoever sent you this money for the 6-character claim code they received.</Text>
          <TextInput
            testID="claim-code-input"
            value={codeInput}
            onChangeText={(text) => setCodeInput(text.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            placeholderTextColor={swapColors.textMuted}
            autoCapitalize="characters"
            style={styles.input}
          />
          {state.error && (
            <Text testID="claim-code-error" style={styles.warning}>
              {state.error}
            </Text>
          )}
          <PrimaryButton
            testID="claim-code-continue"
            label="Continue"
            loading={state.busy}
            disabled={codeInput.trim().length !== 6}
            onPress={() => submitClaimCode(codeInput.trim())}
          />
        </View>
      </SafeAreaView>
    );
  }

  // state.step === 'payout'
  const { claim } = state;
  if (!claim.claim_crypto_allowed) {
    return (
      <SafeAreaView style={styles.hero}>
        <View style={styles.card}>
          <Text style={styles.title}>Can't pay this out in-app yet</Text>
          <Text testID="claim-unsupported" style={styles.warning}>
            This claim can only be redeemed to a bank account or mobile money — that isn't supported in the app yet.
            Please contact support to complete it.
          </Text>
          <PrimaryButton testID="claim-go-home" label="Open Morapay" onPress={goHome} />
        </View>
      </SafeAreaView>
    );
  }

  const effectiveTarget = payoutTarget.trim() || wallet.address || '';
  const hasValidTarget = effectiveTarget.startsWith('0x') && effectiveTarget.length === 42;
  // Nothing typed and no wallet connected — the button's own press should
  // open Connect Wallet rather than sitting there disabled with no way
  // forward. Once either a wallet is connected or something's typed, it's
  // back to a normal redeem/disabled-until-valid button.
  const promptsConnect = !wallet.connected && !payoutTarget.trim();
  const busy = state.busy;

  const handlePayoutPress = () => {
    if (promptsConnect) {
      walletConnectActions.connect();
      return;
    }
    submitCryptoPayout(effectiveTarget);
  };

  return (
    <SafeAreaView style={styles.hero}>
      <View style={styles.card}>
        <Text style={styles.label}>You're claiming</Text>
        <Text style={styles.amount}>
          {claim.value} {claim.token}
        </Text>
        <Text style={styles.body}>Sent: {claim.sent_summary}</Text>

        <TextInput
          testID="claim-payout-target-input"
          value={payoutTarget}
          onChangeText={setPayoutTarget}
          placeholder={wallet.address ?? '0x… destination wallet address'}
          placeholderTextColor={swapColors.textMuted}
          autoCapitalize="none"
          style={styles.input}
        />

        {state.error && (
          <Text testID="claim-payout-error" style={styles.warning}>
            {state.error}
          </Text>
        )}

        <PrimaryButton
          testID="claim-payout-submit"
          label={busy ? 'Sending…' : 'Redeem to wallet'}
          loading={busy}
          disabled={!promptsConnect && !hasValidTarget}
          onPress={handlePayoutPress}
        />
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
  warning: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.warningText,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    fontFamily: swapFonts.body,
    fontSize: 16,
    color: swapColors.textPrimary,
    backgroundColor: swapColors.subcard,
    borderRadius: swapRadii.subcard,
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlign: 'center',
  },
});
