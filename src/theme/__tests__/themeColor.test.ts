// This project's jest preset runs a plain Node environment (no DOM) — the
// same environment the real app's own React Native code runs in on native.
// `updateThemeColor` is a web-only utility (guarded on `Platform.OS` and
// `typeof document`), so exercising it here means mocking both by hand
// rather than switching this whole file to a jsdom environment.
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

describe('updateThemeColor', () => {
  let meta: { getAttribute: () => string | null; setAttribute: jest.Mock };
  let documentElement: { style: { backgroundColor: string } };
  let body: { style: { backgroundColor: string } };

  beforeEach(() => {
    jest.resetModules();
    meta = { getAttribute: () => null, setAttribute: jest.fn() };
    documentElement = { style: { backgroundColor: '' } };
    body = { style: { backgroundColor: '' } };
    (global as { document?: unknown }).document = {
      getElementById: (id: string) => (id === 'theme-color-meta' ? meta : null),
      documentElement,
      body,
    };
  });

  afterEach(() => {
    delete (global as { document?: unknown }).document;
  });

  it('updates the theme-color meta tag', () => {
    const { updateThemeColor } = require('../themeColor');
    updateThemeColor('#140A19');
    expect(meta.setAttribute).toHaveBeenCalledWith('content', '#140A19');
  });

  // The real bug this covers: on iOS/PWA with viewport-fit=cover, the
  // notch/home-indicator area is part of the page's own layout viewport,
  // not native chrome — the theme-color meta tag alone does nothing to it.
  // What actually shows through there is <html>/<body>'s own background.
  it('also paints html and body, since that is what actually shows behind the notch/home-indicator safe-area insets', () => {
    const { updateThemeColor } = require('../themeColor');
    updateThemeColor('#140A19');
    expect(documentElement.style.backgroundColor).toBe('#140A19');
    expect(body.style.backgroundColor).toBe('#140A19');
  });

  it('reverting to the default color un-paints both back to white', () => {
    const { updateThemeColor, DEFAULT_THEME_COLOR } = require('../themeColor');
    updateThemeColor('#140A19');
    updateThemeColor(DEFAULT_THEME_COLOR);
    expect(documentElement.style.backgroundColor).toBe(DEFAULT_THEME_COLOR);
    expect(body.style.backgroundColor).toBe(DEFAULT_THEME_COLOR);
  });
});
