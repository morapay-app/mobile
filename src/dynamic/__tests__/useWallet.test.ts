import { renderHook } from '@testing-library/react-native';

// `useWallet.ts` (the native build) reads wallet state through
// `useReactiveClient(dynamicClient)` — faked here as plain state so a test
// can hand back whatever `userWallets` shape it wants, including a
// mid-connect wallet object that hasn't populated every field yet.
let mockUserWallets: Array<{ chain?: string; address?: string }> = [];
jest.mock('@dynamic-labs/legacy-react-hooks', () => ({
  useReactiveClient: () => ({ wallets: { userWallets: mockUserWallets } }),
}));
jest.mock('../dynamicClient', () => ({ dynamicClient: {} }));

import { useWallet } from '../useWallet';

describe('useWallet (native)', () => {
  it('reports disconnected when there are no wallets', async () => {
    mockUserWallets = [];
    const { result } = await renderHook(() => useWallet());
    expect(result.current.connected).toBe(false);
    expect(result.current.address).toBeNull();
  });

  it('finds the EVM wallet by chain, case-insensitively', async () => {
    mockUserWallets = [{ chain: 'SOL', address: '0xsol' }, { chain: 'EVM', address: '0xevm' }];
    const { result } = await renderHook(() => useWallet());
    expect(result.current.connected).toBe(true);
    expect(result.current.address).toBe('0xevm');
  });

  // Regression test: a wallet object the SDK pushes into its reactive store
  // mid-connect (e.g. right after the user signs, before every field has
  // populated) can have `chain` still unset. A bare `wallet.chain.toLowerCase()`
  // throws in that case, uncaught, crashing the whole app (no ErrorBoundary
  // wrapped it before this fix) at exactly the moment a real connect
  // attempt completes.
  it('never throws when a wallet entry has no chain set yet, and just skips it', async () => {
    mockUserWallets = [{ address: '0xpending' }, { chain: 'EVM', address: '0xevm' }];
    const { result } = await renderHook(() => useWallet());
    expect(result.current.connected).toBe(true);
    expect(result.current.address).toBe('0xevm');
  });

  it('never throws, and reports disconnected, when every wallet entry has no chain set yet', async () => {
    mockUserWallets = [{ address: '0xpending' }];
    const { result } = await renderHook(() => useWallet());
    expect(result.current.connected).toBe(false);
  });
});
