import { matchesRampCorridor } from '../rampCorridor';

describe('matchesRampCorridor', () => {
  it('matches the real corridor asset regardless of address casing', () => {
    expect(matchesRampCorridor({ chainId: '8453', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' })).toBe(true);
    expect(matchesRampCorridor({ chainId: '8453', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' })).toBe(true);
  });

  it('rejects the right symbol/chain with a different contract (e.g. a bridged USDbC variant)', () => {
    expect(matchesRampCorridor({ chainId: '8453', address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' })).toBe(false);
  });

  it('rejects the right contract address on the wrong chain', () => {
    expect(matchesRampCorridor({ chainId: '1', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' })).toBe(false);
  });

  it('rejects an unrelated token entirely', () => {
    expect(matchesRampCorridor({ chainId: '1', address: 'native' })).toBe(false);
  });
});
