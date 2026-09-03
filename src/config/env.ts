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
