import { useFonts } from 'expo-font';

import { fontAssets } from './typography';

/** Loads every font weight the theme references. Returns `[loaded, error]`. */
export function useAppFonts() {
  return useFonts(fontAssets);
}
