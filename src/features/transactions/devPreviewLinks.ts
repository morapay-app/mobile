/**
 * TEMPORARY — shared dev-only convention letting `usePayRequest`/
 * `useClaimRedeem` short-circuit past the real backend when the id they're
 * given is one of these markers, so `PayScreen`/`ClaimScreen` can be
 * reviewed and demoed without a real payment request, a real claim link, a
 * connected wallet, or a real signed transaction — the same reason
 * `DevTransactionSimulator` exists for the transaction tracker. Gated on
 * `__DEV__` at the call site in each hook, same as that file. Delete
 * alongside `DevTransactionSimulator.tsx` once these flows are reviewed —
 * see its own doc for the full removal note.
 */

const PREFIX = '__devpreview';

export type DevPayPreviewState = 'ready' | 'already-completed' | 'unsupported' | 'not-found' | 'error';

/** The `linkId` DevTransactionSimulator's "Preview Pay" buttons navigate
 * to `Pay` with — one per state worth reviewing (mirrors the terminal
 * outcomes `usePayRequest` can land on; "loading" needs no marker, it's
 * just the state before this resolves). */
export function devPayPreviewLinkId(state: DevPayPreviewState): string {
  return `${PREFIX}:pay:${state}`;
}

export function parseDevPayPreviewLinkId(linkId: string): DevPayPreviewState | null {
  if (!__DEV__) return null;
  const prefix = `${PREFIX}:pay:`;
  if (!linkId.startsWith(prefix)) return null;
  const state = linkId.slice(prefix.length);
  const valid: DevPayPreviewState[] = ['ready', 'already-completed', 'unsupported', 'not-found', 'error'];
  return (valid as string[]).includes(state) ? (state as DevPayPreviewState) : null;
}

/** Claim is a linear, multi-step flow (recipient -> OTP -> claim code ->
 * payout -> success) rather than a set of independent terminal states, so
 * there's just one entry marker — `useClaimRedeem` walks the demo forward
 * itself as each step's action is pressed, accepting whatever was typed. */
export const DEV_CLAIM_PREVIEW_LINK_ID = `${PREFIX}:claim`;

export function isDevClaimPreviewLinkId(claimLinkId: string): boolean {
  return __DEV__ && claimLinkId === DEV_CLAIM_PREVIEW_LINK_ID;
}
