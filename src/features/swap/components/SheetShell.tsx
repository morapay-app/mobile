import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { swapColors, swapFonts, swapRadii } from '../theme';

const DISMISS_THRESHOLD = 120;
// Far enough below the fold for the spring-in to read as "rising from the
// bottom edge" at any sheet height these small pickers reach — same value
// NetworkSelectSheet uses.
const OFFSCREEN_OFFSET = 400;

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
 * TokenSelectSheet and NetworkSelectSheet still carry their own copies of this
 * mechanic; they predate this shell and are deliberately left alone rather
 * than churned. New sheets should use this.
 */
export function SheetShell({ visible, onClose, title, subtitle, testID, centerHeader, children }: SheetShellProps) {
  const translateY = useRef(new Animated.Value(OFFSCREEN_OFFSET)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(OFFSCREEN_OFFSET);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 10, tension: 70 }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  const close = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: OFFSCREEN_OFFSET, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_THRESHOLD) {
          close();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 10, tension: 70 }).start();
        }
      },
    }),
  ).current;

  if (!visible) return null;

  return (
    <>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable
          testID={testID ? `${testID}-backdrop` : undefined}
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>

      <Animated.View testID={testID} style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View {...panResponder.panHandlers} style={styles.handleArea}>
          <View style={styles.handle} />
        </View>

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
    paddingBottom: 24,
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
