import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, X } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from '../swap/theme';
import { SheetShell } from '../swap/components/SheetShell';
import { useTransactionStore } from './TransactionStoreContext';
import { useNow } from './useNow';
import { TransactionStepper } from './TransactionStepper';
import { TERMINAL_STATUSES, type SwapTransaction } from './types';

const RECENT_LIMIT = 5;

function formatTxAmount(amount: number): string {
  return amount % 1 === 0 ? amount.toLocaleString() : amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Any moment now';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `Expected in ${minutes}m ${seconds}s` : `Expected in ${seconds}s`;
}

function TransactionCard({ transaction, now }: { transaction: SwapTransaction; now: number }) {
  const remainingMs = transaction.estimatedCompletionTime - now;
  return (
    <View testID={`transaction-card-${transaction.id}`} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {formatTxAmount(transaction.amount)} {transaction.cryptoType} → {transaction.fiatType}
        </Text>
        <Text style={styles.cardEta}>{formatCountdown(remainingMs)}</Text>
      </View>
      <TransactionStepper status={transaction.status} fiatType={transaction.fiatType} />
    </View>
  );
}

function RecentRow({ transaction }: { transaction: SwapTransaction }) {
  const failed = transaction.status === 'FAILED';
  return (
    <View testID={`transaction-recent-${transaction.id}`} style={styles.recentRow}>
      <View style={[styles.recentIcon, failed ? styles.recentIconFailed : styles.recentIconDone]}>
        {failed ? <X size={14} color={swapColors.textOnDark} /> : <Check size={14} color={swapColors.textOnDark} />}
      </View>
      <View style={styles.recentInfo}>
        <Text style={styles.recentTitle}>
          {formatTxAmount(transaction.amount)} {transaction.cryptoType} → {transaction.fiatType}
        </Text>
        <Text style={styles.recentSubtitle}>{failed ? (transaction.failureReason ?? 'Failed') : 'Completed'}</Text>
      </View>
    </View>
  );
}

export type TransactionProgressSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * The detailed view opened by tapping `ActiveTransactionPill` — a card per
 * in-flight transaction, each with its own animated 3-step pipeline. When
 * nothing is active, falls back to a short "recent" history (or a plain
 * empty state on a completely fresh install) rather than an empty sheet.
 */
export function TransactionProgressSheet({ visible, onClose }: TransactionProgressSheetProps) {
  const { transactions, activeTransactions } = useTransactionStore();
  const now = useNow(1000);

  const recent = useMemo(
    () =>
      transactions
        .filter((tx) => TERMINAL_STATUSES.has(tx.status))
        .sort((a, b) => b.startTime - a.startTime)
        .slice(0, RECENT_LIMIT),
    [transactions],
  );

  const hasActive = activeTransactions.length > 0;

  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      testID="transaction-progress-sheet"
      title="Transactions"
      subtitle={hasActive ? `${activeTransactions.length} in progress` : undefined}
    >
      <View style={styles.body}>
        {hasActive ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {activeTransactions.map((tx) => (
              <TransactionCard key={tx.id} transaction={tx} now={now} />
            ))}
          </ScrollView>
        ) : recent.length > 0 ? (
          <View style={styles.recentSection}>
            <Text style={styles.recentHeading}>Recent Transactions</Text>
            {recent.map((tx) => (
              <RecentRow key={tx.id} transaction={tx} />
            ))}
          </View>
        ) : (
          <View testID="transaction-empty-state" style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No active swaps</Text>
            <Text style={styles.emptySubtitle}>Once you start a swap, you can track its progress here.</Text>
          </View>
        )}
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 12,
  },
  card: {
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.subcard,
    padding: 16,
    gap: 16,
  },
  cardHeader: {
    gap: 2,
  },
  cardTitle: {
    fontFamily: swapFonts.headingBold,
    fontSize: 16,
    color: swapColors.textPrimary,
  },
  cardEta: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
  },
  recentSection: {
    gap: 4,
    paddingBottom: 12,
  },
  recentHeading: {
    fontFamily: swapFonts.label,
    fontSize: 12,
    letterSpacing: 0.4,
    color: swapColors.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  recentIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentIconDone: {
    backgroundColor: swapColors.successGreen,
  },
  recentIconFailed: {
    backgroundColor: swapColors.warningText,
  },
  recentInfo: {
    flex: 1,
    minWidth: 0,
  },
  recentTitle: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 14,
    color: swapColors.textPrimary,
  },
  recentSubtitle: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
    marginTop: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 4,
  },
  emptyTitle: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 15,
    color: swapColors.textPrimary,
  },
  emptySubtitle: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
