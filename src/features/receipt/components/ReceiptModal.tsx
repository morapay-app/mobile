import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Download, Share2, X } from 'lucide-react-native';

import { swapFonts, swapRadii } from '../../swap/theme';
import { useSheetThemeColor } from '../../../theme';
import { PerforatedTicket } from './PerforatedTicket';
import { ShareFallbackSheet } from './ShareFallbackSheet';
import { captureReceipt, downloadReceipt, shareReceipt } from '../exportReceipt';
import { colorwayFor, shareCaptionFor } from '../receiptStatements';
import type { ReceiptData } from '../types';

export type ReceiptModalProps = {
  visible: boolean;
  data: ReceiptData | null;
  onClose: () => void;
};

/**
 * Full-screen shareable receipt — deliberately NOT RN's `<Modal>` (same
 * reason every other overlay in this app avoids it: Modal renders into a
 * separate native surface where `expo-font` faces silently fall back to
 * the system font, see SheetShell's doc). A plain full-screen, absolutely-
 * positioned `View` in the normal tree sidesteps that.
 *
 * The ticket's own colorway becomes this screen's system status-bar color
 * while it's open (`useSheetThemeColor`) — same edge-to-edge treatment
 * every bottom sheet in this app already gets, applied here too since this
 * is just as much a full-bleed dark overlay as any of them.
 */
export function ReceiptModal({ visible, data, onClose }: ReceiptModalProps) {
  const ticketRef = useRef<View>(null);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const colorway = data ? colorwayFor(data.type) : null;
  useSheetThemeColor(visible, colorway?.bg ?? '#000000');

  if (!visible || !data || !colorway) return null;

  const caption = shareCaptionFor(data);

  const handleDownload = async () => {
    setCaptureError(null);
    setBusy('download');
    try {
      const uri = await captureReceipt(ticketRef);
      await downloadReceipt(uri);
    } catch {
      setCaptureError("Couldn't save the image. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    setCaptureError(null);
    setBusy('share');
    try {
      const uri = await captureReceipt(ticketRef);
      const result = await shareReceipt(uri, caption);
      if (result === 'unsupported') setFallbackOpen(true);
    } catch {
      setCaptureError("Couldn't share the receipt. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.overlay, { backgroundColor: colorway.bg }]}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable testID="receipt-modal-close" accessibilityRole="button" accessibilityLabel="Close" style={styles.iconButton} onPress={onClose}>
            <X size={20} color={colorway.textPrimary} />
          </Pressable>
          <Text style={[styles.headerBadge, { color: colorway.textMuted }]} numberOfLines={1}>
            MORAPAY SECURE // RECEIPT #{data.id}
          </Text>
          <Pressable
            testID="receipt-modal-quick-share"
            accessibilityRole="button"
            accessibilityLabel="Share receipt"
            style={styles.iconButton}
            onPress={handleShare}
          >
            <Share2 size={18} color={colorway.textPrimary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* `collapsable={false}` — without it, Android's view flattening
              optimization can drop this View from the native tree entirely
              since it has no styling/interaction of its own, leaving
              `captureRef` nothing real to find. */}
          <View ref={ticketRef} collapsable={false}>
            <PerforatedTicket data={data} colorway={colorway} />
          </View>
        </ScrollView>

        {captureError && (
          <Text testID="receipt-modal-error" style={styles.errorText}>
            {captureError}
          </Text>
        )}

        <View style={styles.dock}>
          <Pressable
            testID="receipt-modal-download"
            accessibilityRole="button"
            accessibilityLabel="Save image"
            style={[styles.dockButton, styles.dockButtonGhost, { borderColor: colorway.accent }]}
            disabled={busy !== null}
            onPress={handleDownload}
          >
            {busy === 'download' ? (
              <ActivityIndicator size="small" color={colorway.textPrimary} />
            ) : (
              <Download size={16} color={colorway.textPrimary} />
            )}
            <Text style={[styles.dockButtonText, { color: colorway.textPrimary }]}>Save Image</Text>
          </Pressable>

          <Pressable
            testID="receipt-modal-share"
            accessibilityRole="button"
            accessibilityLabel="Share receipt"
            style={[styles.dockButton, { backgroundColor: colorway.accent }]}
            disabled={busy !== null}
            onPress={handleShare}
          >
            {busy === 'share' ? (
              <ActivityIndicator size="small" color={colorway.textOnAccent} />
            ) : (
              <Share2 size={16} color={colorway.textOnAccent} />
            )}
            <Text style={[styles.dockButtonText, { color: colorway.textOnAccent }]}>Share Receipt</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <ShareFallbackSheet visible={fallbackOpen} onClose={() => setFallbackOpen(false)} verifyUrl={data.verifyUrl} caption={caption} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    flex: 1,
    textAlign: 'center',
    fontFamily: swapFonts.label,
    fontSize: 11,
    letterSpacing: 0.6,
    marginHorizontal: 8,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  errorText: {
    textAlign: 'center',
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: '#FF6A6A',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  dock: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  dockButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: swapRadii.pill,
    paddingVertical: 16,
  },
  dockButtonGhost: {
    borderWidth: 1.5,
  },
  dockButtonText: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 14,
  },
});
