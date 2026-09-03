import { dynamicClient } from './dynamicClient';

/**
 * Native build (default — Metro only prefers `.web.ts` on web): the real
 * connect/disconnect UI lives inside dynamicClient.reactNative.WebView
 * (mounted at the app root), triggered via the SDK's own imperative calls.
 */
export function useWalletConnectActions() {
  return {
    connect: () => dynamicClient.ui.auth.show(),
    disconnect: () => dynamicClient.auth.logout(),
    /**
     * Best-effort, silent chain switch — mirrors the web variant's
     * `switchToChain` (see its doc comment for why this is fire-and-forget
     * and never surfaces an error). `dynamicClient.wallets.switchNetwork`
     * is the real RN SDK call, routed through the same embedded WebView
     * every other wallet action here goes through.
     */
    switchToChain: async (chainId: string) => {
      const wallet = dynamicClient.wallets.userWallets.find((w) => w.chain?.toLowerCase().includes('evm'));
      if (!wallet) return;
      try {
        const { network: currentChainId } = await dynamicClient.wallets.getNetwork({ wallet });
        if (String(currentChainId) === chainId) return;
        await dynamicClient.wallets.switchNetwork({ wallet, chainId });
      } catch {
        // Silent by design — see the web variant's doc comment.
      }
    },
  };
}
