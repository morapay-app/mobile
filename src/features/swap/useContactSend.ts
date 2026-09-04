import {
  confirmPoolDeposit,
  createContactTransferIntent,
  isEvmPoolDeposit,
  notifyCustodialSend,
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
  /** The value stored as `fromIdentifier`/`payer_email` — required for
   * `notifyCustodialSend` to run at all (see api/appTransfer.ts's doc), but
   * NOT what actually gets the recipient their claim code: Core's notify
   * service sends the code straight to the recipient regardless of this
   * value — email via its email channel, phone via SMS (see
   * ContactSendResultSheet's doc). This app has no authenticated session to
   * read a real sender email from (connect-only wallet) and no longer asks
   * for one in the UI, so callers pass a stable placeholder here purely to
   * satisfy Core's non-empty, "@"-shaped
   * requirement. */
  senderEmail: string;
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
  /**
   * Whether the claim-code/OTP notification actually went out. `false`
   * doesn't mean the send failed either — the deposit and confirm can both
   * have succeeded while this one best-effort step didn't. It's surfaced
   * separately so the UI can say "sent, but we couldn't email the details —
   * contact support" instead of silently implying the recipient has
   * everything they need to claim.
   */
  notified: boolean;
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
    // Confirmed live (see api/appTransfer.ts's doc): there is no fiat/mobile-
    // money-funded branch anywhere in Core's send-to-contact path. Kept
    // short deliberately — the UI surfaces this as a disabled "Coming soon"
    // button rather than a long inline error (see SwapScreen.tsx's
    // `contactSendBlocked`), so this string only needs to read well as a
    // brief caption underneath it.
    return 'Coming soon. Pick a crypto token to send to a phone number or email.';
  }
  if (token.address === 'native') {
    return `Can't send ${token.symbol} that way yet. Try a token like USDC.`;
  }
  if (!viemChainForId(token.chainId)) {
    return `${token.chainName} isn't supported for this yet.`;
  }
  return null;
}

/**
 * Real "send to an email or phone number" — the four-step flow Core
 * actually needs (see api/appTransfer.ts for why it routes through the
 * platform pool rather than straight to a recipient address, and why step 4
 * is required rather than automatic):
 *
 *   1. `POST /api/public/app-transfer/intent` opens the transfer and returns
 *      the deposit calldata.
 *   2. The sender signs that ERC-20 deposit from their own wallet — the same
 *      `useTokenTransfer` primitive a plain address send uses, just aimed at
 *      the pool address and contract the server named.
 *   3. `POST /api/public/offramp/confirm` hands back the hash; Core verifies
 *      it on-chain and takes custody.
 *   4. `POST /api/public/app-transfer/custodial-notify` generates the claim
 *      code/OTP and emails both the sender (the code to relay) and, for an
 *      email beneficiary, the recipient (their OTP + claim link) — nothing
 *      is claimable by anyone until this step runs.
 */
export function useContactSend() {
  const { transfer } = useTokenTransfer();

  const sendToContact = async ({
    fromToken,
    toToken,
    amount,
    toAmount,
    senderAddress,
    senderEmail,
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
      payerEmail: senderEmail,
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

    // Past this line the funds have genuinely left the wallet, so nothing
    // below reports this as a failed send — only which of the two
    // best-effort follow-up steps (confirm, notify) actually landed.
    let confirmed: boolean;
    try {
      await confirmPoolDeposit({ transactionId: intent.transaction_id, txHash });
      confirmed = true;
    } catch {
      confirmed = false;
    }

    // Notify is idempotent server-side and doesn't require the deposit to
    // already be confirmed (it only reads the transaction's own recipient
    // fields) — attempted regardless of `confirmed`, since a confirm retry
    // happening later shouldn't be what gates the recipient finding out.
    let notified = false;
    try {
      await notifyCustodialSend(intent.transaction_id);
      notified = true;
    } catch {
      notified = false;
    }

    return { transactionId: intent.transaction_id, txHash, confirmed, notified };
  };

  return { sendToContact };
}
