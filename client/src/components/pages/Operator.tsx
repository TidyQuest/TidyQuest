import { useEffect, useState } from 'react';
import { useHosted } from '../../utils/hosted';
import { AuthCard, AuthField } from '../shared/AuthCard';
import { authError, authLink } from '../shared/authStyles';

// The operator page (/operator, hosted mode only, NEW-13): the families on this server, with suspend,
// resume, delete, restore (NEW-23) and resend, the History of what was done (NEW-24), and the switch that opens or closes new
// sign-ups with the waitlist families join while it's closed (NEW-30). It has its own sign-in and token,
// kept apart from a family login in the same browser. English only: families never see it.

const TOKEN_KEY = 'tidyquest_operator_token';
const PAGE = 50;
const CARD_PAGE = 10; // a family's history on its card
const MIN_PASSWORD = 12;
const DAY = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

type Status = 'trial' | 'active' | 'suspended' | 'expired' | 'deleted';
interface Family {
  id: string; name: string; code: string | null; status: Status; plan: string | null; trialEndsAt: string | null;
  createdAt: string; lastActiveAt: string | null; deletedAt: string | null;
  people: number | null; filesBytes: number | null; dataBytes: number | null;
  parents: { email: string; confirmed: boolean }[];
  canRestore?: boolean; // deleted families: their folder is still kept
}
interface FamilyList {
  totals: Record<Status | 'newThisWeek', number>;
  found: number;
  filesLimitBytes: number;
  keepDeletedDays: number;
  families: Family[];
}
type Action = 'suspend' | 'resume' | 'delete' | 'restore' | 'resend-confirmation' | 'trial-delete' | 'unconfirmed-delete' | 'inactive-delete'
  | 'parent-delete' | 'news'
  | 'sign-in' | 'wrong-password' | 'password' | 'sign-out' | 'env-account' | 'env-password'
  | 'signups-open' | 'signups-closed' | 'waitlist-remove';
interface Entry {
  id: number; at: string; operatorEmail: string | null; action: Action;
  familyId: string | null; familyName: string | null; detail: string | null; ip: string | null;
}
interface EntryList { found: number; entries: Entry[] }
/** What a restore brought back (NEW-23), and what new sign-ups took meanwhile */
interface Restored {
  status: Status; code: string; codeTaken: string | null; emails: string[]; emailsTaken: string[]; nothingSaved: boolean;
  again: string | null;
}
type Kind = 'families' | 'sign-ins' | 'sign-ups';
interface SignUps { open: boolean; waiting: number }
interface Waiting {
  id: number; at: string; familyName: string; parentName: string; email: string; language: string; note: string | null;
  hasFamily: boolean;
}
interface WaitingList { found: number; entries: Waiting[] }

function savedToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function saveToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private window: signed in until the tab closes */ }
}

class SignedOut extends Error {}

async function call<T>(path: string, token: string | null, body?: object): Promise<T> {
  const res = await fetch(`/api/operator${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: 'Request failed' }));
  if (res.status === 401 && token) throw new SignedOut();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

const LABELS: Record<Status, string> = { trial: 'Trial', active: 'Active', suspended: 'Paused', expired: 'Expired', deleted: 'Deleted' };
const PILLS: Record<Status, React.CSSProperties> = {
  trial: { background: 'var(--warm-accent-light)', color: 'var(--warm-accent)' },
  active: { background: 'var(--warm-streak-bg)', color: 'var(--warm-streak-text)' },
  suspended: { background: 'var(--warm-danger-bg)', color: 'var(--warm-danger)' },
  expired: { background: 'var(--warm-badge-bg)', color: 'var(--warm-badge-text)' },
  deleted: { background: 'var(--warm-bg-subtle)', color: 'var(--warm-text-light)' },
};

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function ago(iso: string, now: number): string {
  const days = Math.floor((now - Date.parse(iso)) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
const size = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB` : `${Math.ceil(bytes / 1024)} KB`);
const message = (err: unknown) => (err instanceof Error ? err.message : 'Request failed');
const when = (iso: string) => {
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year, hour: 'numeric', minute: '2-digit' });
};
const address = (ip: string) => ip.replace(/^::ffff:/, ''); // an IPv4 address can come as ::ffff:1.2.3.4

/** What a History entry says happened. On a family's own card it leaves out which family. */
function happened(e: Entry, onCard: boolean): string {
  // Once a deleted family is gone for good, its name and emails are too (NEW-34)
  const name = e.familyName ?? 'a removed family';
  const family = onCard ? '' : ` ${name}`;
  switch (e.action) {
    case 'suspend': return `Paused${family}`;
    case 'resume': return `Resumed${family}`;
    case 'delete': return `Deleted${family}`;
    case 'restore': return `Restored${family}${e.detail ? ` (${e.detail})` : ''}`;
    case 'trial-delete': return `Deleted${family} after the trial ended`;
    case 'unconfirmed-delete': return `Deleted${family}: no parent confirmed their email in 30 days`;
    case 'inactive-delete': return `Deleted${family}: unused for a year`;
    case 'parent-delete': return `${e.detail ?? 'A parent'} deleted${onCard ? ' the family' : family}`;
    case 'news': return `Sent the news email ${e.detail}`;
    case 'resend-confirmation': return `Resent the confirmation email to ${e.detail ?? 'a parent'}${onCard ? '' : ` (${name})`}`;
    case 'sign-in': return 'Signed in';
    case 'wrong-password': return 'Sign-in refused: wrong password';
    case 'password': return 'Changed the password';
    case 'sign-out': return 'Signed out everywhere';
    case 'env-account': return 'Account made from OPERATOR_EMAIL in the compose file';
    case 'env-password': return 'Password set from OPERATOR_PASSWORD in the compose file';
    case 'signups-open': return 'Opened new sign-ups';
    case 'signups-closed': return 'Closed new sign-ups';
    case 'waitlist-remove': return `Took ${e.detail} off the waitlist`;
    default: return e.action;
  }
}

const muted: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)' };
const line: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--warm-text-secondary)', marginTop: 6 };
const okLine: React.CSSProperties = { ...line, color: 'var(--warm-streak-text)' };
const failedLine: React.CSSProperties = { ...line, color: 'var(--warm-danger)' };

/** The last action's message, also shown on its family's card (the top of the page can be off-screen). */
interface CardResult { id: string; name: string; index: number; text: string; failed: boolean }
/** done: the message, or one made from the server's answer */
type Act = (path: string, body: object, done: string | ((answer: unknown) => string)) => Promise<boolean>;

/** What came back with a restored family, and what the operator should tell its parents. */
function restoredText(name: string, r: Restored): string {
  const parts = [`Restored ${name} as ${LABELS[r.status]}, with the family code ${r.code}.`];
  if (r.nothingSaved) {
    parts.push("It was deleted before restores kept parents' emails, so its code is new and nobody signs in by email: parents sign in with the code and their username, then add their email in Settings.");
  } else {
    if (r.codeTaken) parts.push(`Its old code ${r.codeTaken} went to another family meanwhile, so tell the family the new one.`);
    if (r.emailsTaken.length) {
      parts.push(`Another family signs in with ${r.emailsTaken.join(', ')} now, so ${r.emailsTaken.length === 1 ? "that email wasn't" : "those emails weren't"} restored: that parent signs in with the family code and their username, then adds a new email in Settings.`);
    }
  }
  if (r.again) parts.push(r.again);
  return parts.join(' ');
}

export default function OperatorPage() {
  const hosted = useHosted();
  const [token, setToken] = useState(savedToken);

  useEffect(() => { document.title = 'TidyQuest operator'; }, []);

  const signIn = (next: string) => { saveToken(next); setToken(next); };
  const signOut = () => { saveToken(null); setToken(null); };

  if (hosted === null) return null;
  if (!hosted) {
    return (
      <AuthCard title="Operator page">
        <p style={{ ...line, textAlign: 'center' }}>This server isn't in hosted mode, so it has no operator page.</p>
        <div style={{ textAlign: 'center', marginTop: 12 }}><a href="/" style={authLink}>Open TidyQuest</a></div>
      </AuthCard>
    );
  }
  if (!token) return <OperatorLogin onSignedIn={signIn} />;
  return <Families token={token} onToken={signIn} onSignedOut={signOut} />;
}

function OperatorLogin({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      onSignedIn((await call<{ token: string }>('/login', null, { email, password })).token);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Operator sign-in" subtitle="For the people running this server">
      <form onSubmit={submit}>
        <AuthField label="Email">
          <input className="tq-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </AuthField>
        <AuthField label="Password">
          <input className="tq-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </AuthField>
        {error && <div role="alert" style={authError}>{error}</div>}
        <button type="submit" className="tq-btn tq-btn-primary tq-btn-lg" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
          Sign in
        </button>
      </form>
    </AuthCard>
  );
}

function Families({ token, onToken, onSignedOut }: { token: string; onToken: (token: string) => void; onSignedOut: () => void }) {
  const [me, setMe] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [list, setList] = useState<(FamilyList & { now: number }) | null>(null);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<CardResult | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [writingNews, setWritingNews] = useState(false);
  const [view, setView] = useState<'families' | 'history' | 'waitlist'>('families');
  const [signups, setSignups] = useState<SignUps | null>(null);

  const failed = (err: unknown) => {
    if (err instanceof SignedOut) onSignedOut();
    else setError(message(err));
  };

  useEffect(() => {
    call<{ email: string }>('/me', token).then((r) => setMe(r.email), failed);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // The sign-up switch and how many wait, again after each change here or on the waitlist
  const [signupsVersion, setSignupsVersion] = useState(0);
  useEffect(() => {
    let current = true;
    call<SignUps>('/signups', token).then((r) => { if (current) setSignups(r); }, failed);
    return () => { current = false; };
  }, [token, signupsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const setOpen = (open: boolean) => {
    setError('');
    call<{ open: boolean }>('/signups', token, { open }).then(() => setSignupsVersion((n) => n + 1), failed);
  };

  // Search as you type, once typing stops for a moment
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const families = (offset: number, limit: number) => {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (search) params.set('q', search);
    if (status) params.set('status', status);
    return call<FamilyList>(`/families?${params}`, token).then((r) => ({ ...r, now: Date.now() }));
  };

  // A new search or filter starts at the top; after an action, everything shown so far comes again
  const [shown, setShown] = useState(PAGE);
  useEffect(() => {
    let current = true;
    families(0, shown).then((r) => { if (current) setList(r); }, failed);
    return () => { current = false; };
  }, [token, search, status, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new search or filter also clears the last action's message
  const restart = () => { setShown(PAGE); setNotice(''); setError(''); setResult(null); };
  const pick = (next: Status | null) => { setStatus(next); restart(); };
  const showMore = () => {
    if (!list) return;
    families(list.families.length, PAGE).then((more) => {
      setList({ ...more, families: [...list.families, ...more.families] });
      setShown(list.families.length + more.families.length);
    }, failed);
  };

  const act = async (f: Family, index: number, path: string, body: object, done: Parameters<Act>[2]) => {
    setError('');
    setNotice('');
    setResult(null);
    const card = { id: f.id, name: f.name, index };
    try {
      const answer = await call<unknown>(path, token, body);
      const text = typeof done === 'string' ? done : done(answer);
      setNotice(text);
      setResult({ ...card, text, failed: false });
      setReload((n) => n + 1);
      return true;
    } catch (err) {
      failed(err);
      if (!(err instanceof SignedOut)) setResult({ ...card, text: message(err), failed: true });
      return false;
    }
  };

  // A family that left this list (deleted, or no longer matching the filter) keeps a note in its place
  const departed = list && result && !result.failed && !list.families.some((f) => f.id === result.id) ? result : null;
  const cards = list ? list.families.map((f, i) => (
    <FamilyCard key={f.id} family={f} list={list} result={result?.id === f.id ? result : null}
      onAct={(path, body, done) => act(f, i, path, body, done)} token={token} version={reload} onFailed={failed} />
  )) : [];
  if (departed) {
    cards.splice(Math.min(departed.index, cards.length), 0, (
      <div key={`departed-${departed.id}`} style={{ padding: '10px 14px', borderRadius: 14, border: '1.5px dashed var(--warm-border)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-text-muted)', overflowWrap: 'anywhere' }}>{departed.name}</div>
        <div style={okLine}>{departed.text}</div>
      </div>
    ));
  }

  const show = (next: typeof view) => {
    setView(next);
    setNotice('');
    setError('');
  };

  const signOutEverywhere = () => {
    call('/logout', token, {}).catch(() => {}).finally(onSignedOut);
  };

  const live = list ? list.totals.trial + list.totals.active + list.totals.suspended + list.totals.expired : 0;
  const chips: { status: Status | null; label: string; count: number }[] = list ? [
    { status: null, label: 'All', count: live },
    ...(['trial', 'active', 'suspended', 'expired', 'deleted'] as Status[]).map((s) => ({ status: s, label: LABELS[s], count: list.totals[s] })),
  ] : [];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--warm-bg)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--warm-text)', margin: 0 }}>TidyQuest operator</h1>
            <div style={{ ...muted, overflowWrap: 'anywhere' }}>{me}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => show(view === 'families' ? 'history' : 'families')}>
              {view === 'families' ? 'History' : 'Families'}
            </button>
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setWritingNews((v) => !v)}>News</button>
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setChangingPassword((v) => !v)}>Password</button>
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={signOutEverywhere} title="Signs out every device">Sign out</button>
          </div>
        </div>

        {writingNews && <NewsCard token={token} onFailed={failed} onSent={(sent) => { setWritingNews(false); setNotice(`The news email went to ${sent} parent${sent === 1 ? '' : 's'}.`); }} />}

        {changingPassword && (
          <ChangePassword token={token} onFailed={failed} onChanged={(next) => {
            onToken(next);
            setChangingPassword(false);
            setNotice('Password changed. Other devices are signed out.');
          }} />
        )}

        {view === 'history' ? (
          <>
            {error && <div role="alert" style={{ ...failedLine, marginTop: 12 }}>{error}</div>}
            <History token={token} onFailed={failed} />
          </>
        ) : view === 'waitlist' ? (
          <>
            {error && <div role="alert" style={{ ...failedLine, marginTop: 12 }}>{error}</div>}
            <Waitlist token={token} onChanged={() => setSignupsVersion((n) => n + 1)} onFailed={failed} />
          </>
        ) : (
          <>
            {signups && <SignUpsCard signups={signups} onOpen={setOpen} onWaitlist={() => show('waitlist')} />}
            {list && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16, alignItems: 'center' }}>
                {chips.map((c) => (
                  <button key={c.label} type="button" className={`tq-btn tq-btn-sm ${status === c.status ? 'tq-btn-primary' : 'tq-btn-secondary'}`} onClick={() => pick(c.status)}>
                    {c.label} {c.count}
                  </button>
                ))}
                <span style={{ ...muted, marginLeft: 4 }}>New this week: {list.totals.newThisWeek}</span>
              </div>
            )}

            <input className="tq-input" type="search" value={query} onChange={(e) => { setQuery(e.target.value); restart(); }}
              placeholder="Search: family name, family code or email" aria-label="Search families" style={{ marginTop: 12 }} />

            {notice && <div role="status" style={{ ...okLine, marginTop: 12 }}>{notice}</div>}
            {error && <div role="alert" style={{ ...failedLine, marginTop: 12 }}>{error}</div>}

            {list && (
              <>
                <div style={{ ...muted, margin: '14px 0 8px' }}>
                  {list.found === 0 ? 'No families found.' : `Showing ${list.families.length} of ${list.found}`}
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {cards}
                </div>
                {list.families.length < list.found && (
                  <div style={{ textAlign: 'center', marginTop: 14 }}>
                    <button type="button" className="tq-btn tq-btn-secondary tq-btn-md" onClick={showMore}>Show more</button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FamilyCard({ family: f, list, result, onAct, token, version, onFailed }: {
  family: Family;
  list: FamilyList & { now: number };
  result: CardResult | null;
  onAct: Act;
  token: string;
  version: number;
  onFailed: (err: unknown) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [typed, setTyped] = useState('');
  const base = `/families/${f.id}`;
  const nameMatches = typed.trim().toLowerCase() === f.name.trim().toLowerCase();

  const suspend = () => {
    if (window.confirm(`Pause ${f.name}? They'll see the paused page (and can still download their data) until you resume it.`)) {
      void onAct(`${base}/suspend`, {}, `Paused ${f.name}.`);
    }
  };
  const remove = async () => {
    if (await onAct(`${base}/delete`, { name: typed }, `Deleted ${f.name}. Its folder is kept for ${list.keepDeletedDays} days.`)) setDeleting(false);
  };
  const restore = () => {
    if (window.confirm(`Restore ${f.name}? Everyone in it can sign in again, with the same family code and emails unless a new sign-up took them meanwhile.`)) {
      void onAct(`${base}/restore`, {}, (answer) => restoredText(f.name, answer as Restored));
    }
  };

  const status = f.status === 'trial' && f.trialEndsAt ? `Trial · ends ${day(f.trialEndsAt)}` : LABELS[f.status];
  return (
    <div className="tq-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{f.name}</div>
        <span style={{ ...PILLS[f.status], fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>{status}</span>
      </div>
      <div style={{ ...muted, fontFamily: 'ui-monospace, monospace', fontSize: 12, marginTop: 2, overflowWrap: 'anywhere' }}>
        {f.code ? `${f.code} · ` : ''}{f.id}
      </div>
      <div style={line}>
        Created {day(f.createdAt)}
        {f.deletedAt
          ? ` · deleted ${day(f.deletedAt)}, removed for good on ${day(new Date(Date.parse(f.deletedAt) + list.keepDeletedDays * DAY).toISOString())}`
          : f.lastActiveAt && ` · last active ${ago(f.lastActiveAt, list.now)}`}
      </div>
      {f.status !== 'deleted' && (
        <div style={line}>
          {f.people ?? '?'} {f.people === 1 ? 'person' : 'people'} · photos {size(f.filesBytes ?? 0)} of {size(list.filesLimitBytes)} · data {size(f.dataBytes ?? 0)}
        </div>
      )}
      <div style={line}>Plan: {f.plan ?? 'none'}</div>
      {f.parents.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {f.status === 'deleted' && <div style={{ ...muted, marginTop: 2 }}>Parents' emails when it was deleted</div>}
          {f.parents.map((p) => (
            <div key={p.email} style={{ ...line, marginTop: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
              <span style={{ overflowWrap: 'anywhere' }}>{p.email}</span>
              {p.confirmed
                ? <span style={{ ...muted, color: 'var(--warm-streak-text)' }}>✓ confirmed</span>
                : f.status === 'deleted' ? <span style={muted}>not confirmed</span> : (
                  <>
                    <span style={muted}>not confirmed</span>
                    <button type="button" style={{ ...authLink, fontSize: 12, padding: 0 }}
                      onClick={() => void onAct(`${base}/resend-confirmation`, { email: p.email }, `Sent the confirmation email to ${p.email}.`)}>
                      Resend
                    </button>
                  </>
                )}
            </div>
          ))}
        </div>
      )}

      {!deleting && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {f.status !== 'deleted' && (
            <>
              {f.status === 'suspended'
                ? <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => void onAct(`${base}/resume`, {}, `Resumed ${f.name}.`)}>Resume</button>
                : <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={suspend}>Suspend</button>}
              <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" style={{ color: 'var(--warm-danger)' }} onClick={() => setDeleting(true)}>Delete</button>
            </>
          )}
          {f.status === 'deleted' && f.canRestore && (
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={restore}>Restore</button>
          )}
          <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Hide history' : 'History'}
          </button>
        </div>
      )}
      {deleting && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'var(--warm-danger-bg)', border: '1.5px solid var(--warm-danger-border)' }}>
          <div style={{ ...line, marginTop: 0, color: 'var(--warm-danger)' }}>
            Type <b>{f.name}</b> to delete this family. Everyone in it is signed out, and its folder is removed for good after {list.keepDeletedDays} days.
          </div>
          <label style={{ display: 'block', marginTop: 8 }}>
            <span style={{ ...muted, display: 'block', marginBottom: 4 }}>Family name, to confirm</span>
            <input className="tq-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={f.name}
              autoComplete="off" spellCheck={false} />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" disabled={!nameMatches} onClick={() => void remove()}
              style={{ background: 'var(--warm-danger)', borderColor: 'var(--warm-danger)', opacity: nameMatches ? 1 : 0.5 }}>
              Delete for good
            </button>
            <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => { setDeleting(false); setTyped(''); }}>Cancel</button>
          </div>
        </div>
      )}
      {f.status === 'deleted' && !f.canRestore && <div style={line}>Its folder is gone, so it can't be restored.</div>}
      {result && <div style={result.failed ? failedLine : okLine}>{result.text}</div>}
      {showHistory && <History token={token} familyId={f.id} version={version} onFailed={onFailed} />}
    </div>
  );
}

/** New sign-ups, Open or Closed (NEW-30), and the way to the waitlist families join while it's closed. */
function SignUpsCard({ signups, onOpen, onWaitlist }: { signups: SignUps; onOpen: (open: boolean) => void; onWaitlist: () => void }) {
  const choice = (open: boolean) => (
    <button type="button" className={`tq-btn tq-btn-sm ${signups.open === open ? 'tq-btn-primary' : 'tq-btn-secondary'}`}
      aria-pressed={signups.open === open} onClick={() => { if (signups.open !== open) onOpen(open); }}>
      {open ? 'Open' : 'Closed'}
    </button>
  );
  return (
    <div className="tq-card" style={{ padding: 14, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px', fontSize: 15, fontWeight: 800, color: 'var(--warm-text)' }}>New sign-ups</div>
        <div role="group" aria-label="New sign-ups" style={{ display: 'flex', gap: 6 }}>{choice(true)}{choice(false)}</div>
      </div>
      <div style={line}>
        {signups.open ? 'Anyone can create a family.' : 'The sign-up page is the waitlist form. Families already here carry on as usual.'}
      </div>
      <div style={{ ...line, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
        <span>Waitlist: {signups.waiting} waiting</span>
        <button type="button" style={{ ...authLink, fontSize: 13, padding: 0 }} onClick={onWaitlist}>Show the waitlist</button>
      </div>
    </div>
  );
}

/** The waitlist (NEW-30), first come first. Nothing is emailed: write to them from hello@, then take them off. */
function Waitlist({ token, onChanged, onFailed }: { token: string; onChanged: () => void; onFailed: (err: unknown) => void }) {
  const [list, setList] = useState<WaitingList | null>(null);
  const [version, setVersion] = useState(0);
  const [removing, setRemoving] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  const entries = (offset: number, limit: number) => call<WaitingList>(`/waitlist?offset=${offset}&limit=${limit}`, token);
  // After a removal, everything shown so far comes again
  const [shown, setShown] = useState(PAGE);
  useEffect(() => {
    let current = true;
    entries(0, shown).then((r) => { if (current) setList(r); }, onFailed);
    return () => { current = false; };
  }, [token, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const showMore = () => {
    if (!list) return;
    entries(list.entries.length, PAGE).then((more) => {
      setList({ ...more, entries: [...list.entries, ...more.entries] });
      setShown(list.entries.length + more.entries.length);
    }, onFailed);
  };
  const remove = (w: Waiting) => {
    setNotice('');
    call(`/waitlist/${w.id}/remove`, token, {}).then(() => {
      setNotice(`Took ${w.familyName} (${w.email}) off the waitlist.`);
      setRemoving(null);
      setVersion((n) => n + 1);
      onChanged();
    }, onFailed);
  };

  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--warm-text)', margin: '18px 0 0' }}>Waitlist</h2>
      <div style={line}>First come first. Nothing is emailed: write to them from hello@, then take them off.</div>
      {notice && <div role="status" style={{ ...okLine, marginTop: 12 }}>{notice}</div>}
      {list && (
        <>
          <div style={{ ...muted, margin: '14px 0 8px' }}>
            {list.found === 0 ? 'Nobody is waiting.' : `Showing ${list.entries.length} of ${list.found}`}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {list.entries.map((w, i) => (
              <div key={w.id} className="tq-card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>
                    {i + 1}. {w.familyName}
                  </div>
                  {w.hasFamily && (
                    <span style={{ ...PILLS.active, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>Has a family now</span>
                  )}
                </div>
                <div style={{ ...line, display: 'flex', flexWrap: 'wrap', columnGap: 8 }}>
                  <span style={{ overflowWrap: 'anywhere' }}>{w.parentName}</span>
                  <a href={`mailto:${w.email}`} style={{ color: 'var(--warm-accent)', fontWeight: 700, overflowWrap: 'anywhere' }}>{w.email}</a>
                </div>
                <div style={muted}>Joined {when(w.at)} · {w.language}</div>
                {w.note && <div style={{ ...line, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{w.note}”</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {removing === w.id ? (
                    <>
                      <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" onClick={() => remove(w)}
                        style={{ background: 'var(--warm-danger)', borderColor: 'var(--warm-danger)' }}>Take off the waitlist</button>
                      <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setRemoving(null)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setRemoving(w.id)}>Remove</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {list.entries.length < list.found && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button type="button" className="tq-btn tq-btn-secondary tq-btn-md" onClick={showMore}>Show more</button>
            </div>
          )}
        </>
      )}
    </>
  );
}

const KINDS: { kind: Kind | null; label: string }[] = [
  { kind: null, label: 'All' }, { kind: 'families', label: 'Family actions' }, { kind: 'sign-ins', label: 'Sign-ins' },
  { kind: 'sign-ups', label: 'Sign-ups' },
];

/** The History (NEW-24), newest first: everything, with a filter, or one family's on its card. */
function History({ token, familyId, version = 0, onFailed }: {
  token: string;
  familyId?: string;
  version?: number; // changes after each action, so an open card shows it
  onFailed: (err: unknown) => void;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [list, setList] = useState<EntryList | null>(null);

  const entries = (before?: number) => {
    const params = new URLSearchParams({ limit: String(familyId ? CARD_PAGE : PAGE) });
    if (familyId) params.set('family', familyId);
    else if (kind) params.set('kind', kind);
    if (before) params.set('before', String(before));
    return call<EntryList>(`/history?${params}`, token);
  };
  useEffect(() => {
    let current = true;
    entries().then((r) => { if (current) setList(r); }, onFailed);
    return () => { current = false; };
  }, [token, familyId, kind, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const showMore = () => {
    if (!list?.entries.length) return;
    entries(list.entries[list.entries.length - 1].id).then((more) => setList({ ...more, entries: [...list.entries, ...more.entries] }), onFailed);
  };

  const more = !!list && list.entries.length < list.found;
  const rows = list?.entries.map((e, i) => (
    <div key={e.id} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--warm-border)' : undefined }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warm-text)', overflowWrap: 'anywhere' }}>{happened(e, !!familyId)}</div>
      <div style={{ ...muted, overflowWrap: 'anywhere' }}>{e.operatorEmail ?? 'The server'} · {when(e.at)}{e.ip && ` · ${address(e.ip)}`}</div>
    </div>
  ));

  if (familyId) {
    return (
      <div style={{ marginTop: 10, borderTop: 'var(--shape-border-w) solid var(--warm-border)' }}>
        {list && (list.entries.length ? rows : <div style={line}>Nothing recorded yet.</div>)}
        {more && <button type="button" style={{ ...authLink, fontSize: 12, padding: '4px 0' }} onClick={showMore}>Show more</button>}
      </div>
    );
  }
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--warm-text)', margin: '18px 0 0' }}>History</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {KINDS.map((k) => (
          <button key={k.label} type="button" className={`tq-btn tq-btn-sm ${kind === k.kind ? 'tq-btn-primary' : 'tq-btn-secondary'}`} onClick={() => setKind(k.kind)}>
            {k.label}
          </button>
        ))}
      </div>
      {list && (
        <>
          <div style={{ ...muted, margin: '14px 0 8px' }}>
            {list.found === 0 ? 'Nothing recorded yet.' : `Showing ${list.entries.length} of ${list.found}`}
          </div>
          {list.entries.length > 0 && <div className="tq-card" style={{ padding: '4px 14px' }}>{rows}</div>}
          {more && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button type="button" className="tq-btn tq-btn-secondary tq-btn-md" onClick={showMore}>Show more</button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ChangePassword({ token, onChanged, onFailed }: { token: string; onChanged: (token: string) => void; onFailed: (err: unknown) => void }) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== repeat) return setError("The new passwords don't match");
    setError('');
    try {
      onChanged((await call<{ token: string }>('/password', token, { current, password })).token);
    } catch (err) {
      if (err instanceof SignedOut) onFailed(err);
      else setError(message(err));
    }
  };

  return (
    <form className="tq-card" onSubmit={submit} style={{ padding: 14, marginTop: 14 }}>
      <AuthField label="Current password">
        <input className="tq-input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
      </AuthField>
      <AuthField label="New password" hint={`At least ${MIN_PASSWORD} characters. Other devices are signed out.`}>
        <input className="tq-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN_PASSWORD} autoComplete="new-password" />
      </AuthField>
      <AuthField label="Repeat the new password">
        <input className="tq-input" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={MIN_PASSWORD} autoComplete="new-password" />
      </AuthField>
      {error && <div role="alert" style={authError}>{error}</div>}
      <button type="submit" className="tq-btn tq-btn-primary tq-btn-md">Save password</button>
    </form>
  );
}

/**
 * A news email to every parent who asked for them (NEW-34). Each gets its own unsubscribe link and the postal
 * address under the text. "Send me a test" goes only to this operator's address.
 */
function NewsCard({ token, onSent, onFailed }: { token: string; onSent: (sent: number) => void; onFailed: (err: unknown) => void }) {
  const [info, setInfo] = useState<{ recipients: number; blocked: string | null } | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call<{ recipients: number; blocked: string | null }>('/news', token).then(setInfo).catch(onFailed);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (test: boolean) => {
    if (!test && !confirm(`Send "${subject}" to ${info?.recipients ?? 0} parents?`)) return;
    setNote('');
    setBusy(true);
    try {
      const { sent } = await call<{ sent: number }>('/news', token, { subject, body, test });
      if (test) setNote('The test is on its way to you.');
      else onSent(sent);
    } catch (err) {
      if (err instanceof SignedOut) onFailed(err);
      else setNote(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tq-card" style={{ padding: 14, marginTop: 14, display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>News email</div>
      <div style={muted}>
        {info ? `${info.recipients} parent${info.recipients === 1 ? '' : 's'} asked for news.` : 'Loading…'}
        {' '}Each email gets its own unsubscribe link and the postal address. English only.
      </div>
      {info?.blocked && <div role="alert" style={failedLine}>{info.blocked}</div>}
      <input className="tq-input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} placeholder="Subject" aria-label="Subject" />
      <textarea className="tq-input" value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="The text, plain" aria-label="Text" style={{ resize: 'vertical' }} />
      {note && <div role="status" style={muted}>{note}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" disabled={busy || !subject.trim() || !body.trim() || !!info?.blocked} onClick={() => void send(true)}>Send me a test</button>
        <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" disabled={busy || !subject.trim() || !body.trim() || !!info?.blocked || !info?.recipients} onClick={() => void send(false)}>
          Send to {info?.recipients ?? 0}
        </button>
      </div>
    </div>
  );
}
