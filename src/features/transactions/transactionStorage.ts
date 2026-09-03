import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SwapTransaction, TransactionStatus } from './types';

const STORAGE_KEY = 'morapay:swap-transactions';

const VALID_STATUSES: ReadonlySet<string> = new Set<TransactionStatus>([
  'ON_CHAIN_CONFIRMING',
  'SWAP_PROCESSING',
  'MOMO_SETTLEMENT',
  'COMPLETED',
  'FAILED',
]);

function isSwapTransaction(value: unknown): value is SwapTransaction {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.amount === 'number' &&
    typeof v.cryptoType === 'string' &&
    typeof v.fiatType === 'string' &&
    typeof v.startTime === 'number' &&
    typeof v.estimatedCompletionTime === 'number' &&
    typeof v.status === 'string' &&
    VALID_STATUSES.has(v.status)
  );
}

/** Same pattern as `swap/tokenPreference.ts` — AsyncStorage, not a cookie,
 * for the same cross-platform reasons documented there. */
export async function loadTransactions(): Promise<SwapTransaction[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSwapTransaction) : [];
  } catch {
    return []; // Corrupt/unavailable storage — start clean rather than crash.
  }
}

export async function saveTransactions(transactions: SwapTransaction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch {
    // Best-effort — losing local tracking isn't worth surfacing an error for.
  }
}
