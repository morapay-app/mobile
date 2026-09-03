import { parseUnits, type Hex } from 'viem';

import { fetchSwapExecutionQuote } from '../../api/quoteSwap';
import { getNativeEvmWalletClient } from '../../dynamic/nativeWalletClient';
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
 * Native counterpart of `useSwapExecution.web.ts` — now real execution, not
 * a stub. Same `/api/public/quotes/swap` (0x provider) quote and the same
 * Permit2 signing flow; the only difference is that the wallet client comes
 * from `getNativeEvmWalletClient` (which supplies the viem `Chain` the RN
 * SDK's `createWalletClient` requires) instead of the web SDK's
 * `primaryWallet.getWalletClient`. Same-chain only, for the same reason:
 * that's all 0x quotes cover, and cross-chain has no publicly-reachable
 * execution path in morapay's own stack.
 */
export function useSwapExecution() {
  const execute = async ({ fromToken, toToken, amount }: SwapExecutionParams): Promise<string> => {
    try {
      if (fromToken.chainId !== toToken.chainId) {
        throw new Error("Cross-chain swaps aren't available yet. Choose tokens on the same chain.");
      }

      const chainId = Number.parseInt(fromToken.chainId, 10);
      if (!Number.isFinite(chainId)) {
        throw new Error("This pair isn't supported yet.");
      }

      const walletClient = await getNativeEvmWalletClient(fromToken.chainId);

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
      throw new Error(friendlyExecutionError(err));
    }
  };

  return { execute };
}
