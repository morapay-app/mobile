import { StyleSheet, Text, View } from 'react-native';

import { swapColors, swapFonts } from '../theme';
import { PrimaryButton } from './PrimaryButton';
import { SheetShell } from './SheetShell';

export type ContactSendResultSheetProps = {
  visible: boolean;
  onClose: () => void;
  kind: 'email' | 'phone';
  destination: string;
  /** Whether Core's custodial-notify step actually ran — `false` means the
   * money moved but nothing claimable exists yet (see useContactSend's own
   * doc for why this is never framed as a failed send). */
  notified: boolean;
  /** Whether the on-chain deposit is confirmed yet. `false` doesn't mean
   * anything failed — just that Core hasn't verified it on-chain in this
   * request; worth a note since a retry there can lag briefly behind the
   * real transfer. */
  confirmed: boolean;
};

/**
 * Shown right after a send-to-contact completes, in place of a plain inline
 * success line — this is genuinely a distinct moment (money has left the
 * wallet and gone into custody) worth its own confirmation, not just a
 * caption.
 *
 * Deliberately doesn't show the literal claim code: Core never returns it to
 * the client (`POST /api/public/app-transfer/custodial-notify` only ever
 * replies `{ notified: true }` — see `api/appTransfer.ts`), it only ever
 * sends it directly to the recipient. Confirmed live in Core
 * (`custodial-send-notify.service.ts`): both an EMAIL and a PHONE recipient
 * now get the claim code + OTP + link automatically — email via
 * `sendClaimNotification`'s EMAIL channel, phone via its SMS channel. Was a
 * real gap (phone got nothing) until Core added the SMS branch; this sheet's
 * copy no longer needs to special-case phone.
 */
export function ContactSendResultSheet({ visible, onClose, kind, destination, notified, confirmed }: ContactSendResultSheetProps) {
  const body = !notified
    ? `Sent, but we couldn't ${kind === 'email' ? 'email' : 'text'} the claim details. Contact support to resend them.`
    : kind === 'email'
      ? `We emailed ${destination} their claim code.`
      : `We texted ${destination} their claim code.`;

  return (
    <SheetShell visible={visible} onClose={onClose} title="Sent" testID="contact-send-result-sheet" centerHeader>
      <View style={styles.body}>
        <Text testID="contact-send-result-message" style={styles.message}>
          {body}
        </Text>
        {!confirmed && (
          <Text testID="contact-send-result-confirming" style={styles.note}>
            We're still confirming your on-chain deposit — this can take a minute.
          </Text>
        )}
        <PrimaryButton testID="contact-send-result-done" label="Done" onPress={onClose} />
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    gap: 16,
    alignItems: 'center',
  },
  message: {
    fontFamily: swapFonts.body,
    fontSize: 14,
    color: swapColors.textPrimary,
    textAlign: 'center',
  },
  note: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
    textAlign: 'center',
  },
});
