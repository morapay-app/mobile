import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';
import { PHONE_COUNTRIES } from '../destinationDetect';
import { FLAG_CDN } from '../data/tokens';

export type CountrySelectProps = {
  /** ITU-T calling code digits (no '+'), e.g. '233' for Ghana. */
  countryCode: string;
  /** Opens the picker. The list itself lives in `CountrySelectSheet`, rendered
   * at the screen root — an anchored dropdown here could not be dismissed by
   * tapping outside it (see SheetShell's doc comment), so this component is
   * now only the chip that opens it. */
  onPress: () => void;
};

/**
 * Flag + calling-code chip shown before a phone number once the destination
 * field detects one — tapping opens a picker of real ITU-T calling codes so
 * the user can correct the guess (a bare local number, e.g. "024 123 4567",
 * is genuinely ambiguous without one).
 */
export function CountrySelect({ countryCode, onPress }: CountrySelectProps) {
  const current = PHONE_COUNTRIES.find((country) => country.code === countryCode) ?? PHONE_COUNTRIES[0];

  return (
    <View>
      <Pressable
        testID="country-select"
        accessibilityRole="button"
        accessibilityLabel={`Country, currently ${current.name}`}
        style={styles.chip}
        onPress={onPress}
      >
        <Image source={{ uri: `${FLAG_CDN}/${current.iso}.png` }} style={styles.flag} resizeMode="cover" />
        <Text style={styles.code}>+{current.code}</Text>
        <ChevronDown size={13} color={swapColors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: swapRadii.pill,
    backgroundColor: swapColors.card,
  },
  flag: {
    width: 18,
    height: 13,
    borderRadius: 2,
    backgroundColor: swapColors.subcard,
  },
  code: {
    fontFamily: swapFonts.label,
    fontSize: 16,
    color: swapColors.textPrimary,
  },
});
