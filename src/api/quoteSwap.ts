import { apiPost } from './client';

/**
 * Real, executable swap quotes — `/api/public/quotes/swap` (backend:
 * core/src/routes/api/quote.ts, proxied by frontend/apps/app's own
 * `/api/core/quote/swap` route the same way). Confirmed live: with
 * `provider: '0x'` and a `from_address`, 0x's own permit2 quote endpoint
 * returns a genuinely signable `transaction` (to/data/value) plus a
 * Permit2 EIP-712 message to sign — no privileged flag needed, unlike
 * Squid's `for_execution`, which core only ever sets server-side (see
 * ramp-hub-distribute.service.ts) and the public schema doesn't accept
 * from a client at all. 0x quotes are same-chain only.
 */

export type SwapExecutionProvider = '0x' | 'squid' | 'lifi';

export type SwapExecutionQuoteRequest = {
  provider: SwapExecutionProvider;
  /** Contract address, or the 0xEeee… native sentinel — never a bare symbol. */
  fromToken: string;
  toToken: string;
  /** Base units (wei/smallest unit), as a decimal string. */
  amount: string;
  fromChain: number;
  toChain: number;
  fromAddress: string;
};

export type Permit2Eip712 = {
  types: Record<string, { name: string; type: string }[]>;
  domain: { name?: string; chainId?: number; verifyingContract?: `0x${string}` };
  message: Record<string, unknown>;
  primaryType: string;
};

export type ZeroXExecutableTransaction = {
  to: string;
  data: string;
  value: string;
  gas?: string;
  gasPrice?: string;
};

/** The 0x permit2 quote's raw response, passed through under `transaction.raw`. */
export type ZeroXQuoteRaw = {
  transaction?: ZeroXExecutableTransaction;
  permit2?: { eip712: Permit2Eip712 };
  allowanceTarget?: string;
  liquidityAvailable?: boolean;
  minBuyAmount?: string;
};

export type SwapExecutionQuoteResponse = {
  provider: SwapExecutionProvider;
  from_chain_id: number;
  to_chain_id: number;
  cross_chain: boolean;
  same_chain: boolean;
  token_type: 'cross_token' | 'same_token';
  from_amount: string;
  to_amount: string;
  transaction: { raw: ZeroXQuoteRaw; gas_limit?: string } | null;
};

export function fetchSwapExecutionQuote(request: SwapExecutionQuoteRequest): Promise<SwapExecutionQuoteResponse> {
  return apiPost<SwapExecutionQuoteResponse>('/api/public/quotes/swap', {
    provider: request.provider,
    from_token: request.fromToken,
    to_token: request.toToken,
    amount: request.amount,
    from_chain: request.fromChain,
    to_chain: request.toChain,
    from_address: request.fromAddress,
  });
}
