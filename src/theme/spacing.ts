/**
 * 4px-based spacing scale, matching the rhythm used across munckins-web's
 * Tailwind classes (gap-2/4/5/9/16, py-20/28, px-6/10, ...).
 */
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 40,
  '3xl': 56,
  '4xl': 80,
} as const;

export type SpacingToken = keyof typeof spacing;
