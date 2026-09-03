import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans';
import { Cormorant_400Regular, Cormorant_600SemiBold } from '@expo-google-fonts/cormorant';

/**
 * Typeface pairing lifted from munckins-web:
 *  - Manrope: display/headings — var(--font-manrope)
 *  - Instrument Sans: body copy, nav, labels, buttons — var(--font-instrument-sans)
 *  - Cormorant: rare editorial/serif accent — var(--font-cormorant)
 *
 * Font files are loaded at runtime via `useAppFonts()` (see below); until
 * that resolves, React Native falls back to the system font, so callers
 * should gate first paint on `fontsLoaded`.
 */
export const fontAssets = {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  Cormorant_400Regular,
  Cormorant_600SemiBold,
} as const;

export const fontFamilies = {
  displayRegular: 'Manrope_400Regular',
  displayMedium: 'Manrope_500Medium',
  displaySemiBold: 'Manrope_600SemiBold',
  displayBold: 'Manrope_700Bold',
  displayExtraBold: 'Manrope_800ExtraBold',
  bodyRegular: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemiBold: 'InstrumentSans_600SemiBold',
  accentRegular: 'Cormorant_400Regular',
  accentSemiBold: 'Cormorant_600SemiBold',
} as const;

/**
 * munckins-web sets nearly all text — headings included — in lowercase via
 * `text-transform: lowercase`, with negative letter-spacing tightening as
 * size increases. Each variant's `letterSpacing` mirrors the site's
 * `tracking-[...]` values scaled to its `fontSize`.
 */
export const typeVariants = {
  displayLg: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: 56,
    lineHeight: 50,
    letterSpacing: -3.5,
    lowercase: true,
  },
  displayMd: {
    fontFamily: fontFamilies.displayMedium,
    fontSize: 40,
    lineHeight: 38,
    letterSpacing: -2.4,
    lowercase: true,
  },
  heading: {
    fontFamily: fontFamilies.displaySemiBold,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -1.2,
    lowercase: true,
  },
  subheading: {
    fontFamily: fontFamilies.displaySemiBold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.5,
    lowercase: true,
  },
  body: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0.15,
    lowercase: false,
  },
  bodyMedium: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0.15,
    lowercase: false,
  },
  label: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    lowercase: true,
  },
  caption: {
    fontFamily: fontFamilies.bodyRegular,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0,
    lowercase: true,
  },
  accent: {
    fontFamily: fontFamilies.accentRegular,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: 0,
    lowercase: false,
  },
} as const;

export type TypeVariant = keyof typeof typeVariants;
