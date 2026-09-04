import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, IdCard } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';
import { noOutlineStyle } from '../webNoOutline';
import { CountrySelect } from './CountrySelect';
import { CountrySelectSheet } from './CountrySelectSheet';
import { SheetShell } from './SheetShell';
import { describePhoneForCountry, detectDestination, toE164Phone } from '../destinationDetect';
import { useDebouncedValue } from '../useDebouncedValue';

export type DeliveryChannel = 'email' | 'phone';

export type PaymentRequestDeliverySheetProps = {
  visible: boolean;
  onClose: () => void;
  amountLabel: string;
  submitting: boolean;
  error: string | null;
  /** `skipNotify: true` still submits a real payer contact (the backend
   * requires one either way); it just tells Core not to message them. */
  onSubmit: (payerContact: string, channel: DeliveryChannel, skipNotify: boolean, requesterIdentifier: string) => void;
};

/**
 * The requester never fills in the payer's amount or account (see
 * ReceiveDestinationCard's own doc for that split). This sheet collects
 * both contacts needed to actually file the request: the requester's own
 * (`toIdentifier`) and the payer's (`payerEmail`/`payerPhone`) — opened only
 * after the requester finishes the amount and payout destination on the
 * main Receive card.
 *
 * "Skip notification" still submits a real payer contact (Core requires
 * one), it just sets `skipPaymentRequestNotification` so nothing gets sent
 * automatically — see payment-request-create.service.ts.
 */
export function PaymentRequestDeliverySheet({
  visible,
  onClose,
  amountLabel,
  submitting,
  error,
  onSubmit,
}: PaymentRequestDeliverySheetProps) {
  const [requesterIdentifier, setRequesterIdentifier] = useState('');
  const [contact, setContact] = useState('');
  const [countryOverride, setCountryOverride] = useState<string | null>(null);
  const [countrySheetOpen, setCountrySheetOpen] = useState(false);
  const [skipNotify, setSkipNotify] = useState(false);

  const detected = detectDestination(contact);
  const isPhone = detected?.kind === 'phone';
  // Same "wait for it to settle" reasoning as SwapScreen's own destination
  // field — see useDebouncedValue's doc there.
  const showCountrySelect = useDebouncedValue(isPhone, 350);
  const isEmail = detected?.kind === 'email';
  const isRecognized = isPhone || isEmail;
  const hasRequester = requesterIdentifier.trim().length > 0;
  const canContinue = isRecognized && hasRequester;
  const contactLabel = isPhone && countryOverride ? describePhoneForCountry(contact, countryOverride) : detected?.label;

  const handleContactChange = (text: string) => {
    setContact(text);
    if (text.length === 0) setCountryOverride(null);
  };

  const handleContinue = () => {
    if (!canContinue) return;
    const value = isPhone ? toE164Phone(contact, countryOverride ?? detected.countryCode) : contact.trim();
    onSubmit(value, isEmail ? 'email' : 'phone', skipNotify, requesterIdentifier.trim());
  };

  return (
    <>
      <SheetShell visible={visible} onClose={onClose} testID="payment-request-delivery-sheet" title="Request details" subtitle={amountLabel}>
        <View style={styles.body}>
          <Text style={styles.fieldLabel}>Your contact</Text>
          <View style={[styles.row, styles.inputRow]}>
            <IdCard size={16} color={swapColors.textMuted} />
            <TextInput
              testID="requester-identifier-input"
              value={requesterIdentifier}
              onChangeText={setRequesterIdentifier}
              placeholder="Your phone or email"
              placeholderTextColor={swapColors.textMuted}
              underlineColorAndroid="transparent"
              style={[styles.inputBare, styles.rowInput, noOutlineStyle]}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={styles.fieldLabel}>Their contact</Text>
          <View style={[styles.row, styles.inputRow]}>
            <IdCard size={16} color={swapColors.textMuted} />
            {showCountrySelect && isPhone && (
              <CountrySelect countryCode={countryOverride ?? detected.countryCode ?? null} onPress={() => setCountrySheetOpen(true)} />
            )}
            <TextInput
              testID="delivery-contact-input"
              value={contact}
              onChangeText={handleContactChange}
              placeholder="Their phone or email"
              placeholderTextColor={swapColors.textMuted}
              keyboardType={isPhone ? 'phone-pad' : 'default'}
              underlineColorAndroid="transparent"
              style={[styles.inputBare, styles.rowInput, noOutlineStyle]}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {contactLabel && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{contactLabel}</Text>
            </View>
          )}

          <Pressable
            testID="delivery-skip-notify-toggle"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: skipNotify }}
            onPress={() => setSkipNotify((value) => !value)}
            style={styles.skipRow}
          >
            <View style={[styles.checkbox, skipNotify && styles.checkboxChecked]}>
              {skipNotify && <Check size={13} color={swapColors.buttonPrimaryText} strokeWidth={3} />}
            </View>
            <Text style={styles.skipText}>Skip notification, share manually</Text>
          </Pressable>

          {error && (
            <Text testID="delivery-error" style={styles.error}>
              {error}
            </Text>
          )}

          <Pressable
            testID="delivery-continue"
            accessibilityRole="button"
            accessibilityLabel={submitting ? 'Creating request' : 'Continue'}
            disabled={!canContinue || submitting}
            onPress={handleContinue}
            style={[styles.continueButton, (!canContinue || submitting) && styles.continueButtonDisabled]}
          >
            <Text style={styles.continueText}>{submitting ? 'Creating…' : 'Continue'}</Text>
          </Pressable>
        </View>
      </SheetShell>

      {/* Sibling of SheetShell, not nested in its children: that container
          clips absolutely-positioned content to its own bounds. */}
      <CountrySelectSheet
        visible={countrySheetOpen}
        countryCode={countryOverride ?? detected?.countryCode ?? '233'}
        onSelect={(code) => {
          setCountryOverride(code);
          setCountrySheetOpen(false);
        }}
        onClose={() => setCountrySheetOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
  },
  fieldLabel: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textMuted,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // The pill itself carries the background/padding now that there's a
  // leading icon inside it — the input just sits transparently alongside
  // the icon, same "one continuous field" treatment as PayLinkSheet's link
  // pill.
  inputRow: {
    backgroundColor: swapColors.subcard,
    borderRadius: swapRadii.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputBare: {
    fontFamily: swapFonts.body,
    // 16px, not 15 — under 16px, mobile Safari auto-zooms the whole page on
    // focus.
    fontSize: 16,
    color: swapColors.textPrimary,
    backgroundColor: 'transparent',
    padding: 0,
  },
  rowInput: {
    flex: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: swapFonts.label,
    fontSize: 12,
    color: swapColors.textMuted,
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: swapColors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: swapColors.buttonPrimaryBg,
    borderColor: swapColors.buttonPrimaryBg,
  },
  skipText: {
    flex: 1,
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.textMuted,
  },
  error: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.warningText,
  },
  continueButton: {
    marginTop: 4,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: swapRadii.pill,
    backgroundColor: swapColors.buttonPrimaryBg,
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueText: {
    fontFamily: swapFonts.label,
    fontSize: 15,
    color: swapColors.buttonPrimaryText,
  },
});
