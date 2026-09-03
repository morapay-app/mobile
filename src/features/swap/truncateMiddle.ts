/** Average glyph width for a proportional sans font, as a fraction of its
 * font size — calibrated against real rendered addresses (hex/base58
 * strings render fairly evenly), same constant SwapScreen's own destination
 * field was built around. Good enough to decide "how much fits," not
 * pixel-perfect layout. */
const DEFAULT_CHAR_WIDTH_RATIO = 0.58;

/** How many characters of a given font size actually fit in a measured
 * pixel width. */
export function charsForWidth(measuredWidth: number, fontSize: number, ratio: number = DEFAULT_CHAR_WIDTH_RATIO): number {
  if (measuredWidth <= 0 || fontSize <= 0) return 0;
  return Math.floor(measuredWidth / (fontSize * ratio));
}

/** "0x123456789...abcd" — collapses `value` to fill exactly `budget`
 * characters, always keeping the last 4 visible after the ellipsis (the
 * part that actually disambiguates one address from another at a glance).
 * A value that already fits within `budget` is returned unchanged. */
export function truncateMiddle(value: string, budget: number): string {
  const BACK = 4;
  const ELLIPSIS = '...';
  const minBudget = BACK + ELLIPSIS.length + 1; // room for at least 1 front char
  if (budget < minBudget || value.length <= budget) return value;
  const front = budget - BACK - ELLIPSIS.length;
  return `${value.slice(0, front)}${ELLIPSIS}${value.slice(-BACK)}`;
}
