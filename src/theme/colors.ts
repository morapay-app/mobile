/**
 * Color tokens lifted from munckins-web (content/pages/*.html).
 * Source: /Users/kaleel/Documents/projects/startups/munckins-web
 *
 * Munckins is a dark-first brand: near-black layered surfaces, white text,
 * a single Coinbase-blue accent used sparingly, and hairline (low-opacity
 * white) borders instead of filled dividers. A handful of sections flip to
 * a bright white surface for contrast — those are modeled as `light` below,
 * not as a separate "light mode": this app is dark by default and stays
 * dark, the same way munckins-web does.
 */

export const palette = {
  black: '#000000',
  white: '#ffffff',

  // Background layers, darkest to lightest
  bg950: '#060708',
  bg900: '#08090b',
  bg850: '#090a0c',
  bg800: '#0a0b0d',
  bg750: '#0b0c0f',
  bg700: '#101214',
  bg650: '#14161a',

  // Light surface (used sparingly, for high-contrast sections/cards)
  offWhite: '#f1f2ef',

  // Text
  gray400: '#8a9099',
  gray500: '#6b7280',
  gray600: '#585f69',
  onLight: '#14150f',

  // Brand
  blue: '#0052FF',
  green: '#118a49',
} as const;

export const colors = {
  background: {
    base: palette.bg950,
    panel: palette.bg900,
    panelAlt: palette.bg850,
    elevated: palette.bg800,
    elevatedAlt: palette.bg750,
    card: palette.bg700,
    cardAlt: palette.bg650,
    light: palette.white,
    lightAlt: palette.offWhite,
  },
  text: {
    primary: palette.white,
    onLight: palette.onLight,
    muted: palette.gray400,
    subtle: palette.gray500,
    faint: palette.gray600,
    inverse: palette.onLight,
  },
  border: {
    hairline: 'rgba(255,255,255,0.10)',
    hairlineStrong: 'rgba(255,255,255,0.15)',
    onLight: 'rgba(0,0,0,0.15)',
  },
  accent: {
    default: palette.blue,
    success: palette.green,
  },
  button: {
    primaryBg: palette.white,
    primaryText: palette.bg950,
    secondaryBorder: 'rgba(255,255,255,0.15)',
    secondaryText: palette.white,
  },
} as const;

export type ColorTokens = typeof colors;
