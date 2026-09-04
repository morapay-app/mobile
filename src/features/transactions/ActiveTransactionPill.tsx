import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from '../swap/theme';
import { useTransactionStore } from './TransactionStoreContext';
import { useNow } from './useNow';
import { transactionPaySymbol, type SwapTransaction } from './types';

const ENTER_EXIT_MS = 260;

function formatTxAmount(amount: number): string {
  return amount % 1 === 0 ? amount.toLocaleString() : amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Split into `primary` ("Swapping 500 USDC…") and `secondary` ("~1 min
 * remaining") rather than one concatenated string — the two read as
 * distinct facts (what's happening vs. how long it'll take), so the pill
 * lays them out at opposite ends of the row instead of running them
 * together left-aligned. */
function singleTransactionLabel(tx: SwapTransaction, now: number): { primary: string; secondary: string } {
  const remainingMs = Math.max(0, tx.estimatedCompletionTime - now);
  const remainingMin = Math.ceil(remainingMs / 60_000);
  const secondary = remainingMs <= 0 ? 'Finishing up…' : `~${remainingMin} min${remainingMin === 1 ? '' : 's'} remaining`;
  const verb =
    tx.direction === 'onramp'
      ? tx.status === 'MOMO_SETTLEMENT'
        ? 'Sending'
        : 'Buying'
      : tx.status === 'MOMO_SETTLEMENT'
        ? 'Settling'
        : 'Swapping';
  const primary = `${verb} ${formatTxAmount(tx.amount)} ${transactionPaySymbol(tx)}…`;
  return { primary, secondary };
}

export type ActiveTransactionPillProps = {
  onPress: () => void;
};

/**
 * Global "something's happening in the background" indicator — sits below
 * the main swap card so it never competes with the card itself for
 * attention, but is always in view while a transaction is in flight.
 * Animates in/out with the active-transaction count rather than
 * mount/unmounting abruptly, and keeps rendering through the exit animation
 * (see the `mounted` state below) so "the last transaction just finished"
 * reads as a deliberate dismissal, not a flicker.
 */
export function ActiveTransactionPill({ onPress }: ActiveTransactionPillProps) {
  const { activeTransactions } = useTransactionStore();
  const now = useNow(1000);
  const visible = activeTransactions.length > 0;

  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: ENTER_EXIT_MS,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, progress]);

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  if (!mounted) return null;

  const single = activeTransactions.length === 1 ? singleTransactionLabel(activeTransactions[0], now) : null;
  const countLabel = single ? null : `${activeTransactions.length} Active Transactions Processing…`;
  // accessibilityLabel stays one combined string either way — screen readers
  // don't benefit from the visual split, they just want the whole fact.
  const accessibilityLabelText = single ? `${single.primary} ${single.secondary}` : (countLabel as string);

  return (
    <Animated.View
      testID="active-transaction-pill"
      style={[
        styles.wrap,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
      ]}
    >
      <Pressable
        testID="active-transaction-pill-button"
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabelText}
        style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.9 : 1 }]}
        onPress={onPress}
      >
        <Animated.View
          testID="active-transaction-pill-dot"
          style={[styles.dot, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]}
        />
        {single ? (
          <View style={styles.textRow}>
            <Text style={styles.label} numberOfLines={1}>
              {single.primary}
            </Text>
            <Text style={styles.secondaryLabel} numberOfLines={1}>
              {single.secondary}
            </Text>
          </View>
        ) : (
          <Text style={styles.label} numberOfLines={1}>
            {countLabel}
          </Text>
        )}
        <ChevronRight size={14} color={swapColors.textOnDark} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    alignSelf: 'stretch',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: swapRadii.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: swapColors.toggleTrack,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: swapColors.pillActive,
  },
  textRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  label: {
    flex: 1,
    minWidth: 0,
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textOnDark,
  },
  secondaryLabel: {
    flexShrink: 0,
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textOnDark,
    opacity: 0.75,
  },
});
