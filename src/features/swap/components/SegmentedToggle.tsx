import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, View, Text, LayoutChangeEvent } from 'react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';

export type SegmentedToggleProps = {
  options: readonly [string, string];
  value: 0 | 1;
  onChange: (index: 0 | 1) => void;
  /** Smaller footprint, no outer horizontal margin — for nesting inside a
   * card that already provides its own padding (e.g. in place of a plain
   * text label), rather than sitting directly in the page's own margin.
   * Segments hug their own label instead of splitting the track 50/50, so
   * two labels of very different lengths ("Send" / "Receive") don't force
   * the shorter one to sit awkwardly centered in an oversized box. */
  compact?: boolean;
};

type SegmentLayout = { x: number; width: number };

/**
 * Rounded black pill for switching between two options (Swap / Send), styled
 * after the Stake/Redeem toggle in the design board: dark track, a white
 * rounded thumb sliding under whichever label is active. The thumb's
 * position and width both come from each segment's own measured layout
 * (captured via onLayout) rather than an assumed 50/50 split — correct
 * either way, but it's what lets `compact` size each segment to its actual
 * label instead of forcing both to match widths for the split math to work.
 */
export function SegmentedToggle({ options, value, onChange, compact = false }: SegmentedToggleProps) {
  const segmentLayouts = useRef<[SegmentLayout | null, SegmentLayout | null]>([null, null]);
  const thumbLeft = useRef(new Animated.Value(0)).current;
  const thumbWidth = useRef(new Animated.Value(0)).current;

  const animateTo = (index: 0 | 1) => {
    const layout = segmentLayouts.current[index];
    // Not measured yet (e.g. very first render) — the onLayout that fills
    // this in calls animateTo itself once it lands, so there's nothing to
    // animate to in the meantime.
    if (!layout) return;
    Animated.spring(thumbLeft, { toValue: layout.x, useNativeDriver: false, friction: 10, tension: 80 }).start();
    Animated.spring(thumbWidth, { toValue: layout.width, useNativeDriver: false, friction: 10, tension: 80 }).start();
  };

  const handleSegmentLayout = (index: 0 | 1) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    segmentLayouts.current[index] = { x, width };
    if (index === value) animateTo(index);
  };

  const handlePress = (index: 0 | 1) => {
    if (index !== value) {
      onChange(index);
    }
    animateTo(index);
  };

  return (
    <View style={[styles.track, compact && styles.trackCompact]}>
      <Animated.View
        style={[styles.thumb, compact && styles.thumbCompact, { left: thumbLeft, width: thumbWidth }]}
      />
      {options.map((label, index) => {
        const isActive = index === value;
        const activeColor = compact ? swapColors.textPrimary : swapColors.toggleActiveText;
        const inactiveColor = compact ? swapColors.textMuted : swapColors.toggleInactiveText;
        return (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            style={[styles.segment, compact && styles.segmentCompact]}
            onLayout={handleSegmentLayout(index as 0 | 1)}
            onPress={() => handlePress(index as 0 | 1)}
          >
            <Text style={[styles.label, compact && styles.labelCompact, { color: isActive ? activeColor : inactiveColor }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: swapColors.toggleTrack,
    borderRadius: swapRadii.pill,
    padding: 4,
    marginHorizontal: 24,
    height: 52,
    position: 'relative',
    overflow: 'hidden',
  },
  trackCompact: {
    marginHorizontal: 0,
    height: 40,
    // No inset — the base track's `padding: 4` exists to keep its pill
    // background from touching the thumb's edges, but a transparent track
    // has no background to inset from, and any padding here would push the
    // first segment's label out of alignment with the amount input below,
    // which shares the same card padding with nothing extra of its own.
    padding: 0,
    // Hugs its own two segments instead of stretching to fill whatever
    // width the parent (View defaults to `alignItems: 'stretch'`) offers —
    // this is meant to read as a small secondary control, not a second
    // full-width toggle competing with the Swap/Send one above it.
    alignSelf: 'flex-start',
    // No black pill fill here — a solid black track reads as a second,
    // equally-important toggle sitting right under the real Swap/Send one,
    // which is exactly the "competing control" this is meant to avoid.
    backgroundColor: 'transparent',
    // Explicit spacing between "Send" and "Receive" now that each segment
    // hugs its own label instead of splitting the track into two equal
    // fixed-width halves — same rhythm as the app's other rows of distinct,
    // separately-tappable items (CountrySelect's row, FooterInfo's items).
    gap: 10,
  },
  thumb: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    backgroundColor: swapColors.toggleThumb,
    borderRadius: swapRadii.pill,
  },
  // Subtle cream fill rather than the primary toggle's white-on-black —
  // enough to show which side is selected without competing for attention.
  thumbCompact: {
    backgroundColor: swapColors.subcard,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  // Hugs its own label instead of the base segment's `flex: 1` (equal
  // 50/50 split) — "Send" and "Receive" are meaningfully different
  // lengths, and forcing them to match widths is what centered "Send" in
  // an oversized box (reading as indented, misaligned with the amount
  // input below) while leaving "Receive" comparatively cramped.
  segmentCompact: {
    flexGrow: 0,
    flexShrink: 0,
    // Explicit 'auto', not just omitting flexBasis — the base "segment"
    // style's `flex: 1` implies `flexBasis: 0%` on web, which otherwise
    // wins in the cascade and collapses this back to a zero-width box
    // (the same failure mode the old fixed-flexBasis comment described).
    flexBasis: 'auto',
    paddingHorizontal: 8,
  },
  label: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 16,
  },
  labelCompact: {
    fontSize: 13,
  },
});
