import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from '../swap/theme';
import { useTransactionStore } from './TransactionStoreContext';
import { useNow } from './useNow';
import type { SwapTransaction } from './types';

const ENTER_EXIT_MS = 260;

function formatTxAmount(amount: number): string {
  return amount % 1 === 0 ? amount.toLocaleString() : amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function singleTransactionLabel(tx: SwapTransaction, now: number): string {
  const remainingMs = Math.max(0, tx.estimatedCompletionTime - now);
  const remainingMin = Math.ceil(remainingMs / 60_000);
  const eta = remainingMs <= 0 ? 'Finishing up…' : `~${remainingMin} min${remainingMin === 1 ? '' : 's'} remaining`;
  const verb = tx.status === 'MOMO_SETTLEMENT' ? 'Settling' : 'Swapping';
  return `${verb} ${formatTxAmount(tx.amount)} ${tx.cryptoType}… ${eta}`;
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

  const label =
    activeTransactions.length === 1
      ? singleTransactionLabel(activeTransactions[0], now)
      : `${activeTransactions.length} Active Transactions Processing…`;

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
        accessibilityLabel={label}
        style={({ pressed }) => [styles.pill, { opacity: pressed ? 0.9 : 1 }]}
        onPress={onPress}
      >
        <Animated.View
          testID="active-transaction-pill-dot"
          style={[styles.dot, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]}
        />
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
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
  label: {
    flex: 1,
    minWidth: 0,
    fontFamily: swapFonts.label,
    fontSize: 13,
    color: swapColors.textOnDark,
  },
});
