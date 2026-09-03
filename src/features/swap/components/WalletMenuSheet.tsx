import { Pressable, StyleSheet, Text, View } from 'react-native';

import { swapColors, swapFonts } from '../theme';
import { SheetShell } from './SheetShell';

export type WalletMenuSheetProps = {
  visible: boolean;
  /** The chain the "from" token lives on — what "Switch Chain" would move to. */
  chainName: string;
  onSwitchChain: () => void;
  onDisconnect: () => void;
  onClose: () => void;
};

/**
 * The connected wallet's own menu (switch chain, disconnect), as a sheet
 * rather than the anchored dropdown it used to be — see SheetShell's doc for
 * why an anchored dropdown couldn't be dismissed by tapping outside it here.
 *
 * Test IDs (`wallet-menu`, `wallet-menu-switch-chain`,
 * `wallet-menu-disconnect`) are unchanged from the old dropdown on purpose.
 */
export function WalletMenuSheet({ visible, chainName, onSwitchChain, onDisconnect, onClose }: WalletMenuSheetProps) {
  return (
    <SheetShell visible={visible} onClose={onClose} testID="wallet-menu" title="Wallet">
      <View style={styles.items}>
        <Pressable
          testID="wallet-menu-switch-chain"
          accessibilityRole="button"
          accessibilityLabel={`Switch chain, currently ${chainName}`}
          style={styles.row}
          onPress={onSwitchChain}
        >
          <Text style={styles.label}>Switch Chain</Text>
          <Text style={styles.value}>{chainName}</Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          testID="wallet-menu-disconnect"
          accessibilityRole="button"
          accessibilityLabel="Disconnect wallet"
          style={styles.row}
          onPress={onDisconnect}
        >
          <Text style={[styles.label, styles.disconnectLabel]}>Disconnect</Text>
        </Pressable>
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  items: {
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  label: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 15,
    color: swapColors.textPrimary,
  },
  value: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.textMuted,
  },
  disconnectLabel: {
    color: swapColors.warningText,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: swapColors.divider,
    marginHorizontal: 20,
  },
});
