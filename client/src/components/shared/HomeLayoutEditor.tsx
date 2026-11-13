import { createPortal } from 'react-dom';

/**
 * Today → Customise (ENH-6, ENH-26): the parts of Today this person can hide. Today's order is fixed, so this is a
 * list of switches: 👁️ shows a part, 🚫 hides it. Saved for them on every device.
 */
export function HomeLayoutEditor({ cards, onToggle, onReset, onClose, error, t }: {
  cards: Array<{ id: string; label: string; visible: boolean }>;
  onToggle: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
  error?: boolean;
  t: (key: string) => string;
}) {
  const iconBtn = { minWidth: 40, height: 40, padding: 0, fontSize: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } as const;
  return createPortal(
    <div className="tq-modal-overlay task-edit-overlay" onClick={onClose}>
      <div className="tq-card tq-modal task-edit-sheet tq-card-padded" role="dialog" aria-modal="true" aria-label={t('dashboard.customise')}
        onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '85vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--warm-text)' }}>{t('dashboard.customise')}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warm-text-muted)', marginTop: 2 }}>{t('layout.hintToday')}</div>
          </div>
          <button type="button" className="tq-btn tq-btn-sm" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', display: 'grid', gap: 6, paddingBottom: 4 }}>
          {cards.map((card) => (
            <div key={card.id} className="layout-row" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 12px', borderRadius: 12,
              border: 'var(--shape-border-w) solid var(--warm-border)', backgroundColor: 'var(--warm-bg-subtle)', opacity: card.visible ? 1 : 0.6,
            }}>
              <span style={{ flex: '1 1 0', width: 0, fontSize: 14, fontWeight: 700, color: 'var(--warm-text)', overflowWrap: 'anywhere', textDecoration: card.visible ? 'none' : 'line-through' }}>{card.label}</span>
              <button type="button" className="tq-btn tq-btn-sm" style={iconBtn} onClick={() => onToggle(card.id)} aria-pressed={card.visible}
                aria-label={`${card.visible ? t('layout.hide') : t('layout.show')}: ${card.label}`} title={card.visible ? t('layout.hide') : t('layout.show')}>
                {card.visible ? '👁️' : '🚫'}
              </button>
            </div>
          ))}
        </div>
        {error && <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: 'var(--health-red, #dc2626)' }}>{t('layout.saveFailed')}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="tq-btn tq-btn-secondary" onClick={onReset}>{t('layout.reset')}</button>
          <button type="button" className="tq-btn tq-btn-primary" onClick={onClose}>{t('layout.done')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
