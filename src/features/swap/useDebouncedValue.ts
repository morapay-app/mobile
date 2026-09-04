import { useEffect, useState } from 'react';

/**
 * Holds back a value until it's stopped changing for `delayMs` — same
 * "settle before acting" idea as the debounced network lookups elsewhere in
 * this feature (`useEnsResolution`, `useValidateMomo`), but for UI that
 * should wait for typing to pause rather than firing a request. First used
 * to stop the phone destination's country-code selector from popping in and
 * re-guessing on every keystroke (see its use in SwapScreen.tsx).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
