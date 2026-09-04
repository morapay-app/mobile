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
 * `Claim` matches the real claim link's own path shape
 * (`.../claim/<claimLinkId>`) the same way `Pay` mirrors `payLink` — see
 * `features/claim/ClaimScreen.tsx`'s doc.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'morapay://'],
  config: {
    screens: {
      Swap: '',
      Pay: 'pay/request/:linkId',
      Claim: 'claim/:claimLinkId',
    },
  },
};
