import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { MotiView } from 'moti';

/**
 * Smoke test for the Reanimated 4 + react-native-worklets + Moti setup
 * (babel.config.js's `react-native-worklets/plugin`, App.tsx's
 * `GestureHandlerRootView`, package.json's jest `resolver`/mock wiring for
 * both packages) — not a real feature, just proof the whole chain actually
 * works end to end, since a broken worklets/babel setup fails at
 * build/runtime, not as a type error.
 */
it('renders a MotiView with a spring transition without throwing', () => {
  let tree: ReturnType<typeof create> | undefined;
  act(() => {
    tree = create(
      <MotiView from={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring' }}>
        <Text>animated</Text>
      </MotiView>,
    );
  });
  expect(tree!.toJSON()).toBeTruthy();
});
