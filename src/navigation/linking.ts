import type { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';

import type { RootStackParamList } from './types';

/**
 * Deep-link config for the app's own `morapay://` scheme (`app.json`).
 * `pay/request/:linkId` matches the path shape the real `payLink`
 * (`.../pay/request/<linkId>`) already uses on the web — same shape, just
 * under this scheme instead of an `https://` host, since there's no
 * confirmed universal-link host to register yet (see `PayScreen`'s doc).
 *
 * `Claim` is deliberately NOT listed here yet — that screen doesn't exist,
 * and a `screens` entry with no matching `Stack.Screen` component would
 * just be dead config, not a real reservation of anything. When the claim
 * screen is built, add `Claim: 'claim/:claimLinkId'` alongside it.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'morapay://'],
  config: {
    screens: {
      Swap: '',
      Pay: 'pay/request/:linkId',
    },
  },
};
