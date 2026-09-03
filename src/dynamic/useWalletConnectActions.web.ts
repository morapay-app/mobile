import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';

/**
 * Web build: `<DynamicWidget>`'s own connect/account UI is what actually
 * renders the picker — `setShowAuthFlow(true)` is the documented way to
 * open it programmatically (e.g. from this app's own "Connect Wallet"
 * button) rather than requiring the widget's own trigger element.
 */
export function useWalletConnectActions() {
  const { setShowAuthFlow, handleLogOut, primaryWallet } = useDynamicContext();

  return {
    connect: async () => setShowAuthFlow(true),
    disconnect: () => handleLogOut(),
    /**
     * Best-effort, silent chain switch — called whenever the "from" token's
     * chain no longer matches the wallet's active one (see SwapScreen's
     * effect). Never surfaces an error and never throws: an injected wallet
     * like MetaMask still shows its own native "Switch network?" prompt for
     * `wallet_switchEthereumChain` (that's the wallet's UI, not this app's,
     * and there's no way around it), but a smart/embedded wallet that can
     * switch without asking will just do so quietly. Either way, nothing
     * else in this app actually depends on this succeeding — balance reads
     * are already chain-scoped by token, not by the wallet's active chain
     * (see useWalletBalance), and quotes don't touch the wallet at all — so
     * a rejected prompt or an unsupported wallet just leaves things as they
     * were rather than blocking anything.
     */
    switchToChain: async (chainId: string) => {
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) return;
      const targetChainId = Number.parseInt(chainId, 10);
      // Non-EVM chain ids (e.g. Solana's "solana-mainnet-beta") don't
      // parse — nothing to switch an EVM wallet to.
      if (!Number.isFinite(targetChainId)) return;
      try {
        // `supportsNetworkSwitching`/`switchNetwork` live on the wallet's
        // connector, not the wallet itself — `getNetwork`/`switchNetwork`
        // are also exposed directly on the wallet as a convenience, but
        // only the connector reports whether switching is even possible
        // for this wallet type.
        if (!primaryWallet.connector.supportsNetworkSwitching()) return;
        const currentChainId = await primaryWallet.getNetwork();
        if (String(currentChainId) === String(targetChainId)) return;
        await primaryWallet.switchNetwork(targetChainId);
      } catch {
        // Silent by design — see the doc comment above.
      }
    },
  };
}
