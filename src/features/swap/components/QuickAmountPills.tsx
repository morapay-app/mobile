import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

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
 *
 * Scrolls horizontally rather than just laying pills out in a plain row —
 * a currency whose quick amounts run long (`50k NGN`, for one) can make
 * four pills wider than the space left next to `BalanceChip` in
 * `balanceRow`. A plain `View` row has no way to shrink to fit, so it
 * silently overflowed the card; the visible symptom was the swap card
 * reflowing (pills briefly pushed side by side / overlapping) the instant
 * a bottom sheet's own mount forced a layout pass, before the overflow
 * settled back down. A horizontal `ScrollView` can never force its parent
 * wider than the space it's given, so that reflow has nothing left to
 * trigger it.
 */
export function QuickAmountPills({ amounts, selected, onSelect, currency }: QuickAmountPillsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // `flexGrow: 0` keeps this from claiming more width than its content
  // needs when there's room to spare (matching the old row's own "hug its
  // pills" sizing). `flexShrink: 1` + `minWidth: 0` is what actually fixes
  // the overflow, though: RN's default `flexShrink: 0` means a ScrollView
  // otherwise still measures itself to its full content width like any
  // other view, so `balanceRow` would still be forced wider than the card
  // — it would just be a *scrollable* overflow instead of a clipped one,
  // same reflow-on-mount symptom either way. Letting it actually shrink to
  // whatever space is left next to `BalanceChip` is what makes the excess
  // scroll *inside* this view instead of pushing its parent wider.
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
  },
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
