import { useCallback, useEffect, type ReactNode } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';

import { useAppFonts } from './src/theme';
import { useViewportHeight } from './src/useViewportHeight';
import { DynamicRoot } from './src/dynamic/DynamicRoot';
import { ErrorBoundary } from './src/ErrorBoundary';
import { swapColors } from './src/features/swap/theme';
import { SwapCardSkeleton } from './src/features/swap/components/SwapCardSkeleton';
import { RootNavigator } from './src/navigation/RootNavigator';
import { linking } from './src/navigation/linking';
import { TransactionStoreProvider, useTransactionStore } from './src/features/transactions/TransactionStoreContext';

SplashScreen.preventAutoHideAsync();

/**
 * The one sized, full-bleed container everything else renders inside —
 * split out so it can call `useSafeAreaInsets()`, which only works nested
 * inside `SafeAreaProvider` (so both branches below now render under one,
 * instead of only the fonts-loaded branch having it).
 *
 * On web, `visualViewport.height` (what `useViewportHeight` reports) does
 * NOT reliably include the notch/home-indicator safe-area, even with
 * `viewport-fit=cover` set in public/index.html — confirmed live: without
 * adding the insets back in here, this container measured shorter than the
 * real screen, leaving a real gap above/below it that showed the raw HTML
 * document's own background instead of anything this app actually renders.
 *
 * Sizing this container to the TRUE full height is what makes that gap
 * disappear — a bottom sheet's dark backdrop and light ticket-cream body,
 * a full-screen dark overlay like ReceiptModal, or (most of the time)
 * just the plain app background, all reach the real top and bottom edges
 * and paint them with whatever color is ACTUALLY there. That's the real
 * fix for "the header/footer color should match the screen": it's no
 * longer a single hardcoded guess (see theme/themeColor.ts's doc for why
 * that alone was never going to be right for a sheet whose top is a dark
 * scrim and whose bottom is its own light body) — it's just this
 * container's own children rendering correctly, per pixel.
 */
// This is a phone-shaped UI (fixed breakpoints up to ~744pt in
// SwapScreen.tsx, sheets that slide up from a screen-width bottom edge,
// etc.) — full-bleed on a real desktop browser window stretches every card,
// pill, and sheet to widths none of that layout logic was ever tuned for.
// Capping the CONTENT at a phone-ish column and letting only the
// background go full-bleed keeps the design intentional at any window
// width instead of just accidentally wide.
const WEB_CONTENT_MAX_WIDTH = 480;

function AppRoot({ children, onLayout }: { children: ReactNode; onLayout?: () => void }) {
  const viewportHeight = useViewportHeight();
  const insets = useSafeAreaInsets();
  const height = Platform.OS === 'web' ? viewportHeight + insets.top + insets.bottom : undefined;

  return (
    <View style={[{ flex: 1, backgroundColor: swapColors.hero }, height !== undefined && { height }]} onLayout={onLayout}>
      {Platform.OS === 'web' ? (
        <View style={{ flex: 1, width: '100%', maxWidth: WEB_CONTENT_MAX_WIDTH, alignSelf: 'center' }}>{children}</View>
      ) : (
        children
      )}
    </View>
  );
}

/**
 * Critical-path hydration gate — blocks the real router/UI from mounting
 * until `pendingTransactions` (TransactionStoreContext's own AsyncStorage
 * read) has resolved, same reasoning SwapScreen.tsx already applies to the
 * last-traded token pair (see its own `preferenceResolved` doc): a pill
 * that pops in a few ms after first paint because its backing data was
 * still loading reads as a real (if small) glitch, not a feature. Lives
 * inside `TransactionStoreProvider` (not the outer `App()`) so it can read
 * the hydration flag `useTransactionStore()` exposes.
 */
function HydratedApp({ fontsReady }: { fontsReady: boolean }) {
  const { hydrated } = useTransactionStore();
  const ready = fontsReady && hydrated;

  const onLayoutRootView = useCallback(async () => {
    if (ready) {
      await SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    // Native: the splash screen (kept up via preventAutoHideAsync above)
    // still covers this, so it's never actually seen there. Web has no
    // equivalent overlay, so without this the page would otherwise be a
    // blank flash of `swapColors.hero` until fonts + hydration resolve —
    // both are typically sub-100ms, so in practice this rarely paints at
    // all before the real branch below takes over.
    return (
      <AppRoot>
        <SwapCardSkeleton />
      </AppRoot>
    );
  }

  return (
    <AppRoot onLayout={onLayoutRootView}>
      <NavigationContainer linking={linking} fallback={<SwapCardSkeleton />}>
        <RootNavigator />
      </NavigationContainer>
      <StatusBar style="dark" />
    </AppRoot>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useAppFonts();
  const fontsReady = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (fontError) {
      // Fonts failing to load shouldn't block the app — fall back to system font.
      console.warn('Failed to load app fonts', fontError);
    }
  }, [fontError]);

  return (
    <DynamicRoot>
      <ErrorBoundary>
        <SafeAreaProvider>
          {/* Mounted unconditionally (not just once fonts are ready) so its
              own AsyncStorage read starts immediately, in parallel with
              font loading, rather than only after fonts finish. */}
          <TransactionStoreProvider>
            <HydratedApp fontsReady={fontsReady} />
          </TransactionStoreProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </DynamicRoot>
  );
}
