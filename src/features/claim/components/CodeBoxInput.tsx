import { useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { swapColors, swapFonts } from '../../swap/theme';

export type CodeBoxInputProps = {
  /** How many characters this code has — OTP is always 6 digits, the claim
   * code is always 6 alphanumeric characters (see `generateClaimOtp`/
   * `generateClaimCode` in core's claim-code.ts, the actual source of both). */
  length: number;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'number-pad' | 'default';
  /** Uppercases as it's typed — the claim code is generated uppercase-only. */
  uppercase?: boolean;
  testID?: string;
  autoFocus?: boolean;
};

/**
 * One box per character instead of a single free-text field — the modern
 * "OTP input" pattern, and a real usability win here specifically: both
 * codes this app asks for (the OTP and the claim code) are a fixed, known
 * length, so showing that length up front (six empty boxes) tells the user
 * exactly how much they still have left to type, which a single blank
 * field never does.
 *
 * Built from `length` real `TextInput`s (not one field with custom
 * rendering) so the platform's own keyboard, autofill/SMS-code suggestions,
 * and paste behavior all keep working — pasting a full code into any box
 * distributes it across the rest starting there, same as native OTP fields
 * elsewhere on both platforms.
 */
export function CodeBoxInput({ length, value, onChangeText, keyboardType = 'default', uppercase, testID, autoFocus }: CodeBoxInputProps) {
  const inputs = useRef<(TextInput | null)[]>([]);

  const chars = Array.from({ length }, (_, i) => value[i] ?? '');

  const setCharAt = (index: number, char: string) => {
    const next = chars.slice();
    next[index] = char;
    onChangeText(next.join('').slice(0, length));
  };

  const handleChangeText = (index: number, text: string) => {
    const clean = (uppercase ? text.toUpperCase() : text).replace(keyboardType === 'number-pad' ? /\D/g : /\s/g, '');
    if (clean.length <= 1) {
      setCharAt(index, clean);
      if (clean.length === 1 && index < length - 1) inputs.current[index + 1]?.focus();
      return;
    }
    // More than one character landed in a single box — a paste (or an SMS
    // autofill on some Android keyboards), not normal typing. Spread it
    // across this box and the ones after it instead of truncating to one
    // character and discarding the rest.
    const combined = (value.slice(0, index) + clean).slice(0, length);
    onChangeText(combined);
    const lastFilled = Math.min(index + clean.length, length) - 1;
    inputs.current[lastFilled]?.blur();
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !chars[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      setCharAt(index - 1, '');
    }
  };

  return (
    <View style={styles.row} testID={testID}>
      {chars.map((char, index) => (
        <TextInput
          key={index}
          ref={(el) => {
            inputs.current[index] = el;
          }}
          testID={testID ? `${testID}-${index}` : undefined}
          value={char}
          onChangeText={(text) => handleChangeText(index, text)}
          onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
          keyboardType={keyboardType}
          autoCapitalize={uppercase ? 'characters' : 'none'}
          autoCorrect={false}
          maxLength={length} // not 1 — see the paste-handling branch above
          autoFocus={autoFocus && index === 0}
          style={[styles.box, char.length > 0 && styles.boxFilled]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  // Transparent, square — matches the plain-text-field treatment the rest
  // of the claim form now uses (see ClaimScreen.tsx's own `input` style),
  // just with a full border instead of only a bottom one so six adjacent
  // boxes still read as separate cells rather than one continuous line.
  box: {
    width: 44,
    height: 52,
    borderWidth: 1.5,
    borderColor: swapColors.divider,
    backgroundColor: 'transparent',
    fontFamily: swapFonts.numberBold,
    fontSize: 20,
    color: swapColors.textPrimary,
    textAlign: 'center',
  },
  boxFilled: {
    borderColor: swapColors.pillActive,
  },
});
