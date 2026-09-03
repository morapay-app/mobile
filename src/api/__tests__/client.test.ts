import { apiGet, ApiError } from '../client';

// `request()` builds its own AbortController and races it against
// `fetch` via `signal` — these tests fake `fetch` rejecting the way a real
// abort/network failure would, without needing an actual slow network or
// timer advancement.
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('apiGet error handling', () => {
  it('never leaks the raw timeout diagnostic (path, exact ms, "AbortError") to the caller', async () => {
    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    await expect(apiGet('/api/public/quotes')).rejects.toMatchObject({
      message: 'This is taking longer than expected. Please try again.',
      code: 'network.timeout',
    });
  });

  it('never leaks the raw fetch failure reason (DNS, CORS, connection refused, etc.) to the caller', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(apiGet('/api/public/quotes')).rejects.toMatchObject({
      message: 'Could not reach the server. Check your connection and try again.',
      code: 'network.failed',
    });
  });

  it('still throws a real ApiError instance either way, so callers can rely on instanceof checks', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(apiGet('/api/public/quotes')).rejects.toBeInstanceOf(ApiError);
  });
});
