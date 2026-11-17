import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

type Row = { id: string; label: string; visible?: boolean };

/**
 * Today → Customise (ENH-6, ENH-26): first the big blocks under the summary, in this person's order (drag one by its ≡
 * handle, with a finger or a mouse, or use ▲▼), then the smaller parts that can only be shown or hidden. 👁️ shows a
 * part, 🚫 hides it; a block without an eye (the chore lists) can't be hidden. Saved for them on every device.
 */
export function HomeLayoutEditor({ blocks, parts, onPlace, onStep, onToggle, onReset, onClose, error, t }: {
  blocks: Row[];
  parts: Row[];
  onPlace: (id: string, target: string, where: 'before' | 'after') => void;
  onStep: (id: string, dir: -1 | 1) => void;
  onToggle: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
  error?: boolean;
  t: (key: string) => string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; startY: number; dy: number; target: string | null; where: 'before' | 'after' } | null>(null);

  const rows = () => [...(listRef.current?.querySelectorAll<HTMLElement>('[data-card-row]') ?? [])];
  const start = (id: string, e: ReactPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, startY: e.clientY, dy: 0, target: null, where: 'before' });
  };
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    let target: string | null = null;
    let where: 'before' | 'after' = 'before';
    for (const row of rows()) {
      const id = row.dataset.cardRow!;
      if (id === drag.id) continue;
      const r = row.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { target = id; where = 'before'; break; }
      target = id; where = 'after';
    }
    setDrag({ ...drag, dy: e.clientY - drag.startY, target, where });
  };
  const end = () => {
    if (drag?.target && Math.abs(drag.dy) > 6) onPlace(drag.id, drag.target, drag.where);
    setDrag(null);
  };

  const iconBtn = { minWidth: 38, height: 38, padding: 0, fontSize: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } as const;
  const rowStyle = (visible: boolean | undefined) => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 12,
    border: 'var(--shape-border-w) solid var(--warm-border)', backgroundColor: 'var(--warm-bg-subtle)', opacity: visible === false ? 0.6 : 1,
  });
  const label = (row: Row) => (
    <span style={{ flex: '1 1 0', width: 0, fontSize: 14, fontWeight: 700, color: 'var(--warm-text)', overflowWrap: 'anywhere', textDecoration: row.visible === false ? 'line-through' : 'none' }}>{row.label}</span>
  );
  const eye = (row: Row) => row.visible !== undefined && (
    <button type="button" className="tq-btn tq-btn-sm" style={iconBtn} onClick={() => onToggle(row.id)} aria-pressed={row.visible}
      aria-label={`${row.visible ? t('layout.hide') : t('layout.show')}: ${row.label}`} title={row.visible ? t('layout.hide') : t('layout.show')}>
      {row.visible ? '👁️' : '🚫'}
    </button>
  );
  const head = (text: string) => <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 }}>{text}</div>;

  return createPortal(
    <div className="tq-modal-overlay task-edit-overlay" onClick={onClose}>
      <div className="tq-card tq-modal task-edit-sheet tq-card-padded" role="dialog" aria-modal="true" aria-label={t('dashboard.customise')}
        onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '85vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)' }}>{t('dashboard.customise')}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-muted)', marginTop: 2 }}>{t('layout.hintOrder')}</div>
          </div>
          <button type="button" className="tq-btn tq-btn-sm" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', display: 'grid', gap: 6, paddingBottom: 4 }}>
          {head(t('layout.orderHead'))}
          <div ref={listRef} style={{ display: 'grid', gap: 6 }}>
            {blocks.map((row, i) => {
              const dragging = drag?.id === row.id;
              const line = drag && drag.target === row.id && !dragging ? drag.where : null;
              return (
                <div key={row.id} data-card-row={row.id} className="layout-row" style={{
                  ...rowStyle(row.visible),
                  border: `var(--shape-border-w) solid ${dragging ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
                  backgroundColor: dragging ? 'var(--warm-accent-light)' : 'var(--warm-bg-subtle)',
                  transform: dragging ? `translateY(${drag!.dy}px)` : undefined, position: 'relative', zIndex: dragging ? 2 : undefined,
                  boxShadow: line === 'before' ? '0 -3px 0 var(--warm-accent)' : line === 'after' ? '0 3px 0 var(--warm-accent)' : undefined,
                }}>
                  <button type="button" className="tq-btn tq-btn-sm layout-handle" aria-label={`${t('layout.drag')}: ${row.label}`}
                    onPointerDown={(e) => start(row.id, e)} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}
                    style={{ ...iconBtn, cursor: 'grab', touchAction: 'none' }}>≡</button>
                  {label(row)}
                  <button type="button" className="tq-btn tq-btn-sm" style={iconBtn} disabled={i === 0} onClick={() => onStep(row.id, -1)}
                    aria-label={`${t('layout.up')}: ${row.label}`}>▲</button>
                  <button type="button" className="tq-btn tq-btn-sm" style={iconBtn} disabled={i === blocks.length - 1} onClick={() => onStep(row.id, 1)}
                    aria-label={`${t('layout.down')}: ${row.label}`}>▼</button>
                  {eye(row) || <span style={{ width: 38, flexShrink: 0 }} aria-hidden="true" />}
                </div>
              );
            })}
          </div>
          {parts.length > 0 && head(t('layout.partsHead'))}
          {parts.map((row) => (
            <div key={row.id} className="layout-row" style={{ ...rowStyle(row.visible), paddingLeft: 12 }}>
              {label(row)}
              {eye(row)}
            </div>
          ))}
        </div>
        {error && <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: 'var(--health-red, #dc2626)' }}>{t('layout.saveFailed')}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="tq-btn tq-btn-secondary" onClick={onReset}>{t('layout.resetAll')}</button>
          <button type="button" className="tq-btn tq-btn-primary" onClick={onClose}>{t('layout.done')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
