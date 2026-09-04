import { Image, Pressable, StyleSheet, Text } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

import { swapColors, swapFonts } from '../theme';
import { PHONE_COUNTRIES } from '../destinationDetect';
import { FLAG_CDN } from '../data/tokens';

export type CountrySelectProps = {
  /** ITU-T calling code digits (no '+'), e.g. '233' for Ghana. `null` when
   * no country is actually known yet (a bare local number with no '+' and
   * no recognized carrier prefix) — shown as a neutral prompt rather than
   * guessing one, since guessing silently here previously meant the chip
   * could show a country the number was never actually confirmed to be. */
  countryCode: string | null;
  /** Opens the picker. The list itself lives in `CountrySelectSheet`, rendered
   * at the screen root — an anchored dropdown here could not be dismissed by
   * tapping outside it (see SheetShell's doc comment), so this component is
   * now only the chip that opens it. */
  onPress: () => void;
};

/**
 * Calling-code prefix shown inline before a phone number once the
 * destination field detects one — tapping opens a picker of real ITU-T
 * calling codes so the user can set/correct it (a bare local number, e.g.
 * "024 123 4567", is genuinely ambiguous without one).
 *
 * Deliberately styled as plain text at the same size/color as the phone
 * number next to it, not a separate pill/card — this sits inside the same
 * destination field as the digits themselves (see destinationRow in
 * SwapScreen.tsx), so it should read as one phone number ("+233 24 123
 * 4567"), not a control bolted on beside it.
 */
export function CountrySelect({ countryCode, onPress }: CountrySelectProps) {
  const current = countryCode ? PHONE_COUNTRIES.find((country) => country.code === countryCode) : null;

  return (
    <Pressable
      testID="country-select"
      accessibilityRole="button"
      accessibilityLabel={current ? `Country, currently ${current.name}` : 'Choose the country for this phone number'}
      style={styles.chip}
      onPress={onPress}
    >
      {current ? (
        <>
          <Image source={{ uri: `${FLAG_CDN}/${current.iso}.png` }} style={styles.flag} resizeMode="cover" />
          <Text style={styles.code}>+{current.code}</Text>
        </>
      ) : (
        <Text style={styles.codePlaceholder}>Country</Text>
      )}
      <ChevronDown size={13} color={swapColors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flag: {
    width: 18,
    height: 13,
    borderRadius: 2,
    backgroundColor: swapColors.subcard,
  },
  // Same family/size/color as `destinationInput` (SwapScreen.tsx) — this
  // needs to look like the first part of that text, not a differently
  // styled label next to it.
  code: {
    fontFamily: swapFonts.label,
    fontSize: 20,
    color: swapColors.textPrimary,
  },
  codePlaceholder: {
    fontFamily: swapFonts.label,
    fontSize: 20,
    color: swapColors.textMuted,
  },
});
