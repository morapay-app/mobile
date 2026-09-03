import { encodeFunctionData, parseUnits, type Address, type Hex } from 'viem';

import { getNativeEvmWalletClient } from '../../dynamic/nativeWalletClient';
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
 * Native counterpart of `useRampDepositSend.web.ts` — now a real deposit,
 * not a stub, so the offramp/momo flow completes on device instead of
 * stopping at the wallet step. Identical ERC-20 `transfer` of the fixed
 * corridor asset (rampCorridor.ts) to the deposit address Core returns from
 * `/api/public/ramp/offramp/:ref/confirm`; only the wallet-client source
 * differs (see nativeWalletClient.ts).
 */
export function useRampDepositSend() {
  const sendToRampDepositAddress = async ({ depositAddress, humanAmount }: RampDepositSendParams): Promise<string> => {
    try {
      const address = depositAddress.trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error('Something looks wrong with the deposit address. Please try again.');
      }

      const walletClient = await getNativeEvmWalletClient(String(BASE_USDC_RAMP_CORRIDOR.chainId));

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
