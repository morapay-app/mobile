import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { TokenSelectSheet } from '../TokenSelectSheet';
import { BOOTSTRAP_TOKENS } from '../../data/tokens';

describe('TokenSelectSheet', () => {
  it('renders nothing when not visible', async () => {
    await render(
      <TokenSelectSheet visible={false} tokens={BOOTSTRAP_TOKENS} onClose={() => {}} onSelect={() => {}} />,
    );
    expect(screen.queryByTestId('token-row-skeleton')).toBeNull();
  });

  it('shows skeleton rows below whatever bootstrap tokens are already loaded while the live catalog is still fetching', async () => {
    await render(
      <TokenSelectSheet visible tokens={BOOTSTRAP_TOKENS} loading onClose={() => {}} onSelect={() => {}} />,
    );

    // The bootstrap set itself renders as real rows immediately...
    expect(screen.getByTestId(`token-row-${BOOTSTRAP_TOKENS[0].id}`)).toBeTruthy();
    // ...with skeleton placeholders standing in for the rest of the catalog
    // that hasn't arrived yet, not a blank gap or a spinner.
    expect(screen.getAllByTestId('token-row-skeleton').length).toBeGreaterThan(0);
  });

  it('shows no skeleton once the catalog has finished loading', async () => {
    await render(
      <TokenSelectSheet visible tokens={BOOTSTRAP_TOKENS} loading={false} onClose={() => {}} onSelect={() => {}} />,
    );
    expect(screen.queryByTestId('token-row-skeleton')).toBeNull();
  });

  // Real bug, reported live on mobile web: `sheetHeight` is derived from
  // `useWindowDimensions`, which changes on a viewport resize — a mobile
  // browser firing one on its own for things that have nothing to do with
  // the sheet closing (the keyboard opening, or Safari's auto-zoom on an
  // input focus). The reset effect used to key off `sheetHeight` alongside
  // `visible`, so any such resize while the sheet was already open replayed
  // the "just opened" reset and silently wiped whatever the user had typed.
  it('keeps the typed search query across a window-dimensions change while already open', async () => {
    const original = Dimensions.get('window');

    await render(
      <TokenSelectSheet visible tokens={BOOTSTRAP_TOKENS} onClose={() => {}} onSelect={() => {}} />,
    );

    await fireEvent.changeText(screen.getByTestId('token-search-input'), 'usdc');
    expect(screen.getByTestId('token-search-input').props.value).toBe('usdc');

    // Simulate the browser shrinking the visible viewport (keyboard opening,
    // or mobile Safari auto-zooming on an input focus) while the sheet stays
    // open and the user is mid-search — this is exactly what a real device
    // does, and `useWindowDimensions` (which `sheetHeight` derives from)
    // updates from the same `Dimensions.set`/'change' event RN's own native
    // bridge uses.
    // `sheetHeight` is `min(windowHeight * 0.85, 640)` — shrink by enough
    // that it actually moves off that 640 cap, or this wouldn't even
    // exercise the effect's dependency change.
    await act(() => {
      Dimensions.set({ window: { ...original, height: original.height - 700 } });
    });

    expect(screen.getByTestId('token-search-input').props.value).toBe('usdc');

    // Restore, so other tests in this file see the original dimensions.
    await act(() => {
      Dimensions.set({ window: original });
    });
  });
});
