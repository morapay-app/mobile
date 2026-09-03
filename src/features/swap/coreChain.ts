/**
 * The chain identifier morapay's Core service uses, derived from the
 * Squid/catalog `chainId` every `SwapToken` already carries.
 *
 * Core does not speak numeric chain ids in its stored transaction rows — it
 * stores a chain *code* (`f_chain`/`t_chain`), and maps that back to a
 * numeric id via `CORE_CHAIN_TO_EVM_CHAIN_ID` in
 * core/src/lib/payment-chain-routing.ts. The table below is that same map,
 * inverted, restricted to the chains this app's own catalog actually
 * surfaces tokens for (`MAJOR_CHAIN_IDS` in api/catalog.ts) — so every
 * entry here is a chain both sides genuinely support, rather than a
 * speculative superset of Core's much longer `EVM_CHAIN_CODES_LIST`.
 *
 * Two endpoints want this in two different shapes, which is why both
 * helpers exist:
 *   - `POST /api/public/requests` takes `t_chain` as the code verbatim
 *     (stored straight onto the transaction row, no resolution step).
 *   - `POST /api/public/app-transfer/intent` takes `*_chain_slug` and runs
 *     it through Core's own `resolveChainCodeFromSlug`, which accepts
 *     either a name slug ("base") or a numeric chain id ("8453").
 */

const CHAIN_ID_TO_CORE_CODE: Record<string, string> = {
  '1': 'ETHEREUM',
  '8453': 'BASE',
  '56': 'BNB',
  '137': 'POLYGON',
  '42161': 'ARBITRUM',
  '10': 'OPTIMISM',
  '43114': 'AVALANCHE',
  'solana-mainnet-beta': 'SOLANA',
};

/** Core's own chain code for a catalog `chainId`, or `null` for a chain
 * Core has no code for — callers should treat that as "not supported yet"
 * rather than passing a raw numeric id where a code is expected. */
export function coreChainCode(chainId: string): string | null {
  return CHAIN_ID_TO_CORE_CODE[chainId.trim()] ?? null;
}

/** The `*_chain_slug` value for the app-transfer intent endpoint. Prefers
 * the known code (lowercased, the "name slug" form its resolver documents),
 * and falls back to the numeric chain id — also accepted by that same
 * resolver — so a chain missing from the table above still has a real
 * chance of resolving server-side instead of failing client-side. */
export function coreChainSlug(chainId: string): string {
  const code = coreChainCode(chainId);
  return code ? code.toLowerCase() : chainId.trim();
}
