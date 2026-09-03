import { Pressable, StyleSheet, Text, View } from 'react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';

export type BalanceChipProps = {
  walletConnected: boolean;
  balance: string;
  tokenSymbol: string;
  /** True once the typed amount exceeds `balance` — tints the chip as a warning. */
  insufficient: boolean;
  /** True when the "from" leg pays over mobile money rather than a wallet
   * (onramp) — there's no wallet involved in paying at all here, so this
   * renders a plain informational chip instead of the connect/balance
   * affordance, regardless of whether a wallet happens to be connected. */
  fiatSource?: boolean;
  onConnect: () => void;
  /** Opens the connected wallet's menu. Its items live in `WalletMenuSheet`,
   * rendered at the screen root — an anchored dropdown here could not be
   * dismissed by tapping outside it (see SheetShell's doc comment), so this
   * component is now only the chip that opens it. */
  onOpenMenu: () => void;
};

/**
 * Disconnected, this is the only wallet affordance on the card — a
 * "Connect Wallet" pill in place of the balance readout. Connected, it
 * shows "Balance X TOKEN" as before, and doubles as the trigger for the
 * wallet menu (switch chain / disconnect), since otherwise there's no way
 * back out of a connected wallet.
 */
export function BalanceChip({
  walletConnected,
  balance,
  tokenSymbol,
  insufficient,
  fiatSource,
  onConnect,
  onOpenMenu,
}: BalanceChipProps) {
  if (fiatSource) {
    return (
      <View testID="balance-chip" style={[styles.chip, styles.fiatChip]}>
        <Text style={styles.fiatLabel}>Paying via Mobile Money</Text>
      </View>
    );
  }

  if (!walletConnected) {
    return (
      <Pressable
        testID="balance-chip"
        accessibilityRole="button"
        style={({ pressed }) => [styles.chip, styles.connectChip, { opacity: pressed ? 0.85 : 1 }]}
        onPress={onConnect}
      >
        <Text style={styles.connectLabel}>Connect Wallet</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      testID="balance-chip"
      accessibilityRole="button"
      accessibilityLabel={`Wallet options, balance ${balance} ${tokenSymbol}`}
      style={[styles.chip, insufficient ? styles.insufficientChip : styles.defaultChip]}
      onPress={onOpenMenu}
    >
      <Text style={[styles.label, insufficient && styles.insufficientText]}>Balance</Text>
      <Text style={[styles.value, insufficient && styles.insufficientText]}>
        {balance} {tokenSymbol}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: swapRadii.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  defaultChip: {
    backgroundColor: swapColors.subcard,
  },
  insufficientChip: {
    backgroundColor: swapColors.warningBg,
  },
  connectChip: {
    backgroundColor: swapColors.buttonPrimaryBg,
  },
  connectLabel: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.buttonPrimaryText,
  },
  fiatChip: {
    backgroundColor: swapColors.subcard,
  },
  fiatLabel: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textMuted,
  },
  label: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.textMuted,
  },
  value: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textPrimary,
  },
  insufficientText: {
    color: swapColors.warningText,
  },
});
