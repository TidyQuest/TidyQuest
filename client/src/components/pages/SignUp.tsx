import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type HostedConfig } from '../../hooks/useApi';
import type { User } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { deviceZone } from '../../utils/clock';
import { authLanguage, hostedError } from '../../utils/hosted';
import { SourceFooter } from '../shared/SourceLink';
import { WithLinks } from '../shared/LegalLinks';
import { AuthCard, AuthField } from '../shared/AuthCard';
import { authError, authLink } from '../shared/authStyles';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; language?: string }) => string;
      remove: (id: string) => void;
    };
  }
}

/** Cloudflare Turnstile, the check that you're not a robot (only when the server has a key). */
function Turnstile({ siteKey, language, onToken }: { siteKey: string; language: string; onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(onToken);
  useEffect(() => { latest.current = onToken; });
  useEffect(() => {
    let id: string | undefined;
    const render = () => {
      if (!box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, {
        sitekey: siteKey, language,
        callback: (token) => latest.current(token),
        'expired-callback': () => latest.current(''),
      });
    };
    if (window.turnstile) render();
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => { if (id && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey, language]);
  return <div ref={box} style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, minHeight: 65 }} />;
}

const checkRow: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, fontWeight: 600, color: 'var(--warm-text-secondary)', marginBottom: 14 };

const NO_CONFIG: HostedConfig = { turnstileSiteKey: null, termsUrl: null, privacyUrl: null, signupsOpen: true };

// Sign-up (hosted mode): a new family, with this parent as its admin. Everyone else is added in Settings.
// While the operator has new sign-ups closed (NEW-30) it's the waitlist form instead, listed on the operator page.
export function SignUp({ onSignedIn }: { onSignedIn: (token: string, user: User) => void }) {
  const navigate = useNavigate();
  const [language] = useState(authLanguage);
  const { t } = useTranslation(language);
  const [config, setConfig] = useState<HostedConfig | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [parentName, setParentName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [news, setNews] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  // A CAPTCHA answer works once, so a failed try gets a fresh check
  const [captchaRound, setCaptchaRound] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(''); // the email that went on the waitlist
  const zone = deviceZone();

  useEffect(() => {
    api.hostedConfig().then(setConfig).catch(() => setConfig(NO_CONFIG));
  }, []);

  const closed = config?.signupsOpen === false;
  const needsTerms = !closed && !!(config?.termsUrl || config?.privacyUrl);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (config?.turnstileSiteKey && !captchaToken) return setError(t('hosted.captchaNeeded'));
    setBusy(true);
    try {
      const details = { familyName: familyName.trim(), parentName: parentName.trim(), email: email.trim(), language, captchaToken: captchaToken || undefined };
      if (closed) {
        await api.joinWaitlist({ ...details, note: note.trim() });
        setJoined(details.email);
        return;
      }
      const { token, user } = await api.signUp({
        ...details, password, timeZone: zone, ...(needsTerms && { acceptTerms: agreed }), news,
      });
      onSignedIn(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      // Closed while this page was open: what they typed stays, on the waitlist form
      if ((err as { body?: { code?: string } })?.body?.code === 'signups-closed') setConfig((c) => ({ ...(c ?? NO_CONFIG), signupsOpen: false }));
      setError(hostedError(err, t, (err as Error)?.message || t(closed ? 'hosted.waitlistFailed' : 'hosted.signupFailed')));
      setCaptchaToken('');
      setCaptchaRound((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const toLogin = (
    <div style={{ textAlign: 'center', marginTop: 18 }}>
      <button type="button" style={authLink} onClick={() => navigate('/login')}>{t('hosted.haveFamily')}</button>
    </div>
  );

  if (joined) {
    return (
      <AuthCard title={t('hosted.waitlistTitle')}>
        <p role="status" style={{ margin: 0, color: 'var(--warm-text)', fontWeight: 700, textAlign: 'center', overflowWrap: 'anywhere' }}>
          {t('hosted.waitlistThanks').replace('{email}', joined)}
        </p>
        {toLogin}
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t(closed ? 'hosted.waitlistTitle' : 'hosted.signupTitle')} subtitle={t(closed ? 'hosted.waitlistSubtitle' : 'hosted.signupSubtitle')}>
      <form onSubmit={submit}>
        <AuthField label={t('hosted.familyName')}>
          <input className="tq-input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} maxLength={60} required
            placeholder={t('hosted.familyNamePlaceholder')} />
        </AuthField>
        <AuthField label={t('hosted.yourName')}>
          <input className="tq-input" value={parentName} onChange={(e) => setParentName(e.target.value)} maxLength={40} required
            placeholder={t('hosted.yourNamePlaceholder')} autoComplete="given-name" />
        </AuthField>
        <AuthField label={t('hosted.email')}>
          <input className="tq-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            placeholder={t('hosted.emailPlaceholder')} autoComplete="email" />
        </AuthField>
        {closed ? (
          <AuthField label={t('hosted.waitlistNote')}>
            <textarea className="tq-input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3}
              placeholder={t('hosted.waitlistNotePlaceholder')} style={{ resize: 'vertical' }} />
          </AuthField>
        ) : (
          <>
            <AuthField label={t('auth.password')} hint={t('hosted.passwordMin8')}>
              <input className="tq-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                autoComplete="new-password" />
            </AuthField>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)', margin: '0 0 14px' }}>
              {t('hosted.timeZoneNote').replace('{zone}', zone.replace(/_/g, ' '))}
            </p>
          </>
        )}
        {/* The terms and privacy policy with the COPPA consent (NEW-34): shown once the server has the links */}
        {needsTerms && (
          <label style={checkRow}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required style={{ marginTop: 2 }} />
            <span><WithLinks text={t('hosted.agreeTerms')} links={{
              terms: { href: config!.termsUrl, label: t('hosted.terms') },
              privacy: { href: config!.privacyUrl, label: t('hosted.privacy') },
            }} /></span>
          </label>
        )}
        {/* News emails only with consent, so the box starts unticked (PRIVACY.md decision 7) */}
        {!closed && (
          <label style={checkRow}>
            <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} style={{ marginTop: 2 }} />
            <span>{t('hosted.newsOptIn')}</span>
          </label>
        )}
        {config?.turnstileSiteKey && (
          <Turnstile key={captchaRound} siteKey={config.turnstileSiteKey} language={language} onToken={setCaptchaToken} />
        )}
        {error && <div role="alert" style={authError}>{error}</div>}
        <button type="submit" className="tq-btn tq-btn-primary tq-btn-lg" disabled={busy || !config} style={{ width: '100%', justifyContent: 'center' }}>
          {closed
            ? (busy ? t('hosted.waitlistSending') : t('hosted.waitlistAction'))
            : (busy ? t('hosted.creating') : t('hosted.createFamilyAction'))}
        </button>
      </form>
      {toLogin}
      <SourceFooter language={language} />
    </AuthCard>
  );
}
