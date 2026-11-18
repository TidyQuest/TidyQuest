import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

const SHOW_MS = 10_000;

/**
 * "“Wipe counters” counted as yours · Change" after a grown-up's one-tap Done on a chore anyone can do (FIX-37).
 * It goes at the next tap elsewhere or after about 10 seconds, but never while the pointer or keyboard focus is on
 * it (screen readers and keyboards move focus there, so the time doesn't cut anyone off).
 */
export function ChangeBar({ text, language, onChange, onClose }: { text: string; language?: string; onChange: () => void; onClose: () => void }) {
  const { t } = useTranslation(language);
  const ref = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held) return;
    const timer = window.setTimeout(onClose, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [held, onClose]);

  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [onClose]);

  return (
    <div ref={ref} role="status" aria-live="polite"
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHeld(false); }}
      style={{
        position: 'fixed', left: '50%', bottom: 'calc(20px + var(--tabbar-h) + env(safe-area-inset-bottom))', transform: 'translateX(-50%)',
        zIndex: 9998, width: 'max-content', maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 8px 10px 16px', borderRadius: 14,
        backgroundColor: 'var(--warm-text)', color: 'var(--warm-card)', boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        fontFamily: 'Nunito', fontSize: 14, fontWeight: 700,
      }}>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>✅ {text}</span>
      <button type="button" onClick={onChange} style={{
        border: 'none', background: 'none', color: 'var(--warm-accent-light)', fontFamily: 'Nunito', fontWeight: 900,
        fontSize: 14, cursor: 'pointer', padding: '8px 10px', flexShrink: 0, minHeight: 40,
      }}>{t('doneFor.change')}</button>
    </div>
  );
}
