import { pickApiErrorMessage, sanitizeMessage } from '../sanitizeApiError';

describe('pickApiErrorMessage', () => {
  it('prefers the backend\'s real `error` message when it looks safe', () => {
    expect(pickApiErrorMessage({ error: 'This token needs a slightly larger buy. Try about 498 GHS.' }, 'fallback')).toBe(
      'This token needs a slightly larger buy. Try about 498 GHS.',
    );
  });

  it('falls back past an `error` field that leaks a vendor/provider name', () => {
    expect(pickApiErrorMessage({ error: 'squid: no routes found', displayMessage: 'Something went wrong.' }, 'fallback')).toBe(
      'Something went wrong.',
    );
  });

  it('falls back past an `error` field shaped like a raw API failure', () => {
    expect(
      pickApiErrorMessage({ error: '/api/public/quotes failed (500)', displayMessage: 'Please try again.' }, 'fallback'),
    ).toBe('Please try again.');
  });

  it('uses the given fallback when nothing in the body is usable at all', () => {
    expect(pickApiErrorMessage({}, 'Something went wrong. Please try again.')).toBe('Something went wrong. Please try again.');
    expect(pickApiErrorMessage(null, 'Something went wrong. Please try again.')).toBe('Something went wrong. Please try again.');
  });
});

describe('sanitizeMessage', () => {
  it('returns real, plain-looking text unchanged', () => {
    expect(sanitizeMessage('Minimum sell is 3 USDC.', 'fallback')).toBe('Minimum sell is 3 USDC.');
  });

  it('replaces a raw viem/wallet error dump with the fallback', () => {
    const raw =
      'User rejected the request.\n\nDetails: MetaMask Tx Signature: User denied transaction signature.\nVersion: viem@2.47.6';
    expect(sanitizeMessage(raw, 'Could not complete this swap. Please try again.')).toBe(
      'Could not complete this swap. Please try again.',
    );
  });

  it('replaces an API-path-shaped message with the fallback', () => {
    expect(sanitizeMessage('/api/public/ramp/onramp/initiate failed (400)', 'fallback')).toBe('fallback');
  });

  it('replaces a raw JS error class name with the fallback', () => {
    expect(sanitizeMessage("TypeError: Cannot read properties of undefined (reading 'foo')", 'fallback')).toBe('fallback');
  });

  it('replaces null/undefined/empty input with the fallback', () => {
    expect(sanitizeMessage(null, 'fallback')).toBe('fallback');
    expect(sanitizeMessage(undefined, 'fallback')).toBe('fallback');
    expect(sanitizeMessage('   ', 'fallback')).toBe('fallback');
  });
});
