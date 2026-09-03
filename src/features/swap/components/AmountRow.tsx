import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowUpDown, ChevronDown } from 'lucide-react-native';

import { swapColors, swapFonts } from '../theme';
import { noOutlineStyle } from '../webNoOutline';

export type AmountRowProps = {
  /** Big editable figure — already formatted for whichever unit is active. */
  primaryAmount: string;
  /** Unit label shown after the big figure, e.g. "ETH" or "USD". */
  primaryUnitLabel: string;
  /** Token logo shown before the unit label — omitted for the USD unit. */
  primaryUnitIcon?: string;
  /** Pre-formatted secondary line, e.g. "$ 70.10" or "134.80 ETH". */
  secondaryLabel: string;
  editable?: boolean;
  onChangePrimaryAmount?: (text: string) => void;
  /** Tapping the swap-arrows icon swaps which unit (token/USD) is primary. */
  onToggleUnit?: () => void;
  /** Tapping the unit label itself opens the token picker, when provided. */
  onPressUnitLabel?: () => void;
  testID?: string;
};

/**
 * Big amount + unit label over a hairline divider, with a secondary
 * value below — the layout the design board uses for both the "you send"
 * and "you will receive" figures. Both the big figure and the secondary
 * unit are driven entirely by props: this component has no notion of
 * tokens, USD, or conversion — the caller decides what "primary" means.
 */
export function AmountRow({
  primaryAmount,
  primaryUnitLabel,
  primaryUnitIcon,
  secondaryLabel,
  editable = false,
  onChangePrimaryAmount,
  onToggleUnit,
  onPressUnitLabel,
  testID,
}: AmountRowProps) {
  const unitContent = (
    <View style={styles.unitRow}>
      {primaryUnitIcon ? <Image source={{ uri: primaryUnitIcon }} style={styles.unitIcon} /> : null}
      <Text style={styles.token}>{primaryUnitLabel}</Text>
      {onPressUnitLabel ? <ChevronDown size={12} color={swapColors.textMuted} /> : null}
    </View>
  );

  return (
    <View>
      <View style={styles.amountLine}>
        {editable ? (
          <TextInput
            testID={testID}
            value={primaryAmount}
            onChangeText={onChangePrimaryAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={swapColors.textMuted}
            underlineColorAndroid="transparent"
            style={[styles.amount, styles.amountInput, noOutlineStyle]}
          />
        ) : (
          <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
            {primaryAmount}
          </Text>
        )}
        {onPressUnitLabel ? (
          <Pressable
            testID={testID ? `${testID}-unit` : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Choose token, currently ${primaryUnitLabel}`}
            onPress={onPressUnitLabel}
            hitSlop={8}
          >
            {unitContent}
          </Pressable>
        ) : (
          unitContent
        )}
      </View>
      {/* <View style={styles.divider} /> */}
      <View style={styles.usdLine}>
        <Text style={styles.usd}>{secondaryLabel}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch between token and USD"
          onPress={onToggleUnit}
          hitSlop={8}
        >
          <ArrowUpDown size={16} color={swapColors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  amountLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  amount: {
    fontFamily: swapFonts.numberBold,
    fontSize: 44,
    color: swapColors.textPrimary,
    flexShrink: 1,
  },
  amountInput: {
    flex: 1,
    // Flex items default to `min-width: auto`, so long typed input would
    // otherwise grow past the row and push the token label out of frame —
    // this lets the input actually shrink to the space that's left.
    minWidth: 0,
    padding: 0,
    margin: 0,
    borderWidth: 0,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 12,
    marginBottom: 8,
    flexShrink: 0,
  },
  unitIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: swapColors.card,
  },
  token: {
    fontFamily: swapFonts.label,
    fontSize: 16,
    color: swapColors.textPrimary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: swapColors.divider,
    marginVertical: 10,
  },
  usdLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  usd: {
    fontFamily: swapFonts.body,
    fontSize: 15,
    color: swapColors.textMuted,
  },
});
