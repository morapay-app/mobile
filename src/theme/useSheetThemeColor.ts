import { useEffect } from 'react';

import { DEFAULT_THEME_COLOR, updateThemeColor } from './themeColor';

/**
 * Matches the system status bar to a bottom sheet's dark backdrop while it's
 * open, reverting to the app's default background color once it closes (or
 * unmounts while still open) — see AGENTS.md's edge-to-edge UI requirement.
 * `backdropColor` should be a solid hex, not the backdrop `View`'s own
 * translucent rgba — `theme-color` has no alpha channel to speak of.
 *
 * If more than one sheet were open at once this would just be last-effect-
 * wins, same as any other global-singleton DOM mutation — not a concern
 * today since this app's sheets are opened one at a time.
 */
export function useSheetThemeColor(visible: boolean, backdropColor: string): void {
  useEffect(() => {
    if (visible) updateThemeColor(backdropColor);
    return () => updateThemeColor(DEFAULT_THEME_COLOR);
  }, [visible, backdropColor]);
}
