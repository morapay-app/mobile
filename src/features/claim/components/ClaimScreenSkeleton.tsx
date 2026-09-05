import { StyleSheet, View } from 'react-native';

import { swapColors, swapRadii } from '../../swap/theme';
import { Skeleton } from '../../swap/components/Skeleton';

/**
 * Placeholder shaped like ClaimScreen's own real step cards — not
 * `SwapCardSkeleton` (the Swap screen's two-amount-card layout has nothing
 * in common with this), shown for the real `getClaimByLink` round-trip
 * before this screen knows which step it's even landing on. Every real step
 * (recipient/otp/claim-code/payout) shares the same shape — illustration,
 * title, body copy, one field, one button — so this approximates that
 * common shape rather than guessing a specific step. Same card
 * padding/gap/alignment as the real steps (see ClaimScreen.tsx's own
 * `styles.card`) so mounting the real content underneath doesn't jump.
 */
export function ClaimScreenSkeleton() {
  return (
    <View style={styles.card} testID="claim-screen-skeleton">
      {/* Matches StepArtwork's own footprint (`width: '100%', maxWidth: 240`) —
          height picked for the recipient step's real aspect ratio
          (800 / 483.13, the first step every claim link actually lands on). */}
      <View style={styles.illustration} />
      <Skeleton style={styles.title} />
      <Skeleton style={styles.bodyLine} />
      <Skeleton style={styles.bodyLineShort} />
      <Skeleton style={styles.input} />
      <Skeleton style={styles.button} />
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
  illustration: {
    width: '100%',
    maxWidth: 240,
    aspectRatio: 800 / 483.13,
    borderRadius: swapRadii.subcard,
    backgroundColor: swapColors.subcard,
  },
  // Matches the real 20px bold step title.
  title: {
    height: 20,
    width: 180,
    marginTop: 4,
  },
  // Matches the real 14px body copy (two lines — most step descriptions wrap).
  bodyLine: {
    height: 14,
    width: '90%',
  },
  bodyLineShort: {
    height: 14,
    width: '60%',
  },
  // Matches the real underline text input (full width, ~24px text + border).
  input: {
    width: '100%',
    height: 24,
    borderRadius: 4,
    marginTop: 8,
  },
  // Matches PrimaryButton's real footprint (full width, pill, ~56 tall).
  button: {
    width: '100%',
    height: 56,
    borderRadius: swapRadii.pill,
    marginTop: 4,
  },
});
