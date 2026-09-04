import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ClaimError,
  claimCryptoPayout,
  getClaimByLink,
  getUnlockedClaim,
  verifyClaimCode,
  verifyClaimOtp,
  verifyClaimRecipient,
  type ClaimByLink,
  type UnlockedClaim,
} from '../../api/claims';
import { isDevClaimPreviewLinkId } from '../transactions/devPreviewLinks';

export type ClaimStep =
  | { step: 'loading' }
  | { step: 'not-found' }
  | { step: 'recipient'; link: ClaimByLink; error: string | null; busy: boolean }
  | { step: 'otp'; link: ClaimByLink; recipient: string; error: string | null; busy: boolean }
  | { step: 'claim-code'; link: ClaimByLink; recipient: string; error: string | null; busy: boolean }
  | { step: 'payout'; link: ClaimByLink; recipient: string; unlockToken: string; claim: UnlockedClaim; error: string | null; busy: boolean }
  | { step: 'success'; message: string }
  | { step: 'error'; message: string };

// TEMPORARY — see devPreviewLinks.ts's own doc. Fabricated, not real data;
// only ever reachable via `DEV_CLAIM_PREVIEW_LINK_ID`, which nothing but
// DevTransactionSimulator's own "Preview Claim" button ever produces.
const DEV_PREVIEW_LINK: ClaimByLink = { claim_link_id: 'dev-preview', source: 'custodial', recipient_hint: 'am***@example.com' };
const DEV_PREVIEW_CLAIM: UnlockedClaim = {
  claim_link_id: 'dev-preview',
  kind: 'custodial',
  transaction_id: 'dev-preview-tx',
  value: '25',
  token: 'USDC',
  payer_identifier: 'sender@morapay.io',
  to_identifier: 'ama@example.com',
  payout_type_hint: 'crypto',
  f_chain: 'BASE',
  f_token: 'USDC',
  f_amount: '25',
  t_chain: 'BASE',
  t_token: 'USDC',
  t_amount: '25',
  sent_summary: '25 USDC on BASE',
  sender_paid_fiat: false,
  claim_fiat_allowed: false,
  claim_crypto_allowed: true,
  crypto_payout_allowed: true,
};

/**
 * Drives the recipient-authentication + redemption sequence against
 * `api/claims.ts` — load-by-link, then recipient → OTP → claim-code →
 * payout, matching Core's own required order (see that file's doc). Modeled
 * on `usePayRequest.ts`'s shape: a single discriminated-union state the
 * screen renders directly, with the actual step transitions driven by
 * user-triggered actions here rather than automatic effects, since each
 * step needs its own input (recipient value, OTP digits, claim code).
 */
export function useClaimRedeem(claimLinkId: string) {
  const [state, setState] = useState<ClaimStep>({ step: 'loading' });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setState({ step: 'loading' });

    // TEMPORARY dev-only escape hatch — see devPreviewLinks.ts's own doc.
    if (isDevClaimPreviewLinkId(claimLinkId)) {
      setState({ step: 'recipient', link: DEV_PREVIEW_LINK, error: null, busy: false });
      return () => {
        mounted.current = false;
      };
    }

    (async () => {
      try {
        const link = await getClaimByLink(claimLinkId);
        if (mounted.current) setState({ step: 'recipient', link, error: null, busy: false });
      } catch (err) {
        if (!mounted.current) return;
        if (err instanceof ClaimError && err.status === 404) {
          setState({ step: 'not-found' });
        } else {
          setState({ step: 'error', message: err instanceof Error ? err.message : 'Could not load this claim.' });
        }
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [claimLinkId]);

  const submitRecipient = useCallback(
    async (recipient: string) => {
      if (state.step !== 'recipient') return;
      const link = state.link;
      setState({ step: 'recipient', link, error: null, busy: true });
      if (isDevClaimPreviewLinkId(claimLinkId)) {
        setState({ step: 'otp', link, recipient, error: null, busy: false });
        return;
      }
      try {
        await verifyClaimRecipient(claimLinkId, recipient);
        if (mounted.current) setState({ step: 'otp', link, recipient, error: null, busy: false });
      } catch (err) {
        if (!mounted.current) return;
        setState({
          step: 'recipient',
          link,
          error: err instanceof Error ? err.message : 'Could not verify this recipient.',
          busy: false,
        });
      }
    },
    [claimLinkId, state],
  );

  const submitOtp = useCallback(
    async (otp: string) => {
      if (state.step !== 'otp') return;
      const { link, recipient } = state;
      setState({ step: 'otp', link, recipient, error: null, busy: true });
      if (isDevClaimPreviewLinkId(claimLinkId)) {
        setState({ step: 'claim-code', link, recipient, error: null, busy: false });
        return;
      }
      try {
        await verifyClaimOtp({ claimLinkId, recipient, otp });
        if (mounted.current) setState({ step: 'claim-code', link, recipient, error: null, busy: false });
      } catch (err) {
        if (!mounted.current) return;
        setState({
          step: 'otp',
          link,
          recipient,
          error: err instanceof Error ? err.message : 'Invalid or expired code.',
          busy: false,
        });
      }
    },
    [claimLinkId, state],
  );

  const submitClaimCode = useCallback(
    async (code: string) => {
      if (state.step !== 'claim-code') return;
      const { link, recipient } = state;
      setState({ step: 'claim-code', link, recipient, error: null, busy: true });
      if (isDevClaimPreviewLinkId(claimLinkId)) {
        setState({ step: 'payout', link, recipient, unlockToken: 'dev-preview-unlock-token', claim: DEV_PREVIEW_CLAIM, error: null, busy: false });
        return;
      }
      try {
        const { unlock_token } = await verifyClaimCode({ claimLinkId, recipient, code });
        const claim = await getUnlockedClaim(unlock_token);
        if (mounted.current) {
          setState({ step: 'payout', link, recipient, unlockToken: unlock_token, claim, error: null, busy: false });
        }
      } catch (err) {
        if (!mounted.current) return;
        setState({
          step: 'claim-code',
          link,
          recipient,
          error: err instanceof Error ? err.message : 'Invalid claim code.',
          busy: false,
        });
      }
    },
    [claimLinkId, state],
  );

  const submitCryptoPayout = useCallback(
    async (payoutTarget: string) => {
      if (state.step !== 'payout') return;
      const { link, recipient, unlockToken, claim } = state;
      setState({ step: 'payout', link, recipient, unlockToken, claim, error: null, busy: true });
      if (isDevClaimPreviewLinkId(claimLinkId)) {
        setState({ step: 'success', message: `Preview complete — ${claim.value} ${claim.token} "sent" to ${payoutTarget.slice(0, 6)}…${payoutTarget.slice(-4)}. Nothing here is real.` });
        return;
      }
      try {
        const result = await claimCryptoPayout({ unlockToken, recipient, payoutTarget });
        if (mounted.current) setState({ step: 'success', message: result.message });
      } catch (err) {
        if (!mounted.current) return;
        setState({
          step: 'payout',
          link,
          recipient,
          unlockToken,
          claim,
          error: err instanceof Error ? err.message : 'Payout failed. Please try again.',
          busy: false,
        });
      }
    },
    [claimLinkId, state],
  );

  return { state, submitRecipient, submitOtp, submitClaimCode, submitCryptoPayout };
}
