import { useEffect } from 'react';

// On a phone the top bar's one button is "+" on pages that add things (ENH-24). The bar and the page are side by
// side in the tree, so the button sends an event and the page that adds things listens for it.
const EVENT = 'tq:header-add';

export function fireHeaderAdd() {
  window.dispatchEvent(new Event(EVENT));
}

/** Run `add` when the top bar's + is tapped; pass null when this person can't add here */
export function useHeaderAdd(add: (() => void) | null) {
  useEffect(() => {
    if (!add) return;
    window.addEventListener(EVENT, add);
    return () => window.removeEventListener(EVENT, add);
  }, [add]);
}
