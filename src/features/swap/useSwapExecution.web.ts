import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { parseUnits, type Hex } from 'viem';

import { fetchSwapExecutionQuote } from '../../api/quoteSwap';
import { friendlyExecutionError } from './friendlyExecutionError';
import type { SwapToken } from './data/tokens';
import { appendPermit2SignatureToCalldata, toExecutionTokenAddress } from './zeroXExecution';

export type SwapExecutionParams = {
  fromToken: SwapToken;
  toToken: SwapToken;
  /** Human-readable amount in fromToken units. */
  amount: number;
};

/**
 * Real swap execution — signs and sends an actual on-chain transaction from
 * the connected wallet, using the same `/api/public/quotes/swap` (0x
 * provider) endpoint and Permit2 signing flow described in
 * zeroXExecution.ts. 0x quotes are same-chain only, so this only ever
 * covers a same-chain pair; cross-chain has no publicly-reachable
 * execution path in morapay's own stack (Squid's real calldata is only
 * ever requested server-side, with `for_execution: true`, which the public
 * schema doesn't even accept from a client).
 */
export function useSwapExecution() {
  const { primaryWallet } = useDynamicContext();

  const execute = async ({ fromToken, toToken, amount }: SwapExecutionParams): Promise<string> => {
    try {
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        throw new Error('Connect a wallet to swap.');
      }
      if (fromToken.chainId !== toToken.chainId) {
        throw new Error("Cross-chain swaps aren't available yet. Choose tokens on the same chain.");
      }

      const chainId = Number.parseInt(fromToken.chainId, 10);
      if (!Number.isFinite(chainId)) {
        throw new Error("This pair isn't supported yet.");
      }

      const walletClient = await primaryWallet.getWalletClient(String(chainId));
      if (!walletClient?.account) {
        throw new Error("Your wallet isn't ready. Try reconnecting.");
      }

      const baseAmount = parseUnits(amount.toString(), fromToken.decimals).toString();
      const quote = await fetchSwapExecutionQuote({
        provider: '0x',
        fromToken: toExecutionTokenAddress(fromToken),
        toToken: toExecutionTokenAddress(toToken),
        amount: baseAmount,
        fromChain: chainId,
        toChain: chainId,
        fromAddress: walletClient.account.address,
      });

      const raw = quote.transaction?.raw;
      const tx = raw?.transaction;
      if (!tx) {
        throw new Error("This pair isn't available right now.");
      }

      let calldata = tx.data as Hex;
      if (raw?.permit2?.eip712) {
        const { EIP712Domain: _unused, ...typesWithoutDomain } = raw.permit2.eip712.types;
        const signature = await walletClient.signTypedData({
          account: walletClient.account,
          domain: raw.permit2.eip712.domain,
          types: typesWithoutDomain,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          primaryType: raw.permit2.eip712.primaryType as any,
          message: raw.permit2.eip712.message,
        });
        calldata = appendPermit2SignatureToCalldata(calldata, signature);
      }

      return await walletClient.sendTransaction({
        account: walletClient.account,
        to: tx.to as Hex,
        data: calldata,
        value: BigInt(tx.value ?? '0'),
        chain: walletClient.chain,
      });
    } catch (err) {
      // Every throw above (ours and the wallet's/viem's/the API's) funnels
      // through here — this is what guarantees nothing technical ever
      // reaches SwapScreen's `<Text testID="swap-error">`, no matter which
      // step actually failed.
      throw new Error(friendlyExecutionError(err));
    }
  };

  return { execute };
}
