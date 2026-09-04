import { Platform } from 'react-native';

/** Must match `public/index.html`'s own `theme-color` default and
 * `swapColors.hero` — keep all three in sync if the app's default
 * background ever changes. */
export const DEFAULT_THEME_COLOR = '#FFFFFF';

/**
 * Mutates the `<meta name="theme-color" id="theme-color-meta">` tag added in
 * `public/index.html` (Android's status bar tint, and Safari's tab-switcher
 * chrome), AND paints `<html>`/`<body>` the same color.
 *
 * The second part is the one that actually matters for the notch/home-
 * indicator area: with `viewport-fit=cover` in place, that region isn't
 * native browser chrome the `theme-color` meta can tint — it's part of the
 * web page's own layout viewport now. Nothing this app renders paints
 * behind the safe-area insets (React Native's own tree stops at the insets
 * on purpose), so whatever's left showing there is literally the
 * `<html>`/`<body>` element's own background — plain white by default,
 * regardless of what `theme-color` said. Setting it here is what actually
 * makes that region "bleed" the right color instead of just tinting a
 * status bar that, in this app's case, was never the thing showing white.
 *
 * No-op on native (there's no DOM) and in any environment without a
 * `document` (tests, SSR).
 */
export function updateThemeColor(color: string): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.setAttribute('content', color);
  document.documentElement.style.backgroundColor = color;
  if (document.body) document.body.style.backgroundColor = color;
}
