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

// Shared across every colorway below — real Morapay brand tones, not a
// generic dark-mode gray: `surface` is the exact teal from the live logo
// (morapay.io/logo.png, also the landing site's own `--primary`), `bg` one
// step darker so the ticket sits visibly on top of it. One shared
// text pair (rather than a different tint per type, like the palette this
// replaced) is what makes six tickets read as one family instead of six
// unrelated designs that happen to share a layout.
const TICKET_BG = '#02191A';
const TICKET_SURFACE = '#023436';
const TICKET_TEXT_PRIMARY = '#EAFBF3';
const TICKET_TEXT_MUTED = '#6FA89A';

/** One accent per transaction type — every hex here is either sampled
 * directly from a real Morapay asset (the logo's mint-gradient glyph, the
 * landing site's own palette) or a same-family shade of one, replacing the
 * previous six-color neon rainbow (violet/green/yellow/pink/blue/mint) that
 * had nothing to do with this app's actual brand. */
const COLORWAYS: Record<TransactionType, ReceiptColorway> = {
  SWAP: {
    bg: TICKET_BG,
    surface: TICKET_SURFACE,
    accent: '#38D690', // the logo glyph's own mint
    accentSecondary: '#3ADB93',
    textOnAccent: '#032018',
    textPrimary: TICKET_TEXT_PRIMARY,
    textMuted: TICKET_TEXT_MUTED,
  },
  OFFRAMP: {
    bg: TICKET_BG,
    surface: TICKET_SURFACE,
    accent: '#5EEAD4', // cyan-mint, same family as the portfolio card tones
    accentSecondary: '#2DD4BF',
    textOnAccent: '#032018',
    textPrimary: TICKET_TEXT_PRIMARY,
    textMuted: TICKET_TEXT_MUTED,
  },
  ONRAMP: {
    bg: TICKET_BG,
    surface: TICKET_SURFACE,
    accent: '#4CDB9C', // the primary button's own green
    accentSecondary: '#38D690',
    textOnAccent: '#032018',
    textPrimary: TICKET_TEXT_PRIMARY,
    textMuted: TICKET_TEXT_MUTED,
  },
  TRANSFER: {
    bg: TICKET_BG,
    surface: TICKET_SURFACE,
    accent: '#8EDC5C', // landing site's yellow-green mint
    accentSecondary: '#9FE870',
    textOnAccent: '#1A2E0A',
    textPrimary: TICKET_TEXT_PRIMARY,
    textMuted: TICKET_TEXT_MUTED,
  },
  PAYMENT_REQUEST: {
    bg: TICKET_BG,
    surface: TICKET_SURFACE,
    accent: '#6648FC', // landing site's brand purple — a real, deliberately
    accentSecondary: '#8B6BFF', // distinct hue, not another shade of mint
    textOnAccent: '#F5F3FF',
    textPrimary: TICKET_TEXT_PRIMARY,
    textMuted: TICKET_TEXT_MUTED,
  },
  CLAIM: {
    bg: TICKET_BG,
    surface: TICKET_SURFACE,
    accent: '#3ADB93', // the logo glyph's second gradient stop
    accentSecondary: '#38D690',
    textOnAccent: '#032018',
    textPrimary: TICKET_TEXT_PRIMARY,
    textMuted: TICKET_TEXT_MUTED,
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
 * time folded in when this transaction actually has one. Real handle
 * (@morapayglobal, not the old @morapay_io) and global framing — Morapay
 * isn't a West-Africa-only product. */
export function shareCaptionFor(data: ReceiptData): string {
  const headlineAmount = `${data.to.amount} ${data.to.symbol}`;
  const timing = data.stats?.settlementTime ? ` in ${data.stats.settlementTime}` : '';
  return `Just settled ${headlineAmount} on @morapayglobal${timing} ⚡️ The fastest crypto-fiat gateway, anywhere. ${data.verifyUrl}`;
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
