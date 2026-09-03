import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ErrorBoundary } from '../ErrorBoundary';

// A plain module-level flag rather than a prop — `Bomb` needs to actually
// re-execute its function body with a *new* value between the initial
// crash and the post-retry render, and a value baked into a prop at the
// parent's last render wouldn't change just because the boundary itself
// re-renders (only the boundary's own subtree re-renders on its own
// setState, not its ancestor, so a prop-driven flag would stay stuck at
// whatever it was on the very first render).
let bombArmed = true;
function Bomb() {
  if (bombArmed) throw new Error('boom');
  return <Text>Recovered</Text>;
}

describe('ErrorBoundary', () => {
  // React logs the caught error to the console by design (componentDidCatch)
  // — silenced here so the test output isn't a wall of expected noise.
  let consoleErrorSpy: jest.SpyInstance;
  beforeEach(() => {
    bombArmed = true;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children normally when nothing throws', async () => {
    bombArmed = false;
    await render(
      <ErrorBoundary>
        <Text>All good</Text>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeTruthy();
  });

  it('catches a render-time crash and shows a recoverable fallback instead of taking the whole app down', async () => {
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByTestId('error-boundary-retry')).toBeTruthy();
  });

  it('re-renders children on "Try Again", recovering once the underlying cause is gone', async () => {
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    bombArmed = false; // the underlying cause is gone by the time of retry
    await fireEvent.press(screen.getByTestId('error-boundary-retry'));

    expect(screen.getByText('Recovered')).toBeTruthy();
  });
});
