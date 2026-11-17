import { useEffect, useSyncExternalStore, type RefObject } from 'react';

/** The width where Settings and the guide put a list column beside the content */
export const WIDE = '(min-width: 900px)';

/** True while the screen matches the media query (follows resizes and rotation) */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => { const m = window.matchMedia(query); m.addEventListener('change', onChange); return () => m.removeEventListener('change', onChange); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * A sticky column that scrolls by itself ends where the screen ends. Its height is worked out from where the column
 * really is on screen (the page title, season strip or anything else above it pushes it down), so its last rows can
 * always be reached. Before, it was as tall as the whole window, and with the page title above it the bottom of the
 * list sat below the screen, out of reach (Settings stopped at Guide & help).
 */
export function useFitToScreen(ref: RefObject<HTMLElement | null>, on: boolean, gap = 16) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const top = Math.max(gap, el.getBoundingClientRect().top);
      const visible = window.visualViewport?.height ?? window.innerHeight;
      el.style.maxHeight = `${Math.max(200, visible - top - gap)}px`;
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(fit); };
    fit();
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later);
    window.visualViewport?.addEventListener('resize', later);
    // Things that load late above it (the season strip) move it down
    const watch = new ResizeObserver(later);
    watch.observe(document.body);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', later);
      window.removeEventListener('resize', later);
      window.visualViewport?.removeEventListener('resize', later);
      watch.disconnect();
      el.style.maxHeight = '';
    };
  }, [ref, on, gap]);
}
