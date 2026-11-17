import { useState } from 'react';
import { Toggle } from './Toggle';
import { useTranslation } from '../../hooks/useTranslation';

interface Member { id: number; displayName: string; username?: string; canLogIn?: number | boolean }

const title = { fontSize: 12, fontWeight: 700, color: 'var(--warm-text)' } as const;
const desc = { fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 500, marginTop: 2 } as const;

/**
 * "Can log in" on a family member's card (ENH-16). Off: signed out everywhere, no notifications, and a parent ticks
 * their chores off and buys their rewards. Turning it back on asks for a password first.
 */
export function MemberLogin({ member, language, onChange }: {
  member: Member;
  language?: string;
  onChange: (data: { canLogIn: boolean; password?: string }) => Promise<void>;
}) {
  const { t } = useTranslation(language);
  const on = member.canLogIn !== 0 && member.canLogIn !== false;
  // Turning it on: the password box is open
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (data: { canLogIn: boolean; password?: string }) => {
    setBusy(true);
    setMessage('');
    try {
      await onChange(data);
      return true;
    } catch (err) {
      setMessage(err instanceof Error && err.message ? err.message : t('common.actionFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const cancel = () => { setAsking(false); setPassword(''); setMessage(''); };
  const flip = async (next: boolean) => {
    if (busy) return;
    if (!on) return next ? setAsking(true) : cancel();
    if (!confirm(t('memberLogin.offConfirm').replace('{name}', member.displayName))) return;
    if (await save({ canLogIn: false })) setMessage(t('memberLogin.offDone').replace('{name}', member.displayName));
  };
  const turnOn = async () => {
    if (password.length < 4) return setMessage(t('memberLogin.passwordShort'));
    if (await save({ canLogIn: true, password })) {
      setAsking(false);
      setPassword('');
      setMessage(t('memberLogin.onDone').replace('{name}', member.displayName).replace('{username}', member.username ?? ''));
    }
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={title}>{t('memberLogin.title')}</div>
          <div style={desc}>{t(on ? 'memberLogin.onDesc' : 'memberLogin.offDesc')}</div>
        </div>
        <Toggle checked={on || asking} onChange={(v) => void flip(v)} label={t('memberLogin.title')} />
      </div>
      {asking && !on && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="password" className="tq-input" value={password} autoComplete="new-password" autoFocus
            onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void turnOn(); }}
            placeholder={t('memberLogin.passwordFor').replace('{name}', member.displayName)} style={{ flex: '1 1 160px', minWidth: 0 }} />
          <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" disabled={busy} onClick={() => void turnOn()}>{t('memberLogin.turnOn')}</button>
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" disabled={busy} onClick={cancel}>{t('common.cancel')}</button>
        </div>
      )}
      {message && <div role="status" style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)', overflowWrap: 'anywhere' }}>{message}</div>}
    </div>
  );
}
