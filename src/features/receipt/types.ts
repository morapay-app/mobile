export type TransactionType = 'SWAP' | 'OFFRAMP' | 'ONRAMP' | 'TRANSFER' | 'PAYMENT_REQUEST' | 'CLAIM';

export type ReceiptStatus = 'SETTLED' | 'CONFIRMED' | 'PENDING' | 'FAILED';

export type ReceiptAsset = {
  /** Already formatted for display, e.g. "500" or "7,500.00" — this feature
   * never reformats a number, only ever echoes what the caller already
   * decided to show. */
  amount: string;
  symbol: string;
};

/** Bragging-rights stats — every field optional since not every
 * transaction type has all three (an ONRAMP has no "fee saved" figure to
 * brag about the way an OFFRAMP-vs-a-bank comparison does). */
export type ReceiptStats = {
  /** e.g. "42s" */
  settlementTime?: string;
  /** e.g. "$14.20" or "~85%" */
  feeSaved?: string;
  /** e.g. "MOMO", "BANK", "ON-CHAIN" */
  settlementMethod?: string;
};

export type PromoConfig = {
  emoji: string;
  text: string;
};

export type ReceiptData = {
  /** Short display id, e.g. "849201" — shown as "#TX-849201" in the header. */
  id: string;
  type: TransactionType;
  status: ReceiptStatus;
  from: ReceiptAsset;
  to: ReceiptAsset;
  /** Recipient tag for TRANSFER, requester context for PAYMENT_REQUEST —
   * unused by the other statement patterns. */
  counterparty?: string;
  timestamp: number;
  /** What the QR code encodes — a real block-explorer tx link when one
   * exists (see `explorerTxUrl`), or this app's own claim/request link
   * otherwise. Never a guessed/placeholder URL. */
  verifyUrl: string;
  stats?: ReceiptStats;
  promo?: PromoConfig;
};
