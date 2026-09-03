import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { encodeFunctionData, parseUnits, type Address, type Hex } from 'viem';

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
 * A plain on-chain transfer of an already-held token to an arbitrary
 * address — no swap, no bridge, just `transfer(to, amount)` for an ERC-20
 * or a native-value send for a chain's own gas token. Generalizes the exact
 * same pattern `useRampDepositSend.web.ts` already uses for the fixed
 * offramp corridor asset (same ABI, same viem wallet-client primitives),
 * to any EVM token/address — this is genuinely the only "send to someone
 * else's wallet" primitive this app has real, working execution for today:
 * `useSwapExecution.web.ts`'s 0x-quote flow always settles back to the
 * connected wallet's own address, and cross-chain has no publicly-reachable
 * execution path at all (see its own doc comment) — so a Send to a
 * *different* token/chain than what's actually held isn't handled here;
 * callers should only reach this once the destination token is confirmed
 * to be the exact same one being sent.
 */
export function useTokenTransfer() {
  const { primaryWallet } = useDynamicContext();

  const transfer = async ({ token, toAddress, amount }: TokenTransferParams): Promise<string> => {
    try {
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        throw new Error('Connect a wallet to send.');
      }

      const address = toAddress.trim();
      if (!EVM_ADDRESS_RE.test(address)) {
        throw new Error('Something looks wrong with that address. Please try again.');
      }

      const chainId = Number.parseInt(token.chainId, 10);
      if (!Number.isFinite(chainId)) {
        throw new Error("This chain isn't supported yet.");
      }

      const walletClient = await primaryWallet.getWalletClient(String(chainId));
      if (!walletClient?.account) {
        throw new Error("Your wallet isn't ready. Try reconnecting.");
      }

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
