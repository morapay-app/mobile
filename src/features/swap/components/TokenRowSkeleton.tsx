import { StyleSheet, View } from 'react-native';

import { Skeleton } from './Skeleton';

/** Placeholder for a token-list row while the live catalog is still
 * loading — same footprint as a real row (icon + two text-line blocks),
 * pulsing so it reads as "loading" rather than "empty". */
export function TokenRowSkeleton() {
  return (
    <View style={styles.row} testID="token-row-skeleton">
      <Skeleton style={styles.icon} />
      <View style={styles.lines}>
        <Skeleton style={styles.lineWide} />
        <Skeleton style={styles.lineNarrow} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  lines: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  lineWide: {
    height: 13,
    width: '55%',
  },
  lineNarrow: {
    height: 11,
    width: '30%',
  },
});
