import { apiPost } from './client';

/** SWAP = crypto<->crypto (Squid). ONRAMP/OFFRAMP = one leg fiat — the SAME
 * endpoint handles all three, real morapay pricing engine underneath
 * (Quidax for the fiat leg, confirmed live), differentiated only by this
 * field. Matches `KlyraQuoteRequest` in
 * frontend/apps/app/src/lib/klyraQuote.ts — that's the real app's own proxy
 * onto this exact backend route. */
export type QuoteAction = 'SWAP' | 'ONRAMP' | 'OFFRAMP';

export type SwapQuoteRequest = {
  action: QuoteAction;
  inputAmount: string;
  inputCurrency: string;
  outputCurrency: string;
  chain: string;
  toChain?: string;
  inputSide: 'from' | 'to';
};

export type SwapQuoteResponse = {
  quoteId: string;
  expiresAt: string;
  exchangeRate: string;
  input: { amount: string; currency: string; chain: string };
  output: { amount: string; currency: string; chain: string };
  fees: { networkFee: string; platformFee: string; totalFee: string };
};

/** Real quote — `/api/public/quotes`. Confirmed live against the backend for
 * all three actions, including a fiat leg (e.g. `outputCurrency: "GHS"`
 * under OFFRAMP) — there's no separate fiat-rate service to call. */
export function fetchSwapQuote(request: SwapQuoteRequest): Promise<SwapQuoteResponse> {
  return apiPost<SwapQuoteResponse>('/api/public/quotes', request);
}
