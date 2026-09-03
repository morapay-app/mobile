import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'morapay:last-traded-tokens';

export type StoredTokenPreference = { fromId: string; toId: string };

/**
 * Cross-platform persistence for the swap card's last from/to token pair.
 * AsyncStorage, not a cookie: this app runs on native iOS/Android as well
 * as web, and native has no cookie jar JS can read at all — and even on the
 * web build, a real `httpOnly` cookie couldn't be read back by this same
 * client code either (that's the entire point of `httpOnly`), so it
 * couldn't drive "restore my last pair on load" on any platform. This app
 * already depends on AsyncStorage, and it's what both platforms actually
 * have.
 */
export async function loadLastTradedTokens(): Promise<StoredTokenPreference | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTokenPreference>;
    if (typeof parsed.fromId === 'string' && typeof parsed.toId === 'string') {
      return { fromId: parsed.fromId, toId: parsed.toId };
    }
    return null;
  } catch {
    return null; // Corrupt/unavailable storage — just fall back to the real defaults.
  }
}

export async function saveLastTradedTokens(fromId: string, toId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ fromId, toId }));
  } catch {
    // Best-effort — losing the "remember my pair" convenience isn't worth surfacing an error for.
  }
}
