import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { swapColors, swapFonts, swapRadii } from '../swap/theme';
import { useTransactionStore } from './TransactionStoreContext';
import { PIPELINE_STEP_ORDER } from './types';

/**
 * TEMPORARY — dev-only trigger panel for the transaction tracker, so the
 * pill/sheet/stepper can be reviewed and demoed without waiting out a real
 * 5-minute settlement or running an actual swap. Gated behind `__DEV__` so
 * it's automatically inert in any production build even if this file isn't
 * deleted first — but it SHOULD be deleted once the tracker is wired to
 * real transactions. To remove: delete this file and its one import + JSX
 * line in SwapScreen.tsx.
 */
export function DevTransactionSimulator() {
  const { activeTransactions, startTransaction, devSetStatus, removeTransaction } = useTransactionStore();
  const [open, setOpen] = useState(false);

  if (!__DEV__) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable testID="dev-tx-sim-toggle" style={styles.fab} onPress={() => setOpen((value) => !value)}>
        <Text style={styles.fabText}>{open ? '✕' : 'TX'}</Text>
      </Pressable>

      {open && (
        <View style={styles.panel}>
          <Text style={styles.title}>Dev: Transaction Simulator</Text>
          <Text style={styles.hint}>Temporary — remove before shipping.</Text>

          <Pressable
            testID="dev-tx-sim-spawn"
            style={styles.spawnButton}
            onPress={() => startTransaction({ amount: 500, cryptoType: 'USDC', fiatType: 'GHS', durationMs: 15_000 })}
          >
            <Text style={styles.spawnButtonText}>Spawn 15s demo (auto-plays)</Text>
          </Pressable>

          <ScrollView style={styles.list}>
            {activeTransactions.length === 0 && <Text style={styles.emptyText}>No active transactions.</Text>}
            {activeTransactions.map((tx) => (
              <View key={tx.id} testID={`dev-tx-sim-row-${tx.id}`} style={styles.row}>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {tx.amount} {tx.cryptoType} · {tx.status}
                </Text>
                <View style={styles.rowButtons}>
                  {PIPELINE_STEP_ORDER.map((status) => (
                    <Pressable
                      key={status}
                      testID={`dev-tx-sim-status-${tx.id}-${status}`}
                      style={styles.chip}
                      onPress={() => devSetStatus(tx.id, status)}
                    >
                      <Text style={styles.chipText}>{status.split('_')[0]}</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    testID={`dev-tx-sim-complete-${tx.id}`}
                    style={[styles.chip, styles.chipSuccess]}
                    onPress={() => devSetStatus(tx.id, 'COMPLETED')}
                  >
                    <Text style={styles.chipText}>Done</Text>
                  </Pressable>
                  <Pressable
                    testID={`dev-tx-sim-fail-${tx.id}`}
                    style={[styles.chip, styles.chipDanger]}
                    onPress={() => devSetStatus(tx.id, 'FAILED')}
                  >
                    <Text style={styles.chipText}>Fail</Text>
                  </Pressable>
                  <Pressable testID={`dev-tx-sim-remove-${tx.id}`} style={styles.chip} onPress={() => removeTransaction(tx.id)}>
                    <Text style={styles.chipText}>✕</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    zIndex: 1000,
    alignItems: 'flex-end',
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: swapColors.toggleTrack,
  },
  fabText: {
    fontFamily: swapFonts.label,
    fontSize: 11,
    color: swapColors.textOnDark,
  },
  panel: {
    marginTop: 8,
    width: 280,
    maxHeight: 360,
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.subcard,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: swapColors.divider,
  },
  title: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 13,
    color: swapColors.textPrimary,
  },
  hint: {
    fontFamily: swapFonts.body,
    fontSize: 11,
    color: swapColors.warningText,
    marginTop: -4,
  },
  spawnButton: {
    backgroundColor: swapColors.pillActive,
    borderRadius: swapRadii.pill,
    paddingVertical: 8,
    alignItems: 'center',
  },
  spawnButtonText: {
    fontFamily: swapFonts.label,
    fontSize: 12,
    color: swapColors.textOnDark,
  },
  list: {
    maxHeight: 220,
  },
  emptyText: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
  },
  row: {
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: swapColors.divider,
  },
  rowLabel: {
    fontFamily: swapFonts.label,
    fontSize: 12,
    color: swapColors.textPrimary,
  },
  rowButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: swapRadii.pill,
    backgroundColor: swapColors.subcard,
  },
  chipSuccess: {
    backgroundColor: swapColors.successGreen,
  },
  chipDanger: {
    backgroundColor: swapColors.warningText,
  },
  chipText: {
    fontFamily: swapFonts.label,
    fontSize: 10,
    color: swapColors.textPrimary,
  },
});
