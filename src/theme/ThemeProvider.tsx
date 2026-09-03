import { createContext, useContext, type ReactNode } from 'react';

import { theme, type Theme } from './theme';

const ThemeContext = createContext<Theme>(theme);

/**
 * Munckins is a single, dark-first brand aesthetic rather than a
 * user-toggleable light/dark system, so this provider just makes the token
 * object available via context (for consistency and future extension)
 * instead of switching between multiple palettes.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
