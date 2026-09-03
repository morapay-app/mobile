/**
 * Border radii, matching munckins-web's near-total reliance on `rounded-full`
 * pills for interactive elements, with a couple of card radii for panels.
 */
export const radii = {
  none: 0,
  sm: 9, // icon tiles, small chips — rounded-[9px]
  md: 11, // logo/avatar containers — rounded-[11px]
  lg: 22, // cards — rounded-2xl
  xl: 32, // large feature panels — rounded-[2rem]
  full: 9999, // pills, primary buttons, icon buttons — rounded-full
} as const;

export type RadiusToken = keyof typeof radii;
