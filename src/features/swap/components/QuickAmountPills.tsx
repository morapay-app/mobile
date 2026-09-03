import { Pressable, StyleSheet, Text, View } from 'react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';

// Some fiat currencies' quick amounts run into the tens of thousands or
// more (NGN, for one) — spelled out in full ("50000 NGN") that overflows
// this pill's fixed row width on a real device. "1.5k"/"2M"-style shortening
// keeps every pill readable regardless of currency. `toFixed(1)` then
// `Number(...)` trims a trailing ".0" (5000 -> "5k", not "5.0k") while still
// keeping one decimal where it's actually needed (2500 -> "2.5k").
function formatCompactAmount(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${Number((amount / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${Number((amount / 1_000).toFixed(1))}k`;
  return String(amount);
}

export type QuickAmountPillsProps = {
  /** Whole amounts to offer, e.g. `[20, 50, 100, 250]`. */
  amounts: number[];
  selected: number | null;
  onSelect: (index: number) => void;
  /** Currency code to show after the number instead of a leading "$" — for
   * a fiat "from" (GHS, NGN, ...), a dollar sign would just be wrong. Omit
   * for the original dollar-amount usage. */
  currency?: string;
};

/**
 * Same pink-pill row as PercentPills, but a fixed set of amounts instead of
 * a percentage — the useful quick-pick when there's no wallet balance to
 * take a percentage *of* yet: not connected, the "from" leg is a
 * dollar-pegged stablecoin with no balance loaded (see SwapScreen's
 * `isStableToken` check, "$20" always means exactly 20 of that token, no
 * live price feed required), or the "from" leg is a fiat rail with no
 * wallet involved at all (pass `currency` in that case).
 */
export function QuickAmountPills({ amounts, selected, onSelect, currency }: QuickAmountPillsProps) {
  return (
    <View style={styles.row}>
      {amounts.map((amount, index) => {
        const isActive = index === selected;
        return (
          <Pressable
            key={amount}
            testID={`quick-amount-${amount}`}
            accessibilityRole="button"
            style={[styles.pill, { backgroundColor: isActive ? swapColors.pillActive : swapColors.pillInactive }]}
            onPress={() => onSelect(index)}
          >
            <Text style={[styles.label, { color: isActive ? swapColors.textOnDark : swapColors.pillInactiveText }]}>
              {currency ? `${formatCompactAmount(amount)} ${currency}` : `$${formatCompactAmount(amount)}`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 2,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: swapRadii.pill,
  },
  label: {
    fontFamily: swapFonts.label,
    fontSize: 12,
  },
});
