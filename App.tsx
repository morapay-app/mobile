import { useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';

import { useAppFonts } from './src/theme';
import { useViewportHeight } from './src/useViewportHeight';
import { DynamicRoot } from './src/dynamic/DynamicRoot';
import { ErrorBoundary } from './src/ErrorBoundary';
import { swapColors } from './src/features/swap/theme';
import { SwapCardSkeleton } from './src/features/swap/components/SwapCardSkeleton';
import { RootNavigator } from './src/navigation/RootNavigator';
import { linking } from './src/navigation/linking';
import { TransactionStoreProvider } from './src/features/transactions/TransactionStoreContext';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useAppFonts();
  const viewportHeight = useViewportHeight();

  useEffect(() => {
    if (fontError) {
      // Fonts failing to load shouldn't block the app — fall back to system font.
      console.warn('Failed to load app fonts', fontError);
    }
  }, [fontError]);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Native: the splash screen (kept up via preventAutoHideAsync above)
  // still covers this, so it's never actually seen there. Web has no
  // equivalent overlay, so without this the page would otherwise be a
  // blank flash of `swapColors.hero` until the fonts resolve.
  if (!fontsLoaded && !fontError) {
    return (
      <View style={[{ flex: 1, backgroundColor: swapColors.hero }, Platform.OS === 'web' && { height: viewportHeight }]}>
        <SwapCardSkeleton />
      </View>
    );
  }

  return (
    <DynamicRoot>
      <ErrorBoundary>
        <SafeAreaProvider>
          <View
            style={[
              { flex: 1, backgroundColor: swapColors.hero },
              // An explicit pixel height (rather than `flex: 1` alone) stands on
              // its own regardless of the surrounding html/body sizing on web —
              // see useViewportHeight for why that surrounding chain can't be
              // trusted on mobile browsers.
              Platform.OS === 'web' && { height: viewportHeight },
            ]}
            onLayout={onLayoutRootView}
          >
            <TransactionStoreProvider>
              <NavigationContainer linking={linking} fallback={<SwapCardSkeleton />}>
                <RootNavigator />
              </NavigationContainer>
            </TransactionStoreProvider>
            <StatusBar style="dark" />
          </View>
        </SafeAreaProvider>
      </ErrorBoundary>
    </DynamicRoot>
  );
}
