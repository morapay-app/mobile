import { render, screen } from '@testing-library/react-native';

import { PerforatedTicket } from '../components/PerforatedTicket';
import { colorwayFor } from '../receiptStatements';
import type { ReceiptData } from '../types';

const DATA: ReceiptData = {
  id: 'ABC123',
  type: 'SWAP',
  status: 'SETTLED',
  from: { amount: '500', symbol: 'USDC' },
  to: { amount: '7,500', symbol: 'GHS' },
  timestamp: Date.now(),
  verifyUrl: 'https://basescan.org/tx/0xabc',
  stats: { settlementTime: '42s', settlementMethod: 'ON-CHAIN' },
};

describe('PerforatedTicket', () => {
  it('renders the dynamic headline, the tx id, and both route amounts', async () => {
    await render(<PerforatedTicket data={DATA} colorway={colorwayFor(DATA.type)} />);
    expect(screen.getByText('SWAPPED 500 USDC FOR 7,500 GHS INSTANTLY')).toBeTruthy();
    expect(screen.getByText('#TX-ABC123')).toBeTruthy();
    expect(screen.getByText('500 USDC')).toBeTruthy();
    expect(screen.getByText('7,500 GHS')).toBeTruthy();
  });

  it('shows only the stats that were actually provided', async () => {
    await render(<PerforatedTicket data={DATA} colorway={colorwayFor(DATA.type)} />);
    expect(screen.getByText('42s')).toBeTruthy();
    expect(screen.getByText('ON-CHAIN')).toBeTruthy();
    expect(screen.queryByText('SAVED')).toBeNull();
  });

  it('renders a promo banner only when one is configured', async () => {
    const { rerender } = await render(<PerforatedTicket data={DATA} colorway={colorwayFor(DATA.type)} />);
    expect(screen.queryByText(/Invite a Merchant/)).toBeNull();

    const withPromo: ReceiptData = { ...DATA, promo: { emoji: '🎁', text: 'Invite a Merchant -> Earn $10' } };
    await rerender(<PerforatedTicket data={withPromo} colorway={colorwayFor(withPromo.type)} />);
    expect(screen.getByText('Invite a Merchant -> Earn $10')).toBeTruthy();
  });
});
