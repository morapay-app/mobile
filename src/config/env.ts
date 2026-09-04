/**
 * Expo inlines `EXPO_PUBLIC_*` vars from `.env` into the bundle at build
 * time (native since SDK 49) — same mechanism as Next.js's `NEXT_PUBLIC_*`
 * in the real checkout app, just a different prefix.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var ${name} — check .env (see .env.example)`);
  }
  return value;
}

export const BACKEND_API_URL = required(
  'EXPO_PUBLIC_BACKEND_API_URL',
  process.env.EXPO_PUBLIC_BACKEND_API_URL,
).replace(/\/$/, '');

export const DYNAMIC_ENVIRONMENT_ID = required(
  'EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID',
  process.env.EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID,
);

/** Pusher's `key`/`cluster` are the public half of its credential pair —
 * meant to ship in client code, unlike `PUSHER_SECRET` (server-only, never
 * here). Deliberately NOT `required()`: real-time push is an enhancement
 * over the transaction tracker's own polling (see
 * TransactionStoreContext.tsx's `pollRealRampTransaction`), which works
 * fine on its own — an app built without these two set should still run,
 * just without the faster push path. */
export const PUSHER_KEY = process.env.EXPO_PUBLIC_PUSHER_KEY || undefined;
export const PUSHER_CLUSTER = process.env.EXPO_PUBLIC_PUSHER_CLUSTER || undefined;
