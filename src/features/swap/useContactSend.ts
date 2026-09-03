import {
  confirmPoolDeposit,
  createContactTransferIntent,
  isEvmPoolDeposit,
  type EvmPoolDepositCalldata,
} from '../../api/appTransfer';
import { coreChainSlug } from './coreChain';
import { useTokenTransfer } from './useTokenTransfer';
import { viemChainForId } from '../../dynamic/viemChains';
import type { SwapToken } from './data/tokens';

export type ContactRecipient = {
  kind: 'email' | 'phone';
  value: string;
};

export type ContactSendParams = {
  fromToken: SwapToken;
  /** What the recipient should end up receiving. */
  toToken: SwapToken;
  /** Human-readable amount in fromToken units. */
  amount: number;
  /** Human-readable amount in toToken units, from the live quote. */
  toAmount: number;
  /** The sender's own connected wallet — the on-chain identity for the
   * deposit, which Core validates against the paying chain's ecosystem. */
  senderAddress: string;
  recipient: ContactRecipient;
};

export type ContactSendResult = {
  transactionId: string;
  txHash: string;
  /**
   * Whether Core accepted the confirmation that releases the recipient's
   * claim. `false` means the on-chain deposit genuinely succeeded but the
   * confirm call didn't land — the money HAS moved, so this must never be
   * reported to the user as a failed send.
   */
  confirmed: boolean;
};

/**
 * Why a token can be ineligible before any network call: Core builds the
 * pool-deposit instruction from its own `SupportedToken` row and refuses a
 * native placeholder address outright ("use the wrapped ERC-20 contract
 * address" — see `buildEvmInstruction` in
 * core/src/services/payment-instruction.service.ts), and the deposit itself
 * is only signable here on a chain this app has a viem `Chain` for. Checking
 * both up front turns two opaque server-side rejections into one precise
 * message, and the server's own catalog check still has the final say on
 * whether a given ERC-20 is actually pool-supported.
 */
export function contactSendBlockedReason(token: SwapToken): string | null {
  if (token.type !== 'crypto') {
    return "Paying with mobile money to a phone number or email isn't available yet — send to a wallet address instead.";
  }
  if (token.address === 'native') {
    return `Sending ${token.symbol} to a phone number or email isn't supported yet — try a token like USDC.`;
  }
  if (!viemChainForId(token.chainId)) {
    return `Sending from ${token.chainName} to a phone number or email isn't supported yet.`;
  }
  return null;
}

/**
 * Real "send to an email or phone number" — the three-step flow Core
 * actually implements (see api/appTransfer.ts for why it routes through the
 * platform pool rather than straight to a recipient address):
 *
 *   1. `POST /api/public/app-transfer/intent` opens the transfer and returns
 *      the deposit calldata.
 *   2. The sender signs that ERC-20 deposit from their own wallet — the same
 *      `useTokenTransfer` primitive a plain address send uses, just aimed at
 *      the pool address and contract the server named.
 *   3. `POST /api/public/offramp/confirm` hands back the hash; Core verifies
 *      it on-chain, takes custody, and raises the Claim the recipient
 *      redeems.
 */
export function useContactSend() {
  const { transfer } = useTokenTransfer();

  const sendToContact = async ({
    fromToken,
    toToken,
    amount,
    toAmount,
    senderAddress,
    recipient,
  }: ContactSendParams): Promise<ContactSendResult> => {
    const intent = await createContactTransferIntent({
      fromChainSlug: coreChainSlug(fromToken.chainId),
      fromTokenSymbol: fromToken.symbol,
      fromAmount: amount.toString(),
      toChainSlug: coreChainSlug(toToken.chainId),
      toTokenSymbol: toToken.symbol,
      toAmount: toAmount.toString(),
      senderAddress,
      recipientEmail: recipient.kind === 'email' ? recipient.value : undefined,
      recipientPhone: recipient.kind === 'phone' ? recipient.value : undefined,
    });

    if (!isEvmPoolDeposit(intent.calldata)) {
      // Core returned a Solana/Stellar/Bitcoin (or explicitly unsupported)
      // instruction — real data, but nothing this app can sign today. Nothing
      // has moved at this point, so refusing here is safe.
      throw new Error("Sending this token to a phone number or email isn't supported yet.");
    }

    const calldata: EvmPoolDepositCalldata = intent.calldata;
    const txHash = await transfer({
      token: {
        chainId: String(calldata.chainId),
        address: calldata.tokenAddress,
        decimals: calldata.decimals,
      },
      toAddress: calldata.toAddress,
      // The server's own amount, not the client's — it's what Core will
      // verify the on-chain transfer against.
      amount: calldata.amount,
    });

    // Past this line the funds have genuinely left the wallet, so a failing
    // confirm is reported as "sent, not yet confirmed" rather than an error.
    try {
      await confirmPoolDeposit({ transactionId: intent.transaction_id, txHash });
      return { transactionId: intent.transaction_id, txHash, confirmed: true };
    } catch {
      return { transactionId: intent.transaction_id, txHash, confirmed: false };
    }
  };

  return { sendToContact };
}
