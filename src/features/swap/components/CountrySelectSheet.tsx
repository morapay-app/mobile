import { Image, ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';

import { swapColors, swapFonts } from '../theme';
import { PHONE_COUNTRIES } from '../destinationDetect';
import { FLAG_CDN } from '../data/tokens';
import { SheetShell } from './SheetShell';

export type CountrySelectSheetProps = {
  visible: boolean;
  /** ITU-T calling code digits (no '+'), e.g. '233' for Ghana. */
  countryCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
};

/**
 * The country picker for the destination field's phone number, as a sheet
 * rather than the anchored dropdown it used to be — see SheetShell's doc for
 * why an anchored dropdown couldn't be dismissed by tapping outside it here.
 *
 * Row test IDs (`country-option-<code>`) are unchanged from the old dropdown
 * on purpose: what moved is where this renders, not what it does.
 */
export function CountrySelectSheet({ visible, countryCode, onSelect, onClose }: CountrySelectSheetProps) {
  return (
    <SheetShell
      visible={visible}
      onClose={onClose}
      testID="country-select-sheet"
      title="Choose Country"
      subtitle="This is the calling code your number gets sent with."
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {PHONE_COUNTRIES.map((country) => {
          const selected = country.code === countryCode;
          return (
            <Pressable
              key={country.code}
              testID={`country-option-${country.code}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={styles.row}
              onPress={() => onSelect(country.code)}
            >
              <Image source={{ uri: `${FLAG_CDN}/${country.iso}.png` }} style={styles.flag} resizeMode="cover" />
              <View style={styles.info}>
                <Text style={styles.name}>{country.name}</Text>
              </View>
              <Text style={styles.code}>+{country.code}</Text>
              {selected && <Check size={15} color={swapColors.pillActive} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 360,
  },
  content: {
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  flag: {
    width: 28,
    height: 20,
    borderRadius: 3,
    backgroundColor: swapColors.subcard,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 15,
    color: swapColors.textPrimary,
  },
  code: {
    fontFamily: swapFonts.body,
    fontSize: 13,
    color: swapColors.textMuted,
  },
});
