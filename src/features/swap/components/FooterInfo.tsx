import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

import { swapColors, swapFonts } from '../theme';
import { Skeleton } from './Skeleton';

export type FooterInfoItem = { label: string; value: string };

export type FooterInfoProps = {
  /** Always visible, collapsed or not — the exchange rate. */
  primary: FooterInfoItem;
  /** Only shown once expanded. */
  items: FooterInfoItem[];
  compact?: boolean;
  /** True while the primary row's value has no real quote to show yet —
   * renders a skeleton bar over it instead of `primary.value`. */
  loading?: boolean;
  /** Whole seconds until the current quote goes stale (real server
   * `expiresAt`, see useSwapQuote.ts's own doc — not a guessed 30s timer),
   * shown as a small countdown next to the primary row. `undefined`/`null`
   * hides it — no live quote to count down, or the caller doesn't have one
   * (Receive mode, a fiat-only pair, etc). Hidden while `loading` too: a
   * fresh quote is already in flight, so a stale countdown would just be
   * confusing next to the skeleton standing in for the number it describes. */
  secondsUntilRefresh?: number | null;
};

/**
 * Collapsed by default to just the exchange rate — the one figure worth
 * seeing at a glance — with the rest (fee, and whatever else lands here
 * later) a tap away instead of always taking up card space.
 */
export function FooterInfo({ primary, items, compact, loading, secondsUntilRefresh }: FooterInfoProps) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = items.length > 0;

  return (
    <Pressable
      testID="footer-info"
      accessibilityRole={canExpand ? 'button' : undefined}
      accessibilityLabel={canExpand ? 'Toggle fee details' : undefined}
      accessibilityState={canExpand ? { expanded } : undefined}
      disabled={!canExpand}
      onPress={() => setExpanded((value) => !value)}
      style={[styles.container, compact && styles.containerCompact]}
    >
      <FooterRow
        item={primary}
        chevron={canExpand ? (expanded ? 'up' : 'down') : undefined}
        loading={loading}
        secondsUntilRefresh={loading ? null : secondsUntilRefresh}
      />
      {expanded && items.map((item) => <FooterRow key={item.label} item={item} />)}
    </Pressable>
  );
}

function FooterRow({
  item,
  chevron,
  loading,
  secondsUntilRefresh,
}: {
  item: FooterInfoItem;
  chevron?: 'up' | 'down';
  loading?: boolean;
  secondsUntilRefresh?: number | null;
}) {
  const ChevronIcon = chevron === 'up' ? ChevronUp : ChevronDown;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{item.label}</Text>
      <View style={styles.valueRow}>
        {loading ? (
          <Skeleton testID="footer-value-skeleton" style={styles.valueSkeleton} />
        ) : (
          <>
            <Text style={styles.value}>{item.value}</Text>
            {secondsUntilRefresh != null && (
              <Text testID="quote-refresh-countdown" style={styles.countdown}>
                · {secondsUntilRefresh}s
              </Text>
            )}
          </>
        )}
        {chevron ? <ChevronIcon size={12} color={swapColors.textMuted} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    marginTop: 14,
  },
  containerCompact: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: swapFonts.body,
    fontSize: 11,
    color: swapColors.textMuted,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textPrimary,
  },
  countdown: {
    fontFamily: swapFonts.body,
    fontSize: 11,
    color: swapColors.textMuted,
  },
  valueSkeleton: {
    height: 12,
    width: 110,
  },
});
