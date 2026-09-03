import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Check, Copy, Download } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';
import { SheetShell } from './SheetShell';

export type PayLinkSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The real pay link `POST /api/public/requests` returned — this sheet
   * never generates or guesses a link of its own. */
  payLink: string;
  /** e.g. "Payment link · AB12CD" — the request's own code, so the person
   * scanning/opening it can be told apart from a different request later. */
  label: string;
  /** e.g. "10.00 USDC on Base" — what this request is actually for. */
  amountLabel: string;
  onCopy: () => void;
  copied: boolean;
};

/**
 * QR + link for a real payment-request — the same pattern
 * frontend/apps/app's own `PaymentLinkShareModal.tsx` uses (a QR code, the
 * link, a copy action), rebuilt on `SheetShell` instead of a web `Dialog`
 * since this is React Native. Only ever shown for a link the backend
 * actually generated (`POST /api/public/requests`'s real `payLink`) — never
 * for the Send-to-contact flow, which has no comparable link: Core notifies
 * that recipient directly and hands the sender back nothing to share (see
 * `useContactSend`'s doc).
 *
 * The download action hands the link to the OS share sheet (`Share`, a
 * built-in RN API) — there's no file to actually download, so this is the
 * real equivalent: save it, send it, whatever the platform's share sheet
 * offers.
 */
export function PayLinkSheet({ visible, onClose, payLink, label, amountLabel, onCopy, copied }: PayLinkSheetProps) {
  const handleDownload = () => {
    if (!payLink) return;
    Share.share({ message: payLink, url: payLink }).catch(() => {});
  };

  return (
    <SheetShell visible={visible} onClose={onClose} testID="pay-link-sheet" title="Payment Request" subtitle={amountLabel} centerHeader>
      <View style={styles.body}>
        <View style={styles.qrCard}>
          {payLink ? <QRCode value={payLink} size={200} backgroundColor={swapColors.card} color={swapColors.textPrimary} /> : null}
        </View>

        <Text style={styles.label}>{label}</Text>

        <View style={styles.linkPill}>
          <TextInput testID="pay-link-sheet-input" value={payLink} editable={false} numberOfLines={1} style={styles.linkInput} />
          <Pressable
            testID="pay-link-sheet-copy"
            accessibilityRole="button"
            accessibilityLabel={copied ? 'Link copied' : 'Copy payment link'}
            onPress={onCopy}
            style={styles.iconButton}
          >
            {copied ? <Check size={17} color={swapColors.textOnDark} /> : <Copy size={17} color={swapColors.textOnDark} />}
          </Pressable>
          <Pressable
            testID="pay-link-sheet-download"
            accessibilityRole="button"
            accessibilityLabel="Share payment link"
            onPress={handleDownload}
            style={styles.iconButton}
          >
            <Download size={17} color={swapColors.textOnDark} />
          </Pressable>
        </View>
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    alignItems: 'center',
    gap: 12,
  },
  qrCard: {
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.subcard,
    padding: 20,
  },
  label: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textMuted,
  },
  // The pill itself carries the rounding and the black fill — the input
  // inside stays square and transparent so it reads as one continuous bar
  // rather than a field nested inside another rounded container.
  linkPill: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: swapColors.toggleTrack,
    borderRadius: swapRadii.pill,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 4,
  },
  linkInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.textOnDark,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
