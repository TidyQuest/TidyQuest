import { useEffect, useRef } from 'react';

// A tab or home-screen app left open keeps running the version it loaded. After the server is updated, the
// pieces that version loads later (another language's guide, the QR code) are gone, so the app loads itself
// again: when such a piece fails to load, and when it sees the server's version has changed (BUG-48).

const RELOADED_AT = 'tidyquest-reloaded-at';

/** Loads the app again, at most once a minute so a piece that's really missing can't loop. False = it didn't. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT)) || 0;
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** The server's version and build as one label, or null when it can't be reached (a restart in progress). */
function serverVersion(): Promise<string | null> {
  return fetch('/api/version', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((v: { version?: string | null; build?: string | null } | null) => (v ? `${v.version}|${v.build}` : null))
    .catch(() => null);
}

/** Someone's in the middle of typing: a reload would lose it. */
function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/**
 * Notices a new version on the server and loads it: straight away when the app is opened again from the
 * background (unless someone is typing), otherwise at the next change of page, so nothing on screen is lost.
 */
export function useAppUpdate(pathname: string): void {
  const running = useRef<string | null>(null);
  const waiting = useRef(false);

  useEffect(() => {
    const check = () => serverVersion().then((now) => {
      if (!now) return;
      running.current ??= now;
      if (now !== running.current) waiting.current = true;
    });
    const back = () => {
      if (document.visibilityState !== 'visible') return;
      void check().then(() => { if (waiting.current && !typing()) reloadOnce(); });
    };
    void check();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void check(); }, 5 * 60_000);
    document.addEventListener('visibilitychange', back);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', back);
    };
  }, []);

  useEffect(() => {
    if (waiting.current) reloadOnce();
  }, [pathname]);
}
