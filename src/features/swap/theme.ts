/**
 * Colors lifted from the swap/withdrawal design board (originally a pink
 * hero block, cream cards, deep-purple text, mint portfolio card, black
 * segmented toggle). The accent has since moved off that board's pink to
 * the real Morapay brand green — sampled directly from the live logo
 * (morapay.io/logo.png: a deep-teal #023436 square with an "m" glyph in a
 * #38d690/#3adb93 mint-green gradient) and confirmed against the landing
 * site's own palette (frontend/apps/landing — `--primary: #023436`,
 * `#9fe870`/`#8edc5c` mint-greens throughout). Every place that used to be
 * pink already routed through these named tokens, not a hardcoded literal,
 * so this was a one-file change.
 *
 * This is a deliberately separate, light palette from the dark Munckins
 * theme in `src/theme/` — the two visual languages don't mix, so Swap owns
 * its own tokens rather than bending the global theme to fit both.
 *
 * Fonts reuse Manrope (bold/extrabold, for big numbers and headings) and
 * Instrument Sans (labels/body) already loaded by `useAppFonts` — visually
 * the closest match to the board's rounded geometric sans without pulling
 * in a third typeface.
 */

export const swapColors = {
  canvas: '#EFEEE2', // page background behind the hero block
  hero: '#FFFFFF', // main page background (was pink in the board, now white)
  card: '#F8F6EC', // cream card surface
  subcard: '#EDEBDF', // nested "you will receive" surface
  divider: '#DAD6C6',

  textPrimary: '#2B0A30', // deep purple, headings + big numbers
  textMuted: '#8A8578',
  textOnDark: '#F8F6EC',

  pillActive: '#38D690', // real brand green (logo glyph), selected quick-pick pill
  pillInactive: '#DFF6EA', // pale, cream-tinted mint — same relationship pale-pink had to the old accent
  pillInactiveText: '#0F5C3E', // dark forest green, same family as `portfolioText` below

  buttonPrimaryBg: '#4CDB9C',
  buttonPrimaryText: '#2B0A30',

  toggleTrack: '#1C1B1A', // black segmented-control pill
  toggleThumb: '#FFFFFF',
  toggleActiveText: '#1C1B1A',
  toggleInactiveText: '#FFFFFF',

  successBg: '#2E0A33', // transaction-success dark panel
  successCard: '#F8F6EC',

  portfolioBg: '#AEEFE9', // mint card
  portfolioCard: '#CEF5F0',
  portfolioText: '#0C3A35',

  // Warning treatment for blocked button/chip states (insufficient funds,
  // low liquidity) — same family as the rest of the palette (warm, not a
  // stock Material red) so it reads as "this app's warning," not a foreign color.
  warningBg: '#F7D9D3',
  warningText: '#8A2E1E',

  // A completed step/transaction needs an unambiguous "done" signal a warm
  // palette otherwise has no equivalent for — the one plain green in the
  // theme, used only for that.
  successGreen: '#1FAE5C',
} as const;

export const swapRadii = {
  hero: 40,
  card: 32,
  subcard: 24,
  pill: 9999,
} as const;

export const swapFonts = {
  numberBold: 'Manrope_800ExtraBold',
  headingBold: 'Manrope_700Bold',
  headingSemiBold: 'Manrope_600SemiBold',
  label: 'InstrumentSans_500Medium',
  body: 'InstrumentSans_400Regular',
} as const;
