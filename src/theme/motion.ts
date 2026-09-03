/**
 * Motion durations (ms), matching the 200-700ms transitions used across
 * munckins-web for hovers, reveals, and hero image scaling.
 */
export const motion = {
  fast: 200, // micro-interactions: nav underline, small hovers
  base: 300, // default transition (buttons, cards, icon rotate)
  slow: 700, // large image/hero scale transitions
} as const;

export type MotionToken = keyof typeof motion;
