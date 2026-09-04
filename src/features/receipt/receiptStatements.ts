import type { ReceiptData, TransactionType } from './types';

export type ReceiptColorway = {
  /** The ticket's own background AND the modal backdrop behind it — kept
   * identical so `PerforatedTicket`'s punch notches (small circles painted
   * in this color) read as real cutouts instead of colored dots. */
  bg: string;
  /** Card surface, one step up from `bg` — the ticket itself sits on this,
   * not directly on the backdrop, so the notches have something to punch. */
  surface: string;
  accent: string;
  accentSecondary: string;
  textOnAccent: string;
  textPrimary: string;
  textMuted: string;
};

/** One colorway per transaction type, per the spec's table — deep,
 * near-black bases (never pure black, so the neon accents don't look like
 * they're floating on a void) each paired with one signature neon. */
const COLORWAYS: Record<TransactionType, ReceiptColorway> = {
  SWAP: {
    bg: '#0A0A12',
    surface: '#131320',
    accent: '#8B5CF6',
    accentSecondary: '#00F0FF',
    textOnAccent: '#0A0A12',
    textPrimary: '#F5F3FF',
    textMuted: '#9C95C2',
  },
  OFFRAMP: {
    bg: '#06120C',
    surface: '#0F1F17',
    accent: '#00FF66',
    accentSecondary: '#0AE05C',
    textOnAccent: '#031B0E',
    textPrimary: '#EAFBF1',
    textMuted: '#7FBF9B',
  },
  ONRAMP: {
    bg: '#161206',
    surface: '#26200D',
    accent: '#FFD400',
    accentSecondary: '#FFB800',
    textOnAccent: '#1A1503',
    textPrimary: '#FFF9E0',
    textMuted: '#C4B679',
  },
  TRANSFER: {
    bg: '#12070F',
    surface: '#1F0E1A',
    accent: '#FF2A85',
    accentSecondary: '#FF6AB0',
    textOnAccent: '#1A0511',
    textPrimary: '#FFE9F3',
    textMuted: '#C88AA9',
  },
  PAYMENT_REQUEST: {
    bg: '#050B16',
    surface: '#0B1730',
    accent: '#00B2FF',
    accentSecondary: '#4FD1FF',
    textOnAccent: '#03101F',
    textPrimary: '#E6F6FF',
    textMuted: '#7DA9C7',
  },
  CLAIM: {
    bg: '#0A0714',
    surface: '#1A1030',
    accent: '#3DF2A0',
    accentSecondary: '#B78CFF',
    textOnAccent: '#06170F',
    textPrimary: '#EFF8FF',
    textMuted: '#9E93C4',
  },
};

export function colorwayFor(type: TransactionType): ReceiptColorway {
  return COLORWAYS[type];
}

/** The bold, bragging-rights headline — one pattern per transaction type,
 * per the spec's table. "LOADED [AMOUNT] [CRYPTO] WITH GHANA CEDIS" in the
 * original spec is GHS-specific phrasing; this app also settles in NGN and
 * BOB (see swap/data/tokens.ts), so the fiat side is named from the real
 * transaction data instead of hardcoded — same call already made for the
 * transaction tracker's own step labels. */
export function statementFor(data: ReceiptData): string {
  const { type, from, to, counterparty } = data;
  switch (type) {
    case 'SWAP':
      return `SWAPPED ${from.amount} ${from.symbol} FOR ${to.amount} ${to.symbol} INSTANTLY`;
    case 'OFFRAMP':
      return `OFFRAMPED ${from.amount} ${from.symbol} DIRECT TO MOMO ${to.symbol}`;
    case 'ONRAMP':
      return `LOADED ${to.amount} ${to.symbol} WITH ${from.symbol}`;
    case 'TRANSFER':
      return `SENT ${from.amount} ${from.symbol} TO ${counterparty ?? 'RECIPIENT'} IN SECONDS`;
    case 'PAYMENT_REQUEST':
      return `INVOICE GENERATED: REQUESTING ${from.amount} ${from.symbol}`;
    case 'CLAIM':
      return `COLLECTED ${to.amount} ${to.symbol} VIA MORAPAY`;
  }
}

/** Pre-filled caption for the Web Share API / X-intent / WhatsApp fallback
 * — same bragging-rights voice as the headline, with the real settlement
 * time folded in when this transaction actually has one. */
export function shareCaptionFor(data: ReceiptData): string {
  const headlineAmount = `${data.to.amount} ${data.to.symbol}`;
  const timing = data.stats?.settlementTime ? ` in ${data.stats.settlementTime}` : '';
  return `Just settled ${headlineAmount} on @morapay_io${timing} ⚡️ The fastest crypto-fiat gateway in West Africa. ${data.verifyUrl}`;
}

/** Keyed by the same `chainId` values `chainMeta.ts`'s `CHAIN_META` table
 * uses — only the chains this app's own catalog actually surfaces tokens
 * for. An unlisted/unknown chainId has no real explorer link to build, so
 * callers should fall back to this app's own claim/receipt URL instead of
 * guessing one (see `ReceiptData.verifyUrl`'s doc). */
const EXPLORER_TX_BASE: Record<string, string> = {
  '1': 'https://etherscan.io/tx/',
  '8453': 'https://basescan.org/tx/',
  '56': 'https://bscscan.com/tx/',
  '42161': 'https://arbiscan.io/tx/',
  '137': 'https://polygonscan.com/tx/',
  '43114': 'https://snowtrace.io/tx/',
  '10': 'https://optimistic.etherscan.io/tx/',
  'solana-mainnet-beta': 'https://solscan.io/tx/',
};

export function explorerTxUrl(chainId: string, txHash: string): string | null {
  const base = EXPLORER_TX_BASE[chainId];
  return base ? `${base}${txHash}` : null;
}
