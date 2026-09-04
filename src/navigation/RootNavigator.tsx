import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SwapScreen } from '../features/swap/SwapScreen';
import { PayScreen } from '../features/pay/PayScreen';
import { ClaimScreen } from '../features/claim/ClaimScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Every screen draws its own chrome (SwapScreen's own card header, Pay's
 * and Claim's own cards) rather than expecting a native nav bar —
 * `headerShown: false` across the board, not per-screen. */
export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Swap" component={SwapScreen} />
      <Stack.Screen name="Pay" component={PayScreen} />
      <Stack.Screen name="Claim" component={ClaimScreen} />
    </Stack.Navigator>
  );
}
