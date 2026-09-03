import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'morapay:recent-receive-addresses';
const MAX_PER_CHAIN = 5;

type StoredAddressMap = Record<string, string[]>;

/**
 * Recent receive addresses, scoped per chain — there's no backend endpoint
 * for this (morapay doesn't track a client's withdrawal-address history),
 * so it's local-only, same AsyncStorage pattern as `tokenPreference.ts`.
 * Only ever addresses this app itself has been told to send to (saved from
 * the receive step's own Continue button, never from an arbitrary source),
 * and only ever read back for the SAME chain it was saved under — an
 * address that's syntactically valid on one EVM chain is still a real
 * wallet somewhere, but showing a Base address as a "recent" suggestion
 * while picking a Solana destination would be actively dangerous.
 */
async function loadAll(): Promise<StoredAddressMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as StoredAddressMap) : {};
  } catch {
    return {};
  }
}

export async function loadRecentAddresses(chainId: string): Promise<string[]> {
  if (!chainId) return [];
  const all = await loadAll();
  const list = all[chainId];
  return Array.isArray(list) ? list.filter((entry): entry is string => typeof entry === 'string') : [];
}

export async function saveRecentAddress(chainId: string, address: string): Promise<void> {
  const trimmed = address.trim();
  if (!chainId || !trimmed) return;
  try {
    const all = await loadAll();
    const existing = (all[chainId] ?? []).filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase());
    all[chainId] = [trimmed, ...existing].slice(0, MAX_PER_CHAIN);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Best-effort — losing the "recent addresses" convenience isn't worth surfacing an error for.
  }
}
