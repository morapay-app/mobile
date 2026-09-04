import { render, screen } from '@testing-library/react-native';

import { TransactionStepper } from '../TransactionStepper';

describe('TransactionStepper', () => {
  it('marks the current status as in progress and later steps as up next', async () => {
    await render(<TransactionStepper status="ON_CHAIN_CONFIRMING" fiatType="GHS" />);

    expect(screen.getByText('On-Chain Confirmation')).toBeTruthy();
    // Two "In progress…" wouldn't be right — exactly one step is active at a time.
    expect(screen.getAllByText('In progress…')).toHaveLength(1);
    expect(screen.getAllByText('Up next')).toHaveLength(2);
    expect(screen.queryByText('Completed')).toBeNull();
  });

  it('marks earlier steps completed and names the fiat currency in the swap step', async () => {
    await render(<TransactionStepper status="MOMO_SETTLEMENT" fiatType="NGN" />);

    expect(screen.getByText('Converting to NGN')).toBeTruthy();
    expect(screen.getAllByText('Completed')).toHaveLength(2);
    expect(screen.getAllByText('In progress…')).toHaveLength(1);
    expect(screen.queryByText('Up next')).toBeNull();
  });

  it('renders nothing for a terminal status — the sheet shows those separately', async () => {
    await render(<TransactionStepper status="COMPLETED" fiatType="GHS" />);
    expect(screen.queryByTestId('transaction-stepper')).toBeNull();

    await render(<TransactionStepper status="FAILED" fiatType="GHS" />);
    expect(screen.queryByTestId('transaction-stepper')).toBeNull();
  });

  it('reads fiat-in, crypto-out for an onramp — the same status values mean the opposite thing', async () => {
    await render(<TransactionStepper status="ON_CHAIN_CONFIRMING" fiatType="GHS" cryptoType="ETH" direction="onramp" />);
    expect(screen.getByText('Confirming Payment')).toBeTruthy();

    await render(<TransactionStepper status="SWAP_PROCESSING" fiatType="GHS" cryptoType="ETH" direction="onramp" />);
    expect(screen.getByText('Converting to ETH')).toBeTruthy();

    await render(<TransactionStepper status="MOMO_SETTLEMENT" fiatType="GHS" cryptoType="ETH" direction="onramp" />);
    expect(screen.getByText('Sending ETH to Your Wallet')).toBeTruthy();
  });
});
