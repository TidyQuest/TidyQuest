import { useEffect, useState } from 'react';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { localeFor } from '../../utils/locale';
import { hostedError, type HostedAccount } from '../../utils/hosted';
import { WithLinks } from './LegalLinks';

// Hosted mode's parts of the signed-in app: the family code and link (Settings), the parent's sign-in
// email and news (Settings), "Delete our family" (Settings, NEW-25), the confirm-email banner, the screen a
// family sees once its 30 days are up, when it's paused or its trial has ended, or while a child waits for
// a parent's consent, and the terms screen adults agree on (NEW-34).

const muted: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)', margin: 0, lineHeight: 1.5 };

/** Downloads the family's data as a JSON file (Settings → Export Data does the same). */
async function downloadExport(t: (key: string) => string) {
  try {
    const data = await api.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `tidyquest-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert((err as Error)?.message || t('common.actionFailed'));
  }
}

/** New email + password; the email changes once the link sent to it is opened. */
function ChangeEmailForm({ language, onDone, onCancel }: { language: string; onDone: (email: string) => void; onCancel: () => void }) {
  const { t } = useTranslation(language);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.changeEmail(email.trim(), password);
      onDone(res.email);
    } catch (err) {
      setError(hostedError(err, t, (err as Error)?.message || t('common.actionFailed')));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
      <input className="tq-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
        placeholder={t('hosted.newEmail')} aria-label={t('hosted.newEmail')} autoComplete="email" />
      <input className="tq-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
        placeholder={t('hosted.yourPassword')} aria-label={t('hosted.yourPassword')} autoComplete="current-password" />
      {error && <p role="alert" style={{ ...muted, color: 'var(--warm-badge-text)', fontWeight: 700 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" className="tq-btn tq-btn-primary tq-btn-sm" disabled={busy}>{t('hosted.sendConfirmLink')}</button>
        <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </form>
  );
}

/** The parent's email: confirmed or not, send the link again, change (or add) it. */
function EmailControls({ account, language, onChanged }: { account: HostedAccount; language: string; onChanged: () => void }) {
  const { t } = useTranslation(language);
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState('');
  const resend = () => {
    setNote('');
    api.resendConfirmation()
      .then(() => setNote(t('hosted.resent')))
      .catch((err) => setNote(err?.message || t('common.actionFailed')));
  };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {note && <p role="status" style={{ ...muted, color: 'var(--warm-text)', fontWeight: 700 }}>{note}</p>}
      {changing ? (
        <ChangeEmailForm language={language} onCancel={() => setChanging(false)}
          onDone={(email) => { setChanging(false); setNote(t('hosted.changeEmailSent').replace('{email}', email)); onChanged(); }} />
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {account.email && !account.emailConfirmed && (
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={resend}>{t('hosted.resend')}</button>
          )}
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => { setNote(''); setChanging(true); }}>
            {account.email ? t('hosted.changeEmail') : t('hosted.addEmail')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Settings: the code kids sign in with, the family link and its QR code, and "New code". */
export function FamilyCodeCard({ account, language, onChanged }: { account: HostedAccount; language: string; onChanged: () => void }) {
  const { t } = useTranslation(language);
  const [qr, setQr] = useState<{ link: string; image: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const link = account.familyLink;

  useEffect(() => {
    let live = true;
    // The QR library loads only here, so self-hosted installs never download it
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(link, { margin: 1, width: 360 }))
      .then((image) => { if (live) setQr({ link, image }); })
      .catch(() => {});
    return () => { live = false; };
  }, [link]);

  const copy = () => {
    navigator.clipboard?.writeText(link)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };
  const newCode = () => {
    if (!confirm(t('hosted.newCodeConfirm'))) return;
    api.newFamilyCode().then(onChanged).catch((err) => alert(err?.message || t('common.actionFailed')));
  };

  return (
    <div className="tq-card tq-card-padded settings-admin-card" style={{ display: 'grid', gap: 10 }}>
      <h3 className="tq-card-title" style={{ margin: 0 }}>🔑 {t('hosted.familyCodeTitle')}</h3>
      <p style={muted}>{t('hosted.familyCodeDesc')}</p>
      <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--warm-text)', letterSpacing: 0.5, overflowWrap: 'anywhere' }}>{account.familyCode}</div>
      <p style={muted}>{t('hosted.familyLinkDesc')}</p>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warm-text-secondary)', overflowWrap: 'anywhere' }}>{link}</div>
      {qr?.link === link && (
        <img src={qr.image} alt={t('hosted.qrAlt')} width={180} height={180}
          style={{ borderRadius: 12, background: '#fff', padding: 6, justifySelf: 'start' }} />
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" onClick={copy}>{copied ? t('hosted.copied') : t('hosted.copyLink')}</button>
        <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={newCode}>{t('hosted.newCode')}</button>
      </div>
    </div>
  );
}

/** Settings: the email a parent signs in with. */
export function SignInEmailCard({ account, language, onChanged }: { account: HostedAccount; language: string; onChanged: () => void }) {
  const { t } = useTranslation(language);
  return (
    <div className="tq-card tq-card-padded" style={{ display: 'grid', gap: 10 }}>
      <h3 className="tq-card-title" style={{ margin: 0 }}>✉️ {t('hosted.signInEmailTitle')}</h3>
      {account.email ? (
        <>
          <p style={muted}>{t('hosted.signInEmailDesc')}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{account.email}</span>
            <span style={{
              fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
              background: account.emailConfirmed ? 'var(--warm-bg-subtle)' : 'var(--warm-streak-bg)',
              color: 'var(--warm-text-secondary)',
            }}>
              {account.emailConfirmed ? t('hosted.confirmed') : t('hosted.notConfirmed')}
            </span>
          </div>
        </>
      ) : (
        <p style={muted}>{t('hosted.noEmailYet')}</p>
      )}
      <EmailControls account={account} language={language} onChanged={onChanged} />
      {account.email && <NewsSwitch account={account} language={language} onChanged={onChanged} />}
    </div>
  );
}

/** "Send me TidyQuest news" (NEW-34): off unless the parent turns it on. */
function NewsSwitch({ account, language, onChanged }: { account: HostedAccount; language: string; onChanged: () => void }) {
  const { t } = useTranslation(language);
  // Ticks at once; goes back if saving fails
  const [on, setOn] = useState(account.news);
  const toggle = (next: boolean) => {
    setOn(next);
    api.setNews(next).then(onChanged).catch((err) => { setOn(!next); alert(err?.message || t('common.actionFailed')); });
  };
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', borderTop: '1px solid var(--warm-border)', paddingTop: 10 }}>
      <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--warm-accent)' }} />
      <span style={{ display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--warm-text)' }}>{t('hosted.newsSetting')}</span>
        <span style={muted}>{t('hosted.newsSettingDesc')}</span>
      </span>
    </label>
  );
}

/**
 * Settings → Data (NEW-25): a parent deletes the whole family. Offers the download first, then asks for the
 * family's name and their password. Everyone is signed out; this device goes back to the login.
 */
export function DeleteFamily({ account, language, onDeleted }: { account: HostedAccount; language: string; onDeleted: () => void }) {
  const { t } = useTranslation(language);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.deleteFamily(name, password);
      alert(t('hosted.deleteFamilyDone').replace('{family}', account.familyName));
      onDeleted();
    } catch (err) {
      setError(hostedError(err, t, (err as Error)?.message || t('common.actionFailed')));
      setBusy(false);
    }
  };
  const fill = (key: string) => t(key).replace('{family}', account.familyName);
  return (
    <div style={{ display: 'grid', gap: 10, padding: '14px 0', borderTop: '1px solid var(--warm-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span aria-hidden style={{ fontSize: 18, width: 20, textAlign: 'center' }}>🗑️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warm-text)' }}>{t('hosted.deleteFamilyTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('hosted.deleteFamilyDesc')}</div>
        </div>
        {!open && (
          <button type="button" className="tq-btn tq-btn-sm" onClick={() => setOpen(true)}
            style={{ background: 'var(--warm-bg-subtle)', color: 'var(--warm-danger)', border: '1.5px solid var(--warm-danger)' }}>
            {t('hosted.deleteFamilyStart')}
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
          <p style={{ ...muted, color: 'var(--warm-text)' }}>{fill('hosted.deleteFamilyIntro')}</p>
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" style={{ justifySelf: 'start' }} onClick={() => void downloadExport(t)}>
            {t('hosted.exportData')}
          </button>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={muted}>{fill('hosted.deleteFamilyName')}</span>
            <input className="tq-input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
          </label>
          <input className="tq-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            placeholder={t('hosted.yourPassword')} aria-label={t('hosted.yourPassword')} autoComplete="current-password" />
          {error && <p role="alert" style={{ ...muted, color: 'var(--warm-badge-text)', fontWeight: 700 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" className="tq-btn tq-btn-sm" disabled={busy || name.trim().toLowerCase() !== account.familyName.trim().toLowerCase()}
              style={{ background: 'var(--warm-danger)', color: '#fff', border: 'none' }}>
              {t('hosted.deleteFamilyAction')}
            </button>
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => { setOpen(false); setError(''); }}>{t('common.cancel')}</button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * Instead of the app, for a parent or member who hasn't agreed to the current terms and privacy policy
 * (NEW-34, TERMS.md decision 15): once, and again after either changes. Children never see it.
 */
export function AgreeScreen({ account, language, onAgreed, onLogout }: { account: HostedAccount; language: string; onAgreed: () => void; onLogout: () => void }) {
  const { t } = useTranslation(language);
  const [busy, setBusy] = useState(false);
  const agree = () => {
    setBusy(true);
    api.agreeToTerms().then(onAgreed).catch((err) => { alert(err?.message || t('common.actionFailed')); setBusy(false); });
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--warm-bg)', padding: '24px 0' }}>
      <div className="tq-card" style={{ padding: 28, width: 440, maxWidth: 'calc(100vw - 24px)', display: 'grid', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--warm-text)', margin: 0 }}>📜 {t('hosted.agreeTitle')}</h1>
        <p style={{ ...muted, color: 'var(--warm-text)', fontSize: 14 }}>
          <WithLinks text={t('hosted.agreeText')} links={{
            terms: { href: account.termsUrl, label: t('hosted.terms') },
            privacy: { href: account.privacyUrl, label: t('hosted.privacy') },
          }} />
        </p>
        <button type="button" className="tq-btn tq-btn-primary tq-btn-lg" disabled={busy} onClick={agree} style={{ justifyContent: 'center' }}>
          {t('hosted.agreeAction')}
        </button>
        <div style={{ borderTop: '1px solid var(--warm-border)', paddingTop: 12 }}>
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={onLogout}>{t('profile.logout')}</button>
        </div>
      </div>
    </div>
  );
}

/** Above every page, for a parent whose email isn't confirmed yet. */
export function ConfirmEmailBanner({ account, language, onChanged }: { account: HostedAccount; language: string; onChanged: () => void }) {
  const { t } = useTranslation(language);
  if (!account.email || account.emailConfirmed) return null;
  const by = account.confirmBy
    ? new Date(account.confirmBy).toLocaleDateString(localeFor(language), { month: 'long', day: 'numeric' })
    : null;
  return (
    <div role="status" className="tq-card" style={{
      padding: '12px 14px', marginBottom: 12, display: 'grid', gap: 8,
      background: 'var(--warm-streak-bg)', border: '1.5px solid var(--warm-streak-border)',
    }}>
      <p style={{ ...muted, color: 'var(--warm-text)', fontWeight: 700 }}>
        📧 {t('hosted.bannerConfirm').replace('{email}', account.email)}{by && ` ${t('hosted.bannerConfirmBy').replace('{date}', by)}`}
      </p>
      <EmailControls account={account} language={language} onChanged={onChanged} />
    </div>
  );
}

/**
 * Instead of the app, for a family that's paused, whose trial has ended, or whose 30 days to confirm an
 * email are up (confirm here). Parents can always export; everyone can log out.
 */
export function LockedScreen({ account, language, onChanged, onLogout }: { account: HostedAccount; language: string; onChanged: () => void; onLogout: () => void }) {
  const { t } = useTranslation(language);
  const exportData = () => downloadExport(t);
  // Paused or trial ended; otherwise the email still needs confirming, or (NEW-34) a member or child waits
  // for a parent to confirm theirs
  const closed = account.status === 'suspended' || account.status === 'expired';
  const waiting = !closed && !account.locked && account.awaitingParent;
  const heading = (icon: string, key: string) => (
    <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--warm-text)', margin: 0 }}>{icon} {t(key)}</h1>
  );
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--warm-bg)', padding: '24px 0' }}>
      <div className="tq-card" style={{ padding: 28, width: 440, maxWidth: 'calc(100vw - 24px)', display: 'grid', gap: 12 }}>
        {account.status === 'suspended' && (
          <>
            {heading('⏸️', 'hosted.suspendedTitle')}
            <p style={muted}>{t('hosted.suspendedText')}</p>
          </>
        )}
        {/* Billing (NEW-19) adds picking a plan here */}
        {account.status === 'expired' && (
          <>
            {heading('⏳', 'hosted.expiredTitle')}
            <p style={muted}>{t(account.isParent ? 'hosted.expiredParent' : 'hosted.expiredOther')}</p>
          </>
        )}
        {waiting && (
          <>
            {heading('⏳', 'hosted.awaitingParentTitle')}
            <p style={muted}>{t('hosted.awaitingParentText')}</p>
          </>
        )}
        {!closed && !waiting && (
          <>
            {heading('📧', 'hosted.lockedTitle')}
            {account.isParent && account.email ? (
              <>
                <p style={muted}>{t('hosted.lockedParent').replace('{email}', account.email)}</p>
                <EmailControls account={account} language={language} onChanged={onChanged} />
              </>
            ) : (
              <p style={muted}>{t('hosted.lockedOther')}</p>
            )}
          </>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--warm-border)', paddingTop: 12 }}>
          {account.isParent && <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={exportData}>{t('hosted.exportData')}</button>}
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={onLogout}>{t('profile.logout')}</button>
        </div>
      </div>
    </div>
  );
}
