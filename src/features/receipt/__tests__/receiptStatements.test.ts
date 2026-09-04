import { colorwayFor, explorerTxUrl, shareCaptionFor, statementFor } from '../receiptStatements';
import type { ReceiptData } from '../types';

function makeReceipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    id: 'ABC123',
    type: 'SWAP',
    status: 'SETTLED',
    from: { amount: '500', symbol: 'USDC' },
    to: { amount: '7,500', symbol: 'GHS' },
    timestamp: Date.now(),
    verifyUrl: 'https://basescan.org/tx/0xabc',
    ...overrides,
  };
}

describe('statementFor', () => {
  it('SWAP', () => {
    expect(statementFor(makeReceipt({ type: 'SWAP' }))).toBe('SWAPPED 500 USDC FOR 7,500 GHS INSTANTLY');
  });

  it('OFFRAMP', () => {
    expect(statementFor(makeReceipt({ type: 'OFFRAMP' }))).toBe('OFFRAMPED 500 USDC DIRECT TO MOMO GHS');
  });

  it('ONRAMP names the real fiat currency, not a hardcoded one', () => {
    expect(
      statementFor(makeReceipt({ type: 'ONRAMP', from: { amount: '300', symbol: 'NGN' }, to: { amount: '20', symbol: 'USDC' } })),
    ).toBe('LOADED 20 USDC WITH NGN');
  });

  it('TRANSFER falls back to a generic tag when no counterparty is given', () => {
    expect(statementFor(makeReceipt({ type: 'TRANSFER', counterparty: undefined }))).toBe(
      'SENT 500 USDC TO RECIPIENT IN SECONDS',
    );
  });

  it('TRANSFER uses the real counterparty tag when given', () => {
    expect(statementFor(makeReceipt({ type: 'TRANSFER', counterparty: '@ama' }))).toBe(
      'SENT 500 USDC TO @ama IN SECONDS',
    );
  });

  it('PAYMENT_REQUEST', () => {
    expect(statementFor(makeReceipt({ type: 'PAYMENT_REQUEST' }))).toBe('INVOICE GENERATED: REQUESTING 500 USDC');
  });

  it('CLAIM', () => {
    expect(statementFor(makeReceipt({ type: 'CLAIM' }))).toBe('COLLECTED 7,500 GHS VIA MORAPAY');
  });
});

describe('colorwayFor', () => {
  it('gives every transaction type its own distinct accent', () => {
    const types: ReceiptData['type'][] = ['SWAP', 'OFFRAMP', 'ONRAMP', 'TRANSFER', 'PAYMENT_REQUEST', 'CLAIM'];
    const accents = types.map((type) => colorwayFor(type).accent);
    expect(new Set(accents).size).toBe(types.length);
  });
});

describe('shareCaptionFor', () => {
  it('includes the destination amount, the settlement time, and the real verify link', () => {
    const caption = shareCaptionFor(makeReceipt({ stats: { settlementTime: '42s' } }));
    expect(caption).toContain('7,500 GHS');
    expect(caption).toContain('in 42s');
    expect(caption).toContain('https://basescan.org/tx/0xabc');
  });

  it('omits the timing clause when no settlement time is known', () => {
    const caption = shareCaptionFor(makeReceipt({ stats: undefined }));
    expect(caption).not.toContain('@morapay_io in');
    expect(caption).toContain('@morapay_io ⚡️');
  });
});

describe('explorerTxUrl', () => {
  it('builds a real explorer link for a known chain', () => {
    expect(explorerTxUrl('8453', '0xdeadbeef')).toBe('https://basescan.org/tx/0xdeadbeef');
  });

  it('returns null for a chain with no known explorer, rather than guessing one', () => {
    expect(explorerTxUrl('999999', '0xdeadbeef')).toBeNull();
  });
});
