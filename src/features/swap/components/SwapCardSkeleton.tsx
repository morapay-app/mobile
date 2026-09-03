import { StyleSheet, View } from 'react-native';

import { swapColors, swapRadii } from '../theme';
import { Skeleton } from './Skeleton';

/**
 * Full-page placeholder shaped like the real swap card — shown for the
 * brief window before there's anything real to render at all (fonts still
 * loading on first launch). Same card/subcard/button footprint as
 * `SwapScreen` so mounting the real screen underneath it doesn't jump.
 */
export function SwapCardSkeleton() {
  return (
    <View style={styles.hero} testID="swap-card-skeleton">
      <View style={styles.card}>
        <Skeleton style={styles.toggle} />

        <View style={styles.balanceRow}>
          <Skeleton style={styles.balanceChip} />
          <Skeleton style={styles.pills} />
        </View>

        <View style={styles.amountBlock}>
          <Skeleton style={styles.sublabel} />
          <View style={styles.amountLine}>
            <Skeleton style={styles.bigLine} />
            <Skeleton style={styles.unitPill} />
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.subcard}>
          <Skeleton style={styles.sublabel} />
          <View style={styles.amountLine}>
            <Skeleton style={styles.bigLine} />
            <Skeleton style={styles.unitPill} />
          </View>
        </View>

        <Skeleton style={styles.footerLine} />
        <Skeleton style={styles.button} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    backgroundColor: swapColors.hero,
    paddingVertical: 20,
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
  },
  card: {
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.card,
    paddingVertical: 24,
    paddingHorizontal: 8,
  },
  toggle: {
    height: 52,
    borderRadius: swapRadii.pill,
    marginHorizontal: 10,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: 10,
    marginTop: 28,
  },
  balanceChip: {
    height: 32,
    width: 120,
  },
  pills: {
    height: 32,
    width: 150,
  },
  amountBlock: {
    backgroundColor: swapColors.subcard,
    borderRadius: swapRadii.subcard,
    padding: 20,
    marginTop: 4,
  },
  subcard: {
    backgroundColor: swapColors.subcard,
    borderRadius: swapRadii.subcard,
    padding: 20,
    marginTop: 6,
  },
  sublabel: {
    height: 15,
    width: 60,
    marginBottom: 16,
  },
  amountLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bigLine: {
    height: 34,
    width: '45%',
    borderRadius: 8,
  },
  unitPill: {
    height: 24,
    width: 70,
  },
  divider: {
    height: 6,
  },
  footerLine: {
    height: 13,
    width: 160,
    marginTop: 18,
    marginHorizontal: 4,
  },
  button: {
    height: 56,
    borderRadius: swapRadii.pill,
    marginTop: 16,
  },
});
