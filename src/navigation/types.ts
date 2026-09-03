/** Every screen this app can navigate to, and the params it needs. `Pay`'s
 * `linkId` is `Request.linkId` (Core) — the same id the real `payLink`
 * (`.../pay/request/<linkId>`) encodes, see `api/payRequest.ts`'s doc.
 * `transactionId` is optional — carried as a `?transactionId=` query param
 * for links this app generates itself, to work around the deployed
 * `by-link` endpoint not actually returning one (see `usePayRequest.ts`'s
 * doc for why that matters). */
export type RootStackParamList = {
  Swap: undefined;
  Pay: { linkId: string; transactionId?: string };
};
