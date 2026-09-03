/**
 * Required by `@dynamic-labs/legacy-client` (the real React Native SDK) —
 * must be imported before anything else (see index.ts) so it's in place
 * before any Dynamic module runs its own top-level code.
 *
 * Nothing else is needed here on Expo SDK 53+ per Dynamic's own React
 * Native docs: crypto/session-key work for this SDK runs inside
 * `ReactNativeExtension`'s embedded WebView (a real browser engine), not
 * in this app's own JS runtime — unlike the old `@dynamic-labs-sdk/client`
 * integration this replaced, which needed a hand-rolled `crypto.subtle`
 * polyfill for exactly that reason.
 */
import '@react-native-anywhere/polyfill-base64';
