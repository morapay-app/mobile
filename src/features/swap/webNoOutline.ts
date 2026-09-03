import { Platform, type TextStyle } from 'react-native';

/**
 * react-native-web draws a default focus ring on focused TextInputs.
 * `outlineStyle: 'none'` is a real, supported style on web but isn't part of
 * RN's cross-platform TextStyle typings, hence the cast — safe since this
 * only ever runs on web.
 */
export const noOutlineStyle: TextStyle | null =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;
