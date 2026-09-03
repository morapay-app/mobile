/**
 * Real offramp settlement always deposits a fixed corridor asset — Circle
 * USDC on Base — regardless of which token the swap card itself is
 * quoting, matching Core's own `BROWSER_BASE_USDC_CORRIDOR` and the real
 * checkout app's `client-ramp-corridor.ts` (confirmed against that file
 * directly: chain id, decimals, and contract address below are copied from
 * it verbatim, not guessed). There's no live re-quoting into this asset —
 * offramp is only actually executable when the token the user picked to
 * sell already *is* this one.
 */
export const BASE_USDC_RAMP_CORRIDOR = {
  chainId: 8453,
  decimals: 6,
  contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
} as const;

/** True only for the exact corridor asset — matched by contract address,
 * not just symbol/chain, so a bridged Base USDC variant (USDbC, USDC.e —
 * same symbol, different contract) is correctly treated as ineligible
 * rather than silently debited as if it were the canonical one. */
export function matchesRampCorridor(token: { chainId: string; address: string }): boolean {
  return (
    token.chainId === String(BASE_USDC_RAMP_CORRIDOR.chainId) &&
    token.address.toLowerCase() === BASE_USDC_RAMP_CORRIDOR.contractAddress.toLowerCase()
  );
}
