import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type ViewStyle } from 'react-native';

import { swapColors, swapRadii } from '../theme';

export type SkeletonProps = {
  style?: ViewStyle | ViewStyle[];
  /** Full pulse cycle (fade up + fade down), in ms — shorter reads as
   * "this will resolve any second" (e.g. a quote that's usually back within
   * a debounce + one round trip), longer as "this is a real fetch" (e.g. a
   * whole token catalog). Defaults to the slower, more deliberate pace. */
  duration?: number;
  testID?: string;
};

/**
 * Base pulsing block every skeleton in the app is built from — a shimmering
 * `divider`-colored rectangle whose only job is to occupy the same footprint
 * as the real content it's standing in for, so nothing jumps once that
 * content resolves.
 */
export function Skeleton({ style, duration = 650, testID }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, duration]);

  return <Animated.View testID={testID} style={[styles.base, style, { opacity }]} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: swapColors.divider,
    borderRadius: swapRadii.pill,
  },
});
