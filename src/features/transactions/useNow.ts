import { useEffect, useState } from 'react';

/** A live clock, re-rendering every `intervalMs` — the one shared ticker
 * behind every ETA/countdown in this feature, instead of each component
 * running its own `setInterval`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
