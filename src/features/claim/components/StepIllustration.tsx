import { StyleSheet, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { swapColors } from '../../swap/theme';

export type StepIllustrationProps = {
  icon: LucideIcon;
};

/**
 * A simple icon-in-a-badge shown above each claim step's title — a visual
 * anchor for which stage of "confirm who you are → verify a code → enter
 * the claim code → pick a payout" the recipient is on, since until now
 * every step looked identical (same card, same title/body/input shape)
 * and only the copy told them apart. Deliberately just an icon, not a
 * custom illustration asset: same lucide-react-native icon set already
 * used throughout this app (CountrySelect's chevron, the wallet menu,
 * etc.), so this doesn't introduce a second visual language just for one
 * screen.
 */
export function StepIllustration({ icon: Icon }: StepIllustrationProps) {
  return (
    <View style={styles.badge}>
      <Icon size={36} color={swapColors.pillActive} strokeWidth={1.75} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: swapColors.pillInactive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});
