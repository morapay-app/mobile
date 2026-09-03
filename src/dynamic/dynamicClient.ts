import { Platform } from 'react-native';
import { createClient } from '@dynamic-labs/legacy-client';
import { ReactNativeExtension } from '@dynamic-labs/legacy-react-native-extension';
import { ViemExtension } from '@dynamic-labs/legacy-viem-extension';
import { SolanaExtension } from '@dynamic-labs/legacy-solana-extension';

import { DYNAMIC_ENVIRONMENT_ID } from '../config/env';

/**
 * The REAL React Native SDK — `@dynamic-labs/legacy-client` +
 * `ReactNativeExtension`, despite the "legacy" package name. This is not
 * the deprecated line; it's what Dynamic's own React Native docs document,
 * confirmed directly against this package's shipped .d.ts files rather
 * than assumed from a name.
 *
 * `@dynamic-labs-sdk/*` (what this app used before) is a different,
 * web-first client library that happens to expose hooks under React
 * Native too, but never ran its own crypto/session-key work anywhere but
 * a real browser's WebCrypto — hence the `crypto.subtle` and "project
 * settings tracker" failures chasing wallet-connect earlier. This SDK
 * sidesteps that class of bug entirely: auth/wallet-connect UI and its
 * crypto both run inside `ReactNativeExtension`'s own embedded WebView (a
 * real browser engine), bridged back to plain JS objects here — nothing
 * in this file needs a WebCrypto polyfill.
 *
 * `connectOnly: true` is what the SDK itself recommends for exactly this
 * app's use case ("allow wallet connections without full authentication")
 * — this app only needs an address to read balances/quotes against, not a
 * signed-in session.
 */
function createNativeClient() {
  return createClient({
    environmentId: DYNAMIC_ENVIRONMENT_ID,
    appName: 'Morapay',
    connectOnly: true,
  })
    // No `appOrigin` override — it's optional, and defaults to whatever
    // the SDK itself resolves for this native host. It was previously
    // hardcoded to `http://localhost:8081` (a Metro dev-server address),
    // which per the SDK's own docs feeds SIWE messages, fetch `Origin`
    // headers, and passkey operations — on any real device (not literally
    // running against that dev server), every one of those would carry a
    // wrong, unregistered origin. That's the leading suspect for "connects
    // and signs, then fails with a generic error" on native specifically:
    // web never had this problem because it uses a completely separate
    // integration (`sdk-react-core`, DynamicRoot.web.tsx) that reads the
    // browser's own real origin, not this hardcoded value. Deep-link
    // redirects are unaffected either way — the SDK auto-configures those
    // from `expo-linking` itself, not from `appOrigin` (confirmed against
    // this package's own .d.ts).
    .extend(
      ReactNativeExtension({
        // Nothing in this app currently surfaces *why* a native connect
        // attempt failed — the WebView just shows its own generic error
        // state, and there's no console/log path back to us. This opens
        // the WebView up to Safari Web Inspector (iOS)/chrome://inspect
        // (Android) in dev builds only, so the real underlying error is
        // actually visible next time the "connects and signs, then fails"
        // issue reproduces, instead of guessing from the outside.
        webviewDebuggingEnabled: __DEV__,
      }),
    )
    .extend(ViemExtension())
    .extend(SolanaExtension());
}

type DynamicClient = ReturnType<typeof createNativeClient>;

/**
 * Native-only, deliberately: this is a React Native SDK end to end
 * (native `expo prebuild`/dev-client required, "NOT compatible with Expo
 * Go" per Dynamic's own docs, no mention of web anywhere in them) — a real
 * `<WebView>` hosted browser engine doesn't have a sane equivalent inside
 * an actual browser tab. On web this app uses a no-op stub instead of
 * constructing the real client, which otherwise fails loudly
 * (`crypto.subtle.generateKey` undefined) trying to do native-only
 * crypto/session work outside any native host. Web wallet-connect has its
 * own, separate real integration — Dynamic's actual web SDK,
 * `@dynamic-labs/sdk-react-core` (see DynamicRoot.web.tsx / useWallet.web.ts
 * / useWalletConnectActions.web.ts) — so nothing here ever actually calls
 * into this stub on web; Metro's platform-extension resolution means the
 * `.web` files are used instead of the ones that read `dynamicClient` at
 * all. This object exists purely so importing `dynamicClient` on web
 * doesn't construct the native-only client above.
 */
function createWebStubClient(): DynamicClient {
  const noop = async () => {};
  return {
    ui: { auth: { show: noop, hide: noop } },
    auth: { logout: noop },
    wallets: { userWallets: [] },
    reactNative: { WebView: () => null },
  } as unknown as DynamicClient;
}

export const dynamicClient: DynamicClient =
  Platform.OS === 'web' ? createWebStubClient() : createNativeClient();
