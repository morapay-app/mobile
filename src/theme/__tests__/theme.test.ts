import { theme } from '../theme';

const hexColor = /^#[0-9a-fA-F]{6}$/;
const rgbaColor = /^rgba\(/;

describe('theme tokens', () => {
  it('defines every background/text/border color as a real color value', () => {
    const groups = [theme.colors.background, theme.colors.text, theme.colors.border];
    for (const group of groups) {
      for (const value of Object.values(group)) {
        expect(hexColor.test(value) || rgbaColor.test(value)).toBe(true);
      }
    }
  });

  it('uses the munckins accent blue', () => {
    expect(theme.colors.accent.default).toBe('#0052FF');
  });

  it('keeps the spacing scale strictly increasing', () => {
    const values = Object.values(theme.spacing);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('gives pill controls the full radius token', () => {
    expect(theme.radii.full).toBeGreaterThanOrEqual(9999);
  });

  it('marks display and label variants lowercase, and body copy not lowercase', () => {
    expect(theme.typeVariants.displayLg.lowercase).toBe(true);
    expect(theme.typeVariants.heading.lowercase).toBe(true);
    expect(theme.typeVariants.label.lowercase).toBe(true);
    expect(theme.typeVariants.body.lowercase).toBe(false);
  });

  it('tightens letter spacing as display type gets larger (negative tracking)', () => {
    expect(theme.typeVariants.displayLg.letterSpacing).toBeLessThan(
      theme.typeVariants.displayMd.letterSpacing,
    );
    expect(theme.typeVariants.displayMd.letterSpacing).toBeLessThan(
      theme.typeVariants.heading.letterSpacing,
    );
  });
});
