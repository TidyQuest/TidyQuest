import { useCallback, useRef, useState } from 'react';

/**
 * One request at a time for a button (BUG-35): `run(action)` does nothing while an earlier one is still on its
 * way, so a double tap can't buy, add or pay twice. `busy` is for disabling the button; the guard itself
 * doesn't wait for the next render, so two taps in the same instant are caught too. Resolves to undefined
 * for the tap it ignored.
 */
export function useBusy(): [boolean, <T>(action: () => Promise<T>) => Promise<T | undefined>] {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (running.current) return undefined;
    running.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}
