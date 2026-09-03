import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type TypeVariant } from '../theme';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  color?: string;
};

/**
 * Themed text primitive. Applies the font family/size/tracking for a given
 * `variant`, and lowercases content for variants munckins-web sets in
 * lowercase (headings, labels, nav, buttons) — matching its
 * `text-transform: lowercase` convention.
 */
export function Text({ variant = 'body', color, style, children, ...rest }: TextProps) {
  const theme = useTheme();
  const variantStyle = theme.typeVariants[variant];

  const content =
    variantStyle.lowercase && typeof children === 'string' ? children.toLowerCase() : children;

  return (
    <RNText
      style={[
        {
          fontFamily: variantStyle.fontFamily,
          fontSize: variantStyle.fontSize,
          lineHeight: variantStyle.lineHeight,
          letterSpacing: variantStyle.letterSpacing,
          color: color ?? theme.colors.text.primary,
        },
        style,
      ]}
      {...rest}
    >
      {content}
    </RNText>
  );
}
