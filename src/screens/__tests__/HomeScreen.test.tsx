import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from '../HomeScreen';
import { ThemeProvider } from '../../theme';

// react-native-safe-area-context waits for a real layout event before
// rendering children; there's no native layout pass in the test renderer,
// so we hand it fixed metrics up front (as its own docs recommend for tests).
const testMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderHomeScreen() {
  return render(
    <SafeAreaProvider initialMetrics={testMetrics}>
      <ThemeProvider>
        <HomeScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('HomeScreen', () => {
  it('renders the primary CTA', async () => {
    await renderHomeScreen();
    expect(screen.getByRole('button', { name: 'get started' })).toBeTruthy();
  });

  it('renders the lowercase headline', async () => {
    await renderHomeScreen();
    expect(screen.getByText('your money, in control')).toBeTruthy();
  });
});
