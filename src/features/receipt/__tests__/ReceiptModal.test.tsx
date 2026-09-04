import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ReceiptModal } from '../components/ReceiptModal';
import type { ReceiptData } from '../types';

const mockCaptureReceipt = jest.fn();
const mockDownloadReceipt = jest.fn();
const mockShareReceipt = jest.fn();
jest.mock('../exportReceipt', () => ({
  captureReceipt: (...args: unknown[]) => mockCaptureReceipt(...args),
  downloadReceipt: (...args: unknown[]) => mockDownloadReceipt(...args),
  shareReceipt: (...args: unknown[]) => mockShareReceipt(...args),
}));

const mockSetStringAsync = jest.fn();
jest.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => mockSetStringAsync(value),
}));

const testMetrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const DATA: ReceiptData = {
  id: 'ABC123',
  type: 'SWAP',
  status: 'SETTLED',
  from: { amount: '500', symbol: 'USDC' },
  to: { amount: '7,500', symbol: 'GHS' },
  timestamp: Date.now(),
  verifyUrl: 'https://basescan.org/tx/0xabc',
  stats: { settlementTime: '42s' },
};

async function renderModal(props: Partial<React.ComponentProps<typeof ReceiptModal>> = {}) {
  const onClose = jest.fn();
  const utils = await render(
    <SafeAreaProvider initialMetrics={testMetrics}>
      <ReceiptModal visible data={DATA} onClose={onClose} {...props} />
    </SafeAreaProvider>,
  );
  return { ...utils, onClose };
}

beforeEach(() => {
  mockCaptureReceipt.mockReset().mockResolvedValue('data:image/png;base64,fake');
  mockDownloadReceipt.mockReset().mockResolvedValue(undefined);
  mockShareReceipt.mockReset().mockResolvedValue('shared');
  mockSetStringAsync.mockReset();
});

describe('ReceiptModal', () => {
  it('renders nothing when not visible', async () => {
    await render(
      <SafeAreaProvider initialMetrics={testMetrics}>
        <ReceiptModal visible={false} data={DATA} onClose={() => {}} />
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('receipt-modal-close')).toBeNull();
  });

  it('renders nothing when there is no receipt data yet', async () => {
    await render(
      <SafeAreaProvider initialMetrics={testMetrics}>
        <ReceiptModal visible data={null} onClose={() => {}} />
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('receipt-modal-close')).toBeNull();
  });

  it('shows the receipt id in the header badge and the statement headline', async () => {
    await renderModal();
    expect(screen.getByText(/RECEIPT #ABC123/)).toBeTruthy();
    expect(screen.getByText('SWAPPED 500 USDC FOR 7,500 GHS INSTANTLY')).toBeTruthy();
  });

  it('closing calls onClose', async () => {
    const { onClose } = await renderModal();
    fireEvent.press(screen.getByTestId('receipt-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Save Image captures the ticket and hands the result to downloadReceipt', async () => {
    await renderModal();
    await act(async () => {
      fireEvent.press(screen.getByTestId('receipt-modal-download'));
    });
    await waitFor(() => expect(mockDownloadReceipt).toHaveBeenCalledWith('data:image/png;base64,fake'));
    expect(mockCaptureReceipt).toHaveBeenCalledTimes(1);
  });

  it('Share Receipt captures the ticket and hands the result + caption to shareReceipt', async () => {
    await renderModal();
    await act(async () => {
      fireEvent.press(screen.getByTestId('receipt-modal-share'));
    });
    await waitFor(() => expect(mockShareReceipt).toHaveBeenCalledTimes(1));
    const [uri, caption] = mockShareReceipt.mock.calls[0];
    expect(uri).toBe('data:image/png;base64,fake');
    expect(caption).toContain('7,500 GHS');
  });

  it('falls back to the share drawer when native share is unsupported', async () => {
    mockShareReceipt.mockResolvedValue('unsupported');
    await renderModal();
    await act(async () => {
      fireEvent.press(screen.getByTestId('receipt-modal-share'));
    });
    await waitFor(() => expect(screen.getByTestId('share-fallback-copy')).toBeTruthy());

    fireEvent.press(screen.getByTestId('share-fallback-copy'));
    expect(mockSetStringAsync).toHaveBeenCalledWith(DATA.verifyUrl);
  });

  it('shows an inline error if capture fails, instead of failing silently', async () => {
    mockCaptureReceipt.mockRejectedValue(new Error('boom'));
    await renderModal();
    await act(async () => {
      fireEvent.press(screen.getByTestId('receipt-modal-download'));
    });
    await waitFor(() => expect(screen.getByTestId('receipt-modal-error')).toBeTruthy());
  });
});
