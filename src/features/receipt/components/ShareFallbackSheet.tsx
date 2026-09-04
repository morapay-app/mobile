import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, MessageCircle } from 'lucide-react-native';
import { useState } from 'react';

import { swapColors, swapFonts, swapRadii } from '../../swap/theme';
import { SheetShell } from '../../swap/components/SheetShell';

export type ShareFallbackSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The receipt's own verify link — what "Copy Share Link" actually copies. */
  verifyUrl: string;
  /** The full bragging-rights caption (`shareCaptionFor`) — what the X and
   * WhatsApp intents pre-fill. */
  caption: string;
};

/**
 * Shown when neither the Web Share API nor `expo-sharing` is available (or
 * the user backs out of that native sheet) — three plain intents instead of
 * silently doing nothing. `Linking.openURL` for the two social intents is
 * the same escape-hatch this app has no other use for yet, but it's the
 * standard, no-dependency way to hand off to a URL scheme/web intent.
 */
export function ShareFallbackSheet({ visible, onClose, verifyUrl, caption }: ShareFallbackSheetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(verifyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleTweet = () => {
    void Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`);
  };

  const handleWhatsApp = () => {
    void Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(caption)}`);
  };

  return (
    <SheetShell visible={visible} onClose={onClose} testID="share-fallback-sheet" title="Share receipt">
      <View style={styles.body}>
        <Row
          testID="share-fallback-copy"
          icon={copied ? <Check size={18} color={swapColors.textOnDark} /> : <Copy size={18} color={swapColors.textOnDark} />}
          label={copied ? 'Link copied' : 'Copy share link'}
          onPress={handleCopyLink}
        />
        <Row
          testID="share-fallback-x"
          icon={<Text style={styles.xGlyph}>𝕏</Text>}
          label="Post on X"
          onPress={handleTweet}
        />
        <Row
          testID="share-fallback-whatsapp"
          icon={<MessageCircle size={18} color={swapColors.textOnDark} />}
          label="Send on WhatsApp"
          onPress={handleWhatsApp}
        />
      </View>
    </SheetShell>
  );
}

function Row({ testID, icon, label, onPress }: { testID: string; icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" style={styles.row} onPress={onPress}>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={styles.rowLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: swapColors.toggleTrack,
  },
  xGlyph: {
    fontSize: 16,
    fontWeight: '700',
    color: swapColors.textOnDark,
  },
  rowLabel: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 15,
    color: swapColors.textPrimary,
  },
});
