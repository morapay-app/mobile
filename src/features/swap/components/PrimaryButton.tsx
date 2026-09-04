import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';

export type PrimaryButtonVariant = 'primary' | 'warning';

export type PrimaryButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  /** 'warning' flags a blocked state (insufficient funds, low liquidity) — same pill, a red tint instead of the brand green. */
  variant?: PrimaryButtonVariant;
  /** Shows a spinner in place of the chevron and blocks interaction, without the flat "disabled" dimming. */
  loading?: boolean;
};

const VARIANT_COLORS: Record<PrimaryButtonVariant, { bg: string; text: string }> = {
  primary: { bg: swapColors.buttonPrimaryBg, text: swapColors.buttonPrimaryText },
  warning: { bg: swapColors.warningBg, text: swapColors.warningText },
};

/**
 * Full-width solid pill CTA with a trailing chevron, matching the board's
 * "Withdraw" button but on its own line. Doubles as every state the swap
 * flow needs — connect wallet, ready, onramp/offramp, blocked (warning),
 * and pending (loading) — via `label`/`variant`/`loading` rather than
 * separate components, since they're all the same control, just relabeled.
 * The mobile-money sheet uses this same green/cream identity too, not a
 * separate one, so there's no third variant to keep in sync.
 */
export function PrimaryButton({ label, variant = 'primary', loading = false, disabled, ...rest }: PrimaryButtonProps) {
  const { bg, text } = VARIANT_COLORS[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg },
        { opacity: disabled && !loading ? 0.5 : pressed ? 0.85 : 1 },
      ]}
      {...rest}
    >
      <Text style={[styles.label, { color: text }]}>{label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={text} />
      ) : (
        <ChevronRight size={15} color={text} strokeWidth={2.5} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    borderRadius: swapRadii.pill,
    paddingHorizontal: 28,
    paddingVertical: 18,
    marginHorizontal: 'auto',
    marginVertical: 14,
  },
  label: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 16,
  },
});
