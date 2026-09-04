import { Pressable, StyleSheet, Text, View } from 'react-native';

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
          <Pressable
            key={label}
            accessibilityRole="button"
            style={[
              styles.pill,
              { backgroundColor: isActive ? swapColors.pillActive : swapColors.pillInactive },
            ]}
            onPress={() => onSelect(index)}
          >
            <Text
              style={[
                styles.label,
                { color: isActive ? swapColors.textOnDark : swapColors.pillInactiveText },
              ]}
            >
              {label}
            </Text>
          </Pressable>
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
