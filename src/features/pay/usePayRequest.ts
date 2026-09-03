import { useEffect, useRef, useState } from 'react';

import {
  getPaymentInstruction,
  getPaymentRequestByLink,
  isEvmErc20TransferInstruction,
  PayRequestError,
  type EvmErc20TransferInstruction,
  type PaymentRequestByLink,
} from '../../api/payRequest';

export type PayRequestState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'already-completed'; request: PaymentRequestByLink }
  | { status: 'unsupported'; request: PaymentRequestByLink; reason: string }
  | { status: 'ready'; request: PaymentRequestByLink; instruction: EvmErc20TransferInstruction; transactionId: string }
  | { status: 'error'; message: string };

// Real, stable copy `payment-instruction.service.ts` sends for a genuinely
// already-settled request — checked as a substring since Core doesn't
// return a distinct machine-readable code for this case (its `code` field
// on a calldata 400 is the generic "request.invalid" regardless of which
// of several different reasons actually caused it — verified live).
const ALREADY_PAID_MESSAGE = /already paid/i;

/**
 * Loads a payment request by its `linkId` and decides whether it's payable
 * in-app. Deliberately does NOT try to guess "is this fiat" from the
 * by-link response's own fields ahead of time — Core's own create flow can
 * still resolve a request's crypto leg to a real payable instruction even
 * when the requester chose a fiat payout (see `paymentRequests.ts`'s own
 * doc on that gap), so `calldata`'s real response is the only source of
 * truth for payability, not something this hook pre-empts.
 *
 * `transactionId` is optional and, when given, is trusted over whatever
 * `by-link` returns — verified live, the deployed `by-link` endpoint
 * doesn't actually include a `transactionId` field at all (see
 * `api/payRequest.ts`'s doc), so `calldata` has nothing to query with for a
 * bare `linkId` alone. This app threads its own deep link with a
 * `transactionId` query param for requests it creates itself (see
 * `SwapScreen.tsx`'s pay-link construction) specifically to work around
 * that gap; a link opened without one falls back to whatever `by-link`
 * happens to supply, and if that's nothing either, this reports it as
 * `unsupported` — never as "already paid," which would be a real,
 * previously-shipped bug (a bare 400 from `calldata`, including the
 * "transaction_id is required" case triggered by having no id to send at
 * all, was being reported as "already paid" with no actual evidence of
 * that).
 */
export function usePayRequest(linkId: string, transactionId?: string) {
  const [state, setState] = useState<PayRequestState>({ status: 'loading' });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setState({ status: 'loading' });

    (async () => {
      let request: PaymentRequestByLink;
      try {
        request = await getPaymentRequestByLink(linkId);
      } catch (err) {
        if (!mounted.current) return;
        if (err instanceof PayRequestError && err.status === 404) {
          setState({ status: 'not-found' });
        } else {
          setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load this payment request.' });
        }
        return;
      }

      // Only real, positive evidence counts as "already paid" — the
      // by-link response's own status field when it's actually present.
      if (request.transaction.status === 'COMPLETED') {
        if (mounted.current) setState({ status: 'already-completed', request });
        return;
      }

      const effectiveTransactionId = transactionId ?? request.transactionId;
      if (!effectiveTransactionId) {
        if (mounted.current) {
          setState({
            status: 'unsupported',
            request,
            reason: "This link doesn't have enough information to pay in-app yet.",
          });
        }
        return;
      }

      try {
        const instruction = await getPaymentInstruction(effectiveTransactionId);
        if (!mounted.current) return;
        if (isEvmErc20TransferInstruction(instruction)) {
          setState({ status: 'ready', request, instruction, transactionId: effectiveTransactionId });
        } else {
          setState({ status: 'unsupported', request, reason: "This payment can't be completed in-app yet." });
        }
      } catch (err) {
        if (!mounted.current) return;
        // A 400 here has several real, distinct causes (see api/payRequest.ts's
        // doc) — only the message Core actually sends for a genuinely
        // completed transaction counts as "already paid." Anything else
        // (a missing/invalid transaction id, wrong transaction type) is a
        // real error and shown honestly, not silently reinterpreted.
        if (err instanceof PayRequestError && err.status === 400 && ALREADY_PAID_MESSAGE.test(err.message)) {
          setState({ status: 'already-completed', request });
        } else {
          setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load this payment.' });
        }
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, [linkId, transactionId]);

  return state;
}
