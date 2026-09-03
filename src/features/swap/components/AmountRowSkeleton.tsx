import { StyleSheet, View } from 'react-native';

import { Skeleton } from './Skeleton';

// Quicker pulse than the token-list skeleton — a quote is usually back
// within a debounce window plus one round trip, so this should read as
// "any second now" rather than "settle in for a real fetch".
const FAST_DURATION_MS = 380;

/**
 * Stands in for an entire `AmountRow` (big figure + unit pill + secondary
 * line) while its value has nothing real to show yet — the first quote for
 * a given token pair/amount, before any rate has ever resolved. Same
 * footprint as the real row so the card doesn't jump once it swaps in.
 */
export function AmountRowSkeleton() {
  return (
    <View testID="amount-row-skeleton">
      <View style={styles.amountLine}>
        <Skeleton style={styles.bigLine} duration={FAST_DURATION_MS} />
        <Skeleton style={styles.unitPill} duration={FAST_DURATION_MS} />
      </View>
      <Skeleton style={styles.smallLine} duration={FAST_DURATION_MS} />
    </View>
  );
}

const styles = StyleSheet.create({
  amountLine: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bigLine: {
    height: 34,
    width: '45%',
    borderRadius: 8,
  },
  unitPill: {
    height: 24,
    width: 70,
    marginBottom: 6,
  },
  smallLine: {
    height: 13,
    width: 70,
  },
});
