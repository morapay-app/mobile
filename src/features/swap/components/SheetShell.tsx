import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { swapColors, swapFonts, swapRadii } from '../theme';

const DISMISS_THRESHOLD = 120;
// Far enough below the fold for the spring-in to read as "rising from the
// bottom edge" at any sheet height these small pickers reach — same value
// NetworkSelectSheet uses.
const OFFSCREEN_OFFSET = 400;
// Tuned to feel like the old Animated.spring(friction: 10, tension: 70) this
// replaced — a little overshoot, settles quickly, never floaty.
const SPRING_CONFIG = { damping: 18, stiffness: 220, mass: 0.9 } as const;

export type SheetShellProps = {
  visible: boolean;
  /** Called once the dismiss animation has finished — a tap on the backdrop
   * or a downward swipe. Selecting a row is the CALLER's business: it should
   * flip `visible` itself, so the sheet unmounts immediately on a choice
   * (same as TokenSelectSheet's own contract with SwapScreen). */
  onClose: () => void;
  title: string;
  subtitle?: string;
  testID?: string;
  /** Centers the title/subtitle instead of the default left alignment —
   * opt-in per sheet since most of these read better left-aligned. */
  centerHeader?: boolean;
  children: ReactNode;
};

/**
 * The shared shell behind this app's small picker sheets — backdrop, spring-in,
 * swipe-to-dismiss, drag handle, and the cream rounded container.
 *
 * It exists because "tap outside to dismiss" is the one thing an anchored,
 * absolutely-positioned dropdown cannot do reliably here. A dropdown nested
 * inside the swap card can't be covered by a screen-level backdrop (its
 * z-index only ever outranks its own siblings, and on Android a touch outside
 * a parent's bounds isn't delivered to its children at all), and RN's own
 * `<Modal>` is off-limits in this codebase — it renders into a separate native
 * surface where `expo-font` faces silently fall back to the system font (see
 * TokenSelectSheet's doc comment). A sheet rendered at the screen root, with a
 * full-screen `Pressable` backdrop, sidesteps all three problems, and it's the
 * pattern the token and network pickers already use.
 *
 * Built on Reanimated + Gesture Handler rather than the old core `Animated`/
 * `PanResponder` this replaced — the drag-to-dismiss handle is exactly the
 * "continuous touch interaction" that pair is for (tracks the finger on the
 * UI thread with zero lag, even mid-quote-fetch or any other JS-thread work),
 * where the plain `Animated` API required manually reading `gesture.dy` off
 * the JS thread on every frame.
 *
 * TokenSelectSheet and NetworkSelectSheet still carry their own copies of this
 * mechanic; they predate this shell and are deliberately left alone rather
 * than churned. New sheets should use this.
 */
export function SheetShell({ visible, onClose, title, subtitle, testID, centerHeader, children }: SheetShellProps) {
  const translateY = useSharedValue(OFFSCREEN_OFFSET);
  const backdropOpacity = useSharedValue(0);
  // The home-indicator inset — 0 on any device/browser without one, or
  // without `viewport-fit=cover` in public/index.html to unlock it. Added
  // on top of the sheet's own bottom padding, not instead of it, so content
  // doesn't sit flush against the inset's edge either.
  //
  // No `useSheetThemeColor` call here (unlike ReceiptModal, which is one
  // uniform full-screen color): this sheet's top (the dark backdrop) and
  // bottom (its own cream `subcard`) are two different real colors, and
  // there's no such thing as a single flat "theme color" that's correct
  // for both. `App.tsx`'s `AppRoot` sizing the app to the TRUE full screen
  // height (insets included) is what actually gets this right — the
  // backdrop and this sheet just paint their own real edges directly, so
  // there's nothing left for a hardcoded override to get wrong.
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      translateY.value = OFFSCREEN_OFFSET;
      translateY.value = withSpring(0, SPRING_CONFIG);
      backdropOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [visible, translateY, backdropOpacity]);

  const close = () => {
    'worklet';
    translateY.value = withTiming(OFFSCREEN_OFFSET, { duration: 220 });
    backdropOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  };

  // Only claims the gesture once the drag is genuinely vertical (and past a
  // few px of slop) — matches the old PanResponder's own
  // `gesture.dy > 4 && abs(dy) > abs(dx)` check, so a mostly-horizontal
  // touch on the handle doesn't get swallowed by this.
  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-15, 15])
    .onChange((event) => {
      if (event.translationY > 0) translateY.value = event.translationY;
    })
    .onFinalize((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        close();
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible) return null;

  return (
    <>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          testID={testID ? `${testID}-backdrop` : undefined}
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>

      <Animated.View
        testID={testID}
        style={[styles.sheet, { paddingBottom: 24 + insets.bottom }, sheetStyle]}
      >
        <GestureDetector gesture={pan}>
          <View style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
        </GestureDetector>

        <View style={[styles.header, centerHeader && styles.headerCentered]}>
          <Text style={[styles.title, centerHeader && styles.textCentered]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, centerHeader && styles.textCentered]}>{subtitle}</Text> : null}
        </View>

        {children}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20,10,25,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: swapColors.subcard,
    borderTopLeftRadius: swapRadii.card,
    borderTopRightRadius: swapRadii.card,
    overflow: 'hidden',
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: swapColors.divider,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 12,
    gap: 4,
  },
  headerCentered: {
    alignItems: 'center',
  },
  textCentered: {
    textAlign: 'center',
  },
  title: {
    fontFamily: swapFonts.headingBold,
    fontSize: 18,
    color: swapColors.textPrimary,
  },
  subtitle: {
    fontFamily: swapFonts.body,
    fontSize: 12,
    color: swapColors.textMuted,
  },
});
