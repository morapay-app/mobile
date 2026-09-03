import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { useTheme } from '../theme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
};

/**
 * Pill button matching munckins-web's CTAs: `rounded-full`, white-on-black
 * for the primary action, a hairline border for secondary actions, a
 * lowercase label, and a subtle scale-down on press standing in for the
 * site's `hover:scale-[1.02]`.
 */
export function Button({ label, variant = 'primary', disabled, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: theme.radii.full,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm + theme.spacing.xs,
          backgroundColor: isPrimary ? theme.colors.button.primaryBg : 'transparent',
          borderWidth: isPrimary ? 0 : 1,
          borderColor: theme.colors.button.secondaryBorder,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
      {...rest}
    >
      <Text
        variant="label"
        color={isPrimary ? theme.colors.button.primaryText : theme.colors.button.secondaryText}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },
});
