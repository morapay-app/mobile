import { StyleSheet, Text, View } from 'react-native';
import { MotiPressable } from 'moti/interactions';

import { swapColors, swapFonts, swapRadii } from '../theme';

const OPTIONS = ['25%', '50%', '75%', 'Max'] as const;

export type PercentPillsProps = {
  selected: number | null;
  onSelect: (index: number) => void;
};

/** Quick-pick row (25% / 50% / 75% / Max), same accent-pill treatment throughout the swap card. */
export function PercentPills({ selected, onSelect }: PercentPillsProps) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((label, index) => {
        const isActive = index === selected;
        return (
          <MotiPressable
            key={label}
            accessibilityRole="button"
            style={[
              styles.pill,
              { backgroundColor: isActive ? swapColors.pillActive : swapColors.pillInactive },
            ]}
            onPress={() => onSelect(index)}
            // Same tactile press-squash + selected-pop as QuickAmountPills —
            // see that component's own doc for why.
            animate={({ pressed }: { pressed: boolean }) => {
              'worklet';
              return { scale: pressed ? 0.94 : isActive ? 1.06 : 1 };
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <Text
              style={[
                styles.label,
                { color: isActive ? swapColors.textOnDark : swapColors.pillInactiveText },
              ]}
            >
              {label}
            </Text>
          </MotiPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 2,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: swapRadii.pill,
  },
  label: {
    fontFamily: swapFonts.label,
    fontSize: 12,
  },
});
