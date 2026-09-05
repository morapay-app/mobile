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
  /** What the QR code encodes, and the link in the share caption — always
   * this app's own real web app (`https://app.morapay.io`), not a
   * third-party block explorer: the point of a shared receipt is bringing
   * the person who sees it back to Morapay, not sending them to Basescan.
   * `explorerTxUrl` still exists for anywhere this app wants a real,
   * chain-specific verification link instead, but this field isn't that. */
  verifyUrl: string;
  stats?: ReceiptStats;
  promo?: PromoConfig;
};
