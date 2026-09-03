import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { encodeFunctionData, parseUnits, type Address, type Hex } from 'viem';

import { BASE_USDC_RAMP_CORRIDOR } from './rampCorridor';
import { friendlyExecutionError } from './friendlyExecutionError';

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export type RampDepositSendParams = {
  depositAddress: string;
  /** Human-readable amount, in the corridor asset's own units (USDC). */
  humanAmount: string;
};

/**
 * Real offramp settlement — signs and sends an actual ERC-20 `transfer` of
 * the fixed corridor asset (see rampCorridor.ts) to the deposit address the
 * backend hands back from `/api/public/ramp/offramp/:ref/confirm`. Mirrors
 * frontend/apps/app's `useRampDepositSend` (`use-ramp-deposit-send.ts`) —
 * same ABI, same plain `transfer(to, amount)` call — using the same viem
 * wallet-client primitives `useSwapExecution.web.ts` already does, rather
 * than wagmi (this app doesn't use wagmi). No chain-switch step here: the
 * caller only ever reaches this once `fromToken` has already been confirmed
 * to be the corridor asset itself (see MomoSheet's `matchesRampCorridor`
 * guard), and SwapScreen's own effect already nudges a connected wallet to
 * `fromToken`'s chain — the same Base-chain nudge either way.
 */
export function useRampDepositSend() {
  const { primaryWallet } = useDynamicContext();

  const sendToRampDepositAddress = async ({ depositAddress, humanAmount }: RampDepositSendParams): Promise<string> => {
    try {
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        throw new Error('Connect a wallet to sell crypto.');
      }

      const address = depositAddress.trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error('Something looks wrong with the deposit address. Please try again.');
      }

      const walletClient = await primaryWallet.getWalletClient(String(BASE_USDC_RAMP_CORRIDOR.chainId));
      if (!walletClient?.account) {
        throw new Error("Your wallet isn't ready. Try reconnecting.");
      }

      const value = parseUnits(humanAmount.replace(/,/g, '').trim(), BASE_USDC_RAMP_CORRIDOR.decimals);
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [address as Address, value],
      });

      return await walletClient.sendTransaction({
        account: walletClient.account,
        to: BASE_USDC_RAMP_CORRIDOR.contractAddress as Address,
        data: data as Hex,
        chain: walletClient.chain,
      });
    } catch (err) {
      throw new Error(friendlyExecutionError(err));
    }
  };

  return { sendToRampDepositAddress };
}
