import { dynamicClient } from './dynamicClient';
import { viemChainForId } from './viemChains';

/**
 * A real viem wallet client for the connected EVM wallet on `chainId`,
 * NATIVE ONLY — the counterpart of the web build's
 * `primaryWallet.getWalletClient(chainId)`.
 *
 * This is the one piece that kept native execution stubbed out: the RN SDK
 * routes signing through `ReactNativeExtension`'s embedded WebView via
 * `ViemExtension`'s custom transport, and its `createWalletClient` needs a
 * viem `Chain` object rather than just an id (see viemChains.ts). With that
 * supplied, the client it returns is an ordinary
 * `WalletClient<CustomTransport, Chain, Account>` — same `sendTransaction`
 * and `signTypedData` surface the web path already uses, so every caller's
 * logic is identical on both platforms.
 *
 * Wallet lookup matches `useWallet.ts`'s own EVM check (`chain?` guarded —
 * a wallet pushed into the reactive store mid-connect can have `chain`
 * unset). Errors thrown here are already user-facing copy; callers funnel
 * them through `friendlyExecutionError` like any other execution failure.
 */
export async function getNativeEvmWalletClient(chainId: string) {
  const wallet = dynamicClient.wallets.userWallets.find((w) => w.chain?.toLowerCase().includes('evm'));
  if (!wallet) {
    throw new Error('Connect a wallet to continue.');
  }

  const chain = viemChainForId(chainId);
  if (!chain) {
    throw new Error("This chain isn't supported yet.");
  }

  // Best-effort, same fire-and-forget contract as
  // `useWalletConnectActions.switchToChain`: the client below is pinned to
  // `chain` explicitly, but a wallet sitting on a different network can still
  // refuse the send, and the target chain here isn't always the one
  // SwapScreen already nudged towards (a pool-deposit chain comes from
  // server calldata). Never fatal — a wallet that can't switch just proceeds
  // and surfaces its own error if it actually matters.
  try {
    const { network } = await dynamicClient.wallets.getNetwork({ wallet });
    if (String(network) !== chainId) {
      await dynamicClient.wallets.switchNetwork({ wallet, chainId });
    }
  } catch {
    // Intentionally ignored — see above.
  }

  const walletClient = await dynamicClient.viem.createWalletClient({ wallet, chain });
  if (!walletClient?.account) {
    throw new Error("Your wallet isn't ready. Try reconnecting.");
  }
  return walletClient;
}
