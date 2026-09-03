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
};

/**
 * Collapsed by default to just the exchange rate — the one figure worth
 * seeing at a glance — with the rest (fee, and whatever else lands here
 * later) a tap away instead of always taking up card space.
 */
export function FooterInfo({ primary, items, compact, loading }: FooterInfoProps) {
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
      <FooterRow item={primary} chevron={canExpand ? (expanded ? 'up' : 'down') : undefined} loading={loading} />
      {expanded && items.map((item) => <FooterRow key={item.label} item={item} />)}
    </Pressable>
  );
}

function FooterRow({ item, chevron, loading }: { item: FooterInfoItem; chevron?: 'up' | 'down'; loading?: boolean }) {
  const ChevronIcon = chevron === 'up' ? ChevronUp : ChevronDown;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{item.label}</Text>
      <View style={styles.valueRow}>
        {loading ? <Skeleton testID="footer-value-skeleton" style={styles.valueSkeleton} /> : <Text style={styles.value}>{item.value}</Text>}
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
  valueSkeleton: {
    height: 12,
    width: 110,
  },
});
