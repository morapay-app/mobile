import { useEffect, useRef, useState } from 'react';

import {
  getPaymentInstruction,
  getPaymentRequestByLink,
  isEvmErc20TransferInstruction,
  PayRequestError,
  type EvmErc20TransferInstruction,
  type PaymentRequestByLink,
} from '../../api/payRequest';
import { parseDevPayPreviewLinkId } from '../transactions/devPreviewLinks';

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

// TEMPORARY — see devPreviewLinks.ts's own doc. Fabricated, not real data;
// only ever reachable via a `__devpreview:pay:*` linkId, which nothing but
// DevTransactionSimulator's own "Preview Pay" buttons ever produces.
const DEV_PREVIEW_REQUEST: PaymentRequestByLink = {
  id: 'dev-preview-request',
  code: 'PREVIEW',
  linkId: 'dev-preview-link',
  transactionId: 'dev-preview-tx',
  transaction: {
    id: 'dev-preview-tx',
    status: 'PENDING',
    f_chain: '8453',
    f_token: 'USDC',
    t_chain: '8453',
    t_token: 'USDC',
    t_amount: '25',
    receiveSummary: 'For the design review lunch',
    toIdentifierHint: 'a***a@example.com',
  },
};
const DEV_PREVIEW_INSTRUCTION: EvmErc20TransferInstruction = {
  kind: 'evm_erc20_transfer',
  chainId: 8453,
  chain: 'base',
  token: 'USDC',
  toAddress: '0x11111111111111111111111111111111111111',
  tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  amount: '25',
  decimals: 6,
  message: 'Preview payment — nothing here is real.',
};

function devPayPreviewState(previewState: NonNullable<ReturnType<typeof parseDevPayPreviewLinkId>>): PayRequestState {
  switch (previewState) {
    case 'ready':
      return { status: 'ready', request: DEV_PREVIEW_REQUEST, instruction: DEV_PREVIEW_INSTRUCTION, transactionId: DEV_PREVIEW_REQUEST.transactionId! };
    case 'already-completed':
      return { status: 'already-completed', request: { ...DEV_PREVIEW_REQUEST, transaction: { ...DEV_PREVIEW_REQUEST.transaction, status: 'COMPLETED' } } };
    case 'unsupported':
      return { status: 'unsupported', request: DEV_PREVIEW_REQUEST, reason: "This payment can't be completed in-app yet." };
    case 'not-found':
      return { status: 'not-found' };
    case 'error':
      return { status: 'error', message: 'Could not load this payment request.' };
  }
}

/**
 * Loads a payment request by its `linkId` and decides whether it's payable
 * in-app. Bails out to `unsupported` immediately when `by-link`'s own
 * `payerPaysFiat` flag is `true`, rather than attempting a `calldata` call
 * that would come back `REQUEST_EXPECTS_FIAT` anyway (Core's real check,
 * verified in `requests.ts`) — a real, server-computed answer to "does this
 * need a fiat deposit," not a client-side guess. This is different from the
 * old (pre-`payerPaysFiat`) reasoning it replaces: that guarded against
 * pre-empting `calldata` on a guess, since a fiat-payout *request* could
 * still resolve to a real payable crypto instruction (see
 * `paymentRequests.ts`'s own doc on that gap) — `payerPaysFiat` describes
 * what the PAYER owes, a different question `calldata` can't answer any
 * more authoritatively than this field already does.
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

    // TEMPORARY dev-only escape hatch — see devPreviewLinks.ts's own doc.
    const previewState = parseDevPayPreviewLinkId(linkId);
    if (previewState) {
      setState(devPayPreviewState(previewState));
      return () => {
        mounted.current = false;
      };
    }

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

      // Real, server-computed — see this hook's own doc for why this is
      // trusted ahead of a doomed `calldata` call rather than guessed.
      if (request.transaction.payerPaysFiat === true) {
        if (mounted.current) {
          setState({
            status: 'unsupported',
            request,
            reason: "This request needs a fiat deposit, not a wallet transfer. That isn't supported in-app yet.",
          });
        }
        return;
      }

      const effectiveTransactionId = transactionId ?? request.transaction.id ?? request.transactionId;
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
