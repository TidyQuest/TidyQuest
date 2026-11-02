import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * A proof photo at full size, over the page. Photos load with the app's photos cookie (NEW-29), so they open
 * here rather than in a new tab, which an installed app may not share its cookies with. A tap anywhere closes it.
 */
export function PhotoViewer({ url, alt, closeLabel, onClose }: {
  url: string;
  alt: string;
  closeLabel: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="tq-modal-overlay" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)', padding: 16, zIndex: 200, cursor: 'zoom-out' }}>
      <img src={url} alt={alt}
        style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(100vh - 32px)', objectFit: 'contain', borderRadius: 10 }} />
      <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} autoFocus
        style={{
          position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', right: 12, width: 44, height: 44,
          borderRadius: '50%', border: 'none', background: 'rgba(255, 255, 255, 0.92)', color: '#222',
          fontSize: 24, fontWeight: 800, lineHeight: 1, cursor: 'pointer',
        }}>
        ×
      </button>
    </div>,
    document.body,
  );
}
