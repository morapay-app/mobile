import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { swapColors, swapFonts, swapRadii } from './features/swap/theme';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Nothing in this app catches a render-time crash — none of the screens are
 * wrapped in anything like this, so an uncaught exception (e.g. reading a
 * field off a wallet object the SDK pushed into state before every field
 * was populated — see useWallet.ts's `wallet.chain?.` guard) takes the
 * whole app down with it, with nothing recoverable on screen. This is the
 * one net for that: catches it, shows a plain retry screen in the app's own
 * palette (not a bare RN redbox/crash), and "Try Again" just re-renders the
 * children — enough to recover from a one-off bad render like a stale
 * wallet object without needing to force-quit and relaunch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Uncaught render error', error);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>Please try again.</Text>
          <Pressable testID="error-boundary-retry" accessibilityRole="button" onPress={this.handleRetry} style={styles.button}>
            <Text style={styles.buttonLabel}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: swapColors.hero,
  },
  title: {
    fontFamily: swapFonts.headingBold,
    fontSize: 18,
    color: swapColors.textPrimary,
  },
  subtitle: {
    fontFamily: swapFonts.body,
    fontSize: 14,
    color: swapColors.textMuted,
    marginBottom: 8,
  },
  button: {
    backgroundColor: swapColors.buttonPrimaryBg,
    borderRadius: swapRadii.pill,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonLabel: {
    fontFamily: swapFonts.headingSemiBold,
    fontSize: 15,
    color: swapColors.buttonPrimaryText,
  },
});
