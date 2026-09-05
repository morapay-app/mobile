import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

export type StepArtworkProps = {
  /** Raw SVG source — see `../illustrations/index.ts`. */
  xml: string;
  /** The source SVG's own `width / height` from its `viewBox` — passed in
   * per illustration (each unDraw piece has its own natural proportions)
   * rather than assumed, so it scales without stretching. */
  aspectRatio: number;
};

/**
 * Full illustration artwork shown above a claim step, replacing the
 * earlier plain icon-in-a-circle badge — real unDraw pieces (see
 * `../illustrations/`'s own doc) recolored to the brand mint, not a
 * substitute drawn from a generic icon set. Sized by width with the
 * height following the source's real aspect ratio, capped so it never
 * dominates the card on a wide/tablet screen.
 */
export function StepArtwork({ xml, aspectRatio }: StepArtworkProps) {
  return (
    <View style={[styles.wrap, { aspectRatio }]}>
      <SvgXml xml={xml} width="100%" height="100%" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: 240,
    alignSelf: 'center',
    marginBottom: 4,
  },
});
