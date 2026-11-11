import { useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * What a parent's Reject opens on a reward request (ENH-23): an optional one-line note for the kid, sent with
 * their notification and shown under the request in their own list. Leaving it empty rejects as before.
 */
export function RewardRejectNote({ language, name, busy, onReject, onCancel }: {
  language?: string;
  /** Who asked for the reward */
  name: string;
  busy?: boolean;
  onReject: (note: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(language);
  const [note, setNote] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onReject(note.trim()); }}
      style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, flex: '1 1 100%', minWidth: 0, marginTop: 8 }}>
      <input autoFocus className="tq-input-compact" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)}
        placeholder={t('rewards.rejectNotePlaceholder')} aria-label={t('rewards.rejectNoteLabel').replace('{name}', name)}
        style={{ flex: '1 1 100%', minWidth: 0 }} />
      <button type="submit" className="tq-btn tq-btn-sm" disabled={busy}
        style={{ backgroundColor: 'var(--warm-danger-bg)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger-border)' }}>
        {t('dashboard.reject')}
      </button>
      <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" disabled={busy} onClick={onCancel}>{t('common.cancel')}</button>
    </form>
  );
}
