import { BACKEND_API_URL } from '../config/env';
import { pickApiErrorMessage } from './sanitizeApiError';

const DEFAULT_TIMEOUT_MS = 20000;

export class ApiError extends Error {
  status?: number;
  /** Machine-readable error code the backend sends alongside its message
   * (e.g. `customer.name.mismatch`) — present on structured error
   * responses, absent on network/timeout failures. */
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * The backend requires no auth for /api/public, /api/squid, /api/balances,
 * /api/moolre, /api/ens — it's a pure unauthenticated proxy in front of
 * Core. Some routes wrap their payload as `{ success, data }`, others
 * (squid/chains, squid/tokens) return the raw array/object directly — this
 * unwraps the envelope when present and passes the rest through untouched,
 * same defensive handling the real checkout app's mappers use.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BACKEND_API_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      signal: controller.signal,
    });
  } catch (err) {
    // Never surface the raw diagnostic text here (path, exact timeout
    // ms, underlying fetch error) — none of it means anything to a user
    // and it isn't safe to show verbatim (same reasoning as
    // pickApiErrorMessage's leak patterns below, which this bypasses
    // entirely since there's no response body to run through it). The
    // `code` still carries the real reason for callers that want to
    // branch on it.
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('This is taking longer than expected. Please try again.', undefined, 'network.timeout');
    }
    throw new ApiError('Could not reach the server. Check your connection and try again.', undefined, 'network.failed');
  } finally {
    clearTimeout(timeoutId);
  }

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    // The backend's `error` field is usually the specific, actually useful
    // message ("This token needs a slightly larger buy. Try about 498
    // GHS.") — `displayMessage`/`safeMessage` are generic boilerplate
    // ("Some of the information provided is invalid.") meant as a fallback
    // for messages that aren't safe to show verbatim. Same precedence and
    // leak-pattern check as the real app's public-api-errors.ts.
    // Deliberately not `${path} failed (${response.status})` — an API path
    // and HTTP status code are exactly the kind of internal detail this is
    // meant to keep off the screen. `pickApiErrorMessage` already prefers
    // the backend's own real message when there is one; this fallback only
    // fires when the response body has nothing usable at all.
    const body = json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
    const message = pickApiErrorMessage(body, 'Something went wrong. Please try again.');
    const code = typeof body?.code === 'string' ? body.code : undefined;
    throw new ApiError(message, response.status, code);
  }

  if (json && typeof json === 'object' && 'success' in json && 'data' in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export function apiGet<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const entries = Object.entries(query ?? {}).filter(([, v]) => v !== undefined);
  const qs = entries.length
    ? `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}`
    : '';
  return request<T>(`${path}${qs}`);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
}
