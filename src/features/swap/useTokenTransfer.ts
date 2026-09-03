import { encodeFunctionData, parseUnits, type Address, type Hex } from 'viem';

import { getNativeEvmWalletClient } from '../../dynamic/nativeWalletClient';
import { friendlyExecutionError } from './friendlyExecutionError';
import type { SwapToken } from './data/tokens';

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

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export type TokenTransferParams = {
  token: Pick<SwapToken, 'chainId' | 'address' | 'decimals'>;
  toAddress: string;
  /** Human-readable amount, in the token's own units. */
  amount: string;
};

/**
 * Native counterpart of `useTokenTransfer.web.ts` — now a real transfer, not
 * a stub. The only thing that differs from the web version is where the
 * wallet client comes from (`getNativeEvmWalletClient`, which supplies the
 * viem `Chain` the RN SDK requires); the transfer itself is the same
 * `transfer(to, amount)` for an ERC-20 and the same native-value send for a
 * chain's gas token, against the same viem primitives.
 */
export function useTokenTransfer() {
  const transfer = async ({ token, toAddress, amount }: TokenTransferParams): Promise<string> => {
    try {
      const address = toAddress.trim();
      if (!EVM_ADDRESS_RE.test(address)) {
        throw new Error('Something looks wrong with that address. Please try again.');
      }

      const chainId = Number.parseInt(token.chainId, 10);
      if (!Number.isFinite(chainId)) {
        throw new Error("This chain isn't supported yet.");
      }

      const walletClient = await getNativeEvmWalletClient(token.chainId);
      const value = parseUnits(amount.replace(/,/g, '').trim(), token.decimals);

      if (token.address === 'native') {
        return await walletClient.sendTransaction({
          account: walletClient.account,
          to: address as Address,
          value,
          chain: walletClient.chain,
        });
      }

      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [address as Address, value],
      });
      return await walletClient.sendTransaction({
        account: walletClient.account,
        to: token.address as Address,
        data: data as Hex,
        chain: walletClient.chain,
      });
    } catch (err) {
      throw new Error(friendlyExecutionError(err));
    }
  };

  return { transfer };
}
