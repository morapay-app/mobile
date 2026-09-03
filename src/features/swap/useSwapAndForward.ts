import { fetchChainBalances, findTokenBalance } from '../../api/balances';
import { useSwapExecution } from './useSwapExecution';
import { useTokenTransfer } from './useTokenTransfer';
import type { SwapToken } from './data/tokens';

/** Same cadence and patience as MomoSheet's own ramp polling — a same-chain
 * 0x swap normally lands in a block or two, and 2 minutes is generous
 * without hanging the UI indefinitely. */
const POLL_INTERVAL_MS = 4000;
const POLL_ATTEMPTS = 30;

export type SwapAndForwardParams = {
  fromToken: SwapToken;
  toToken: SwapToken;
  /** Human-readable amount in fromToken units. */
  amount: number;
  toAddress: string;
  senderAddress: string;
};

export type SwapAndForwardResult = {
  swapTxHash: string;
  transferTxHash: string;
  /** What actually got forwarded — measured, not quoted. */
  forwardedAmount: string;
};

/**
 * Why a pair can be ineligible before any signing: 0x's quote (the only
 * publicly-reachable swap execution in morapay's stack) settles the bought
 * token back to the signer, so "send someone a different token than you
 * hold" has to be a swap followed by a transfer — two transactions from the
 * user's own wallet.
 *
 * That composition has two hard limits, both checked here rather than
 * discovered halfway through:
 *   - Same chain only, because that's all a 0x quote covers.
 *   - The destination token can't be the chain's native gas token. The swap
 *     itself spends gas, so the measured balance delta would be smaller than
 *     what the swap actually returned, and forwarding the whole balance would
 *     leave nothing to pay for the forwarding transaction — it would reliably
 *     fail after the swap had already gone through.
 */
export function swapAndForwardBlockedReason(fromToken: SwapToken, toToken: SwapToken): string | null {
  if (fromToken.chainId !== toToken.chainId) {
    return `Sending ${toToken.symbol} on ${toToken.chainName} from ${fromToken.symbol} on ${fromToken.chainName} isn't available yet — pick a token on the same chain.`;
  }
  if (toToken.address === 'native') {
    return `Sending ${toToken.symbol} bought from ${fromToken.symbol} isn't supported yet — pick a token like USDC, or send ${fromToken.symbol} itself.`;
  }
  return null;
}

async function readBalance(address: string, token: SwapToken): Promise<number> {
  const items = await fetchChainBalances(address, token.chainId);
  return findTokenBalance(items, token);
}

/**
 * Swaps into the destination token, then forwards the proceeds on to the
 * recipient — the honest two-step version of "send someone a token you don't
 * hold", using the two execution primitives this app already has.
 *
 * The amount forwarded is the MEASURED balance increase, read back from the
 * real `/api/balances/multicall` endpoint, not the quote's expected output:
 * a swap's actual fill moves with slippage, and forwarding a quoted figure
 * that came in slightly high would simply revert. Polling that endpoint is
 * also what stands in for waiting on a receipt — this app has no RPC public
 * client of its own, and the balance only moves once the swap has mined.
 *
 * A failure after the swap has been signed is reported as exactly that: the
 * swap happened and the tokens are sitting in the user's own wallet, so the
 * error says so rather than implying the whole thing was a no-op.
 */
export function useSwapAndForward() {
  const { execute } = useSwapExecution();
  const { transfer } = useTokenTransfer();

  const swapAndForward = async ({
    fromToken,
    toToken,
    amount,
    toAddress,
    senderAddress,
  }: SwapAndForwardParams): Promise<SwapAndForwardResult> => {
    const blocked = swapAndForwardBlockedReason(fromToken, toToken);
    if (blocked) throw new Error(blocked);

    // Read before swapping, so the delta measures only what the swap added.
    // A failure here is still pre-swap, so it's safe to surface plainly.
    let balanceBefore: number;
    try {
      balanceBefore = await readBalance(senderAddress, toToken);
    } catch {
      throw new Error("Couldn't check your balance just now. Please try again.");
    }

    const swapTxHash = await execute({ fromToken, toToken, amount });

    let received = 0;
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      try {
        const balanceNow = await readBalance(senderAddress, toToken);
        const delta = balanceNow - balanceBefore;
        if (delta > 0) {
          received = delta;
          break;
        }
      } catch {
        // Keep polling through a transient balance-read failure, same as the
        // ramp poll loop does.
      }
    }

    if (received <= 0) {
      throw new Error(
        `Swapped to ${toToken.symbol}, but it hadn't arrived in time to send on — it's in your wallet. Try sending ${toToken.symbol} directly.`,
      );
    }

    try {
      const transferTxHash = await transfer({
        token: toToken,
        toAddress,
        amount: received.toString(),
      });
      return { swapTxHash, transferTxHash, forwardedAmount: received.toString() };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'it could not be sent on';
      throw new Error(
        `Swapped to ${toToken.symbol}, but sending it on didn't go through — it's in your wallet. ${reason}`,
      );
    }
  };

  return { swapAndForward };
}
