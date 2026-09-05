import { StyleSheet, View } from 'react-native';

import { swapColors, swapRadii } from '../../swap/theme';
import { Skeleton } from '../../swap/components/Skeleton';

/**
 * Placeholder shaped like PayScreen's own real "ready" card — not
 * `SwapCardSkeleton` (which is shaped like the Swap screen's two-amount-card
 * layout and has nothing in common with this one), shown for the real
 * network round-trip `usePayRequest` makes (`by-link` then `calldata`)
 * before there's a real amount/recipient/button to render. Same
 * card padding/gap/alignment as the real ready state (see PayScreen.tsx's
 * own `styles.card`) so mounting the real content underneath doesn't jump.
 */
export function PayScreenSkeleton() {
  return (
    <View style={styles.card} testID="pay-screen-skeleton">
      <Skeleton style={styles.label} />
      <Skeleton style={styles.amount} />
      <Skeleton style={styles.body} />
      <Skeleton style={styles.button} />
      <Skeleton style={styles.link} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: swapColors.card,
    borderRadius: swapRadii.card,
    padding: 28,
    gap: 12,
    alignItems: 'center',
  },
  // Matches PayScreen's `label` text (13px "Payment request").
  label: {
    height: 13,
    width: 130,
  },
  // Matches PayScreen's `amount` text (32px numeric amount + token).
  amount: {
    height: 32,
    width: 190,
    borderRadius: 8,
  },
  // Matches PayScreen's `body` text (the recipient line).
  body: {
    height: 14,
    width: 170,
  },
  // Matches PrimaryButton's real footprint (full width, pill, ~56 tall).
  button: {
    width: '100%',
    height: 56,
    borderRadius: swapRadii.pill,
    marginTop: 4,
  },
  // Matches the "Not now" link text.
  link: {
    height: 14,
    width: 60,
  },
});
