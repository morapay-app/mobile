import { colors } from './colors';
import { motion } from './motion';
import { radii } from './radii';
import { spacing } from './spacing';
import { fontFamilies, typeVariants } from './typography';

export const theme = {
  colors,
  spacing,
  radii,
  motion,
  fontFamilies,
  typeVariants,
} as const;

export type Theme = typeof theme;
