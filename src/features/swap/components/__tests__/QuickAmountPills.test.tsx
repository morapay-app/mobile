import { render, screen } from '@testing-library/react-native';

import { QuickAmountPills } from '../QuickAmountPills';

describe('QuickAmountPills', () => {
  it('shows plain dollar amounts under 1,000 unshortened', async () => {
    await render(<QuickAmountPills amounts={[20, 50, 100, 250]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText('$20')).toBeTruthy();
    expect(screen.getByText('$250')).toBeTruthy();
  });

  // Real bug: a large fiat quick amount (NGN's 50,000, for one) spelled out
  // in full overflowed the pill row on a real device.
  it('shortens large fiat amounts so the pill never has to spell out the full number', async () => {
    await render(
      <QuickAmountPills amounts={[5000, 10000, 20000, 50000]} currency="NGN" selected={null} onSelect={() => {}} />,
    );
    expect(screen.getByText('5k NGN')).toBeTruthy();
    expect(screen.getByText('10k NGN')).toBeTruthy();
    expect(screen.getByText('20k NGN')).toBeTruthy();
    expect(screen.getByText('50k NGN')).toBeTruthy();
  });

  it('keeps one decimal only where it is actually needed', async () => {
    await render(<QuickAmountPills amounts={[2500, 1_500_000]} currency="GHS" selected={null} onSelect={() => {}} />);
    expect(screen.getByText('2.5k GHS')).toBeTruthy();
    expect(screen.getByText('1.5M GHS')).toBeTruthy();
  });

  it('shortens millions', async () => {
    await render(<QuickAmountPills amounts={[1_000_000]} currency="NGN" selected={null} onSelect={() => {}} />);
    expect(screen.getByText('1M NGN')).toBeTruthy();
  });
});
