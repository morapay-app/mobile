import * as Linking from 'expo-linking';

/**
 * This app's own working link for a request it just created — deliberately
 * NOT Core's real `payLink`. Two real, verified reasons:
 *   1. `payLink` (`.../pay/request/<linkId>`) points at a web page that
 *      doesn't exist on `frontend/apps` yet.
 *   2. The deployed `by-link` endpoint this app's own Pay screen calls
 *      doesn't return a `transactionId` (verified live — see
 *      `api/payRequest.ts`'s doc), so `linkId` alone isn't enough to
 *      actually pay in-app. Carrying `transactionId` as a query param here
 *      is what lets `usePayRequest` skip straight to `calldata` instead of
 *      landing on "not enough information to pay in-app yet."
 */
export function buildPaymentRequestDeepLink(linkId: string, transactionId: string): string {
  return Linking.createURL(`/pay/request/${linkId}`, { queryParams: { transactionId } });
}
