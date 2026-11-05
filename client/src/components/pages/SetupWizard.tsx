import { useEffect, useState } from 'react';
import { api, type SetupAge, type SetupCatalog, type SetupChoreDef, type SetupRewardDef, type SetupRoomId } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { rewardTitleText, rewardDescText } from '../../utils/presetRewards';

// The setup wizard (NEW-17): who's in the household, the rooms, a ticked starter list of chores per person, an
// allowance and rewards. One save (POST /api/setup) makes it all. It opens by itself for a new family and can run
// again from Settings, where it only adds.

type Kind = 'kid' | 'adult';
interface Person {
  ref: string;
  kind: Kind;
  displayName: string;
  ageGroup: SetupAge | null;
  logsIn: boolean;
  username: string;
  usernameEdited: boolean;
  password: string;
  kidMode: boolean;
  allowance: string;
  /** Already in the family ('me' or 'u:<id>'): only their age group is picked here */
  existingId?: number;
  existingAdmin?: boolean;
  plays: boolean;
}
type Made = Awaited<ReturnType<typeof api.saveSetup>>;

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
const ADULTS = 'adults';
const SPECIAL_ROOM_NAMES: Partial<Record<SetupRoomId, string>> = { bedroom: 'setup.roomBedroom', yard: 'setup.roomYard', pets: 'setup.roomPets' };
/** Room types with only one of a kind in most homes: the wizard uses the family's own instead of making another */
const REUSED_TYPES = ['kitchen', 'bathroom', 'living', 'laundry', 'garage', 'office'];

const usernameFrom = (name: string) => name.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toLowerCase().slice(0, 24);
/** A friendly price, as the server makes it (setup/starter.ts nicePrice) */
const nicePrice = (coins: number) => {
  const step = coins < 50 ? 5 : coins < 200 ? 10 : 25;
  return Math.max(5, Math.round(coins / step) * step);
};
const defaultCurrency = (language: string) => (language === 'en' ? 'USD' : 'EUR');

interface Props {
  user: { id: number; displayName: string; language: string };
  /** After the save: reload Home, rooms and rewards */
  onSaved: () => Promise<unknown> | void;
  /** Leave the wizard (Home) */
  onExit: () => void;
}

export function SetupWizard({ user, onSaved, onExit }: Props) {
  const { t, taskName, roomName } = useTranslation(user.language);
  const [catalog, setCatalog] = useState<SetupCatalog | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [step, setStep] = useState(0);
  const [people, setPeople] = useState<Person[]>([]);
  const [rooms, setRooms] = useState<Set<SetupRoomId> | null>(null);
  const [choreTicks, setChoreTicks] = useState<Record<string, boolean>>({});
  const [rewardTicks, setRewardTicks] = useState<Record<string, boolean>>({});
  const [moreOpen, setMoreOpen] = useState<Record<string, boolean>>({});
  const [currency, setCurrency] = useState(defaultCurrency(user.language));
  const [goalsOn, setGoalsOn] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [made, setMade] = useState<Made | null>(null);
  const [nextRef, setNextRef] = useState(1);

  useEffect(() => {
    api.getSetup().then((c) => {
      setCatalog(c);
      setRooms(new Set(c.rooms.filter((r) => r.ticked).map((r) => r.id)));
      // You, then everyone already in the family (grown-ups take part as they are; kids get an age group here)
      const blank = { ageGroup: null, logsIn: true, username: '', usernameEdited: false, password: '', kidMode: false, allowance: '' };
      setPeople(c.family.people.map((p): Person => ({
        ...blank,
        ref: p.id === user.id ? 'me' : `u:${p.id}`,
        kind: p.role === 'admin' ? 'adult' : 'kid',
        displayName: p.displayName,
        existingId: p.id,
        existingAdmin: p.role === 'admin',
        plays: p.role !== 'admin' || !!p.isParticipant,
      })).sort((a, b) => Number(b.ref === 'me') - Number(a.ref === 'me')));
    }).catch(() => setLoadFailed(true));
  }, [user.id]);

  const fmtMoney = (amount: number, cur = currency) => {
    try {
      return new Intl.NumberFormat(user.language, { style: 'currency', currency: cur, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
    } catch {
      return String(amount);
    }
  };
  const freqLabel = (days: number) => {
    if (days === 1) return t('setup.everyDay');
    if (days === 7) return t('setup.everyWeek');
    if (days === 30) return t('setup.everyMonth');
    if (days % 7 === 0) return t('setup.everyNWeeks').replace('{n}', String(days / 7));
    return t('setup.everyNDays').replace('{n}', String(days));
  };

  // Who's in: grown-ups, and kids with an age group (someone already in the family without one is left out)
  const included = people.filter((p) => p.kind === 'adult' || p.ageGroup);
  const kids = included.filter((p) => p.kind === 'kid');
  const adults = included.filter((p) => p.kind === 'adult');
  const picked = rooms ?? new Set<SetupRoomId>();
  // Run again (the family has rooms): grown-up chores and rewards start unticked, and starter rewards the family
  // still has aren't offered again
  const firstRun = !!catalog && catalog.family.rooms.length === 0;

  /** The family's own room for a starter room, if it has one */
  const existingRoom = (id: SetupRoomId) => {
    const def = catalog?.rooms.find((r) => r.id === id);
    if (!def || !REUSED_TYPES.includes(def.type)) return undefined;
    return catalog!.family.rooms.find((r) => r.roomType === def.type && !r.assignedUserId);
  };
  const ownRoomOf = (p: Person) => (p.existingId ? catalog?.family.rooms.find((r) => r.assignedUserId === p.existingId) : undefined);

  // Each chore on offer, per card (a kid, or the grown-ups together), with whether it's ticked
  const tickKey = (owner: string, c: SetupChoreDef) => `${owner}|${c.room}|${c.id}`;
  const isTicked = (owner: string, c: SetupChoreDef) => choreTicks[tickKey(owner, c)] ?? (c.ticked && (firstRun || owner !== ADULTS));
  const kidChores = (p: Person) => (catalog?.chores ?? []).filter((c) => p.ageGroup && c.ages.includes(p.ageGroup) && (c.room === 'own' || picked.has(c.room)));
  const adultChores = (catalog?.chores ?? []).filter((c) => c.room !== 'own' && picked.has(c.room) && c.adults
    && !kids.some((k) => c.ages.includes(k.ageGroup!)));

  // Who shares each shared-room chore, and what everyone earns a week if they do everything
  const sharers = (() => {
    const map = new Map<string, string[]>();
    for (const k of kids) {
      for (const c of kidChores(k)) {
        if (c.room === 'own' || !isTicked(k.ref, c)) continue;
        const key = `${c.room}|${c.id}`;
        map.set(key, [...(map.get(key) ?? []), k.ref]);
      }
    }
    for (const c of adultChores) {
      if (isTicked(ADULTS, c) && adults.length) map.set(`${c.room}|${c.id}`, adults.map((a) => a.ref));
    }
    return map;
  })();
  const coinsOf = (c: SetupChoreDef) => catalog?.coinsByEffort[c.effort] ?? 0;
  const weeklyOf = (c: SetupChoreDef, n: number) => (coinsOf(c) * 7) / c.frequencyDays / Math.max(1, n);
  const weekly = (p: Person) => {
    let sum = 0;
    if (p.kind === 'kid') for (const c of kidChores(p)) if (c.room === 'own' && isTicked(p.ref, c)) sum += weeklyOf(c, 1);
    for (const [key, refs] of sharers) {
      if (!refs.includes(p.ref)) continue;
      const [room, id] = key.split('|');
      const c = catalog!.chores.find((x) => x.room === room && x.id === id)!;
      sum += weeklyOf(c, refs.length);
    }
    return sum;
  };

  // Rewards: who each one is for (people who take part and have chores), and whether it's ticked
  const players = included.filter((p) => p.plays);
  const audience = (r: SetupRewardDef) => players.filter((p) => r.ages.includes(p.kind === 'kid' ? p.ageGroup! : 'adult') && weekly(p) > 0);
  const offered = (r: SetupRewardDef) => audience(r).length > 0 && (firstRun || !r.presetTitle || !catalog!.family.presetRewards.includes(r.presetTitle));
  const rewardTicked = (r: SetupRewardDef) => rewardTicks[r.id] ?? (firstRun && r.ticked && (kids.length === 0 || r.ages.some((a) => a !== 'adult')));
  const rewardText = (r: SetupRewardDef) => r.presetTitle
    ? { title: rewardTitleText(r.presetTitle, t), description: rewardDescText({ title: r.presetTitle }, t) }
    : { title: t(`setupRewards.${r.id}`), description: t(`setupRewards.${r.id}_desc`) };

  const update = (ref: string, patch: Partial<Person>) => { setError(''); setPeople((list) => list.map((p) => {
    if (p.ref !== ref) return p;
    const next = { ...p, ...patch };
    if (patch.displayName !== undefined && !next.usernameEdited && !next.existingId) next.username = usernameFrom(patch.displayName);
    return next;
  })); };
  const addPerson = (kind: Kind) => {
    setPeople((list) => [...list, {
      ref: `n${nextRef}`, kind, displayName: '', ageGroup: null, logsIn: true, username: '', usernameEdited: false,
      password: '', kidMode: false, allowance: '', plays: true,
    }]);
    setNextRef((n) => n + 1);
  };
  const pickAge = (p: Person, age: SetupAge | 'adult') => {
    if (age === 'adult') return update(p.ref, { kind: 'adult', ageGroup: null, logsIn: true });
    // Little ones usually don't log in; younger kids who do get kid mode's bigger buttons
    const young = age === '3-5' || age === '6-8';
    update(p.ref, p.existingId ? { kind: 'kid', ageGroup: age } : { kind: 'kid', ageGroup: age, logsIn: age !== '3-5', kidMode: young });
  };

  /** What's missing on step 1, or '' */
  const familyProblem = () => {
    const names = new Set<string>();
    for (const p of people) {
      if (p.existingId) continue;
      if (!p.displayName.trim()) return t('setup.errName');
      if (p.kind === 'kid' && !p.ageGroup) return t('setup.errAge').replace('{name}', p.displayName.trim());
      if (p.kind === 'adult' || p.logsIn) {
        const u = p.username.trim().toLowerCase();
        if (!u || /\s/.test(u)) return t('setup.errUsername').replace('{name}', p.displayName.trim());
        if (names.has(u)) return t('setup.errUsernameTwice').replace('{name}', u);
        names.add(u);
        if (p.password.length < 4) return t('setup.errPassword').replace('{name}', p.displayName.trim());
      }
    }
    return '';
  };

  const next = () => {
    const problem = step === 0 ? familyProblem() : '';
    setError(problem);
    if (!problem) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0 });
    }
  };

  const save = async () => {
    if (!catalog) return;
    setSaving(true);
    setError('');
    const roomKey = (id: SetupRoomId) => (existingRoom(id) ? `r:${existingRoom(id)!.id}` : id);
    const ownKey = (p: Person) => (ownRoomOf(p) ? `r:${ownRoomOf(p)!.id}` : `own:${p.ref}`);
    const body = {
      people: included.map((p) => ({
        ref: p.ref, kind: p.kind, displayName: p.displayName.trim(), ageGroup: p.ageGroup ?? undefined,
        logsIn: p.kind === 'adult' || p.logsIn, username: p.username.trim(), password: p.password,
        kidMode: p.kidMode, allowance: Number(p.allowance.replace(',', '.')) || 0,
      })),
      rooms: [
        ...catalog.rooms.filter((r) => picked.has(r.id)).map((r) => ({
          key: roomKey(r.id), starter: r.id, name: SPECIAL_ROOM_NAMES[r.id] ? t(SPECIAL_ROOM_NAMES[r.id]!) : roomName(r.type),
        })),
        ...kids.map((p) => ({ key: ownKey(p), starter: 'own', owner: p.ref, name: t('setup.kidRoom').replace('{name}', p.displayName.trim()) })),
      ],
      chores: [
        ...kids.flatMap((p) => kidChores(p).filter((c) => c.room === 'own' && isTicked(p.ref, c)).map((c) => ({ id: c.id, room: ownKey(p), people: [p.ref] }))),
        ...[...sharers].map(([key, refs]) => {
          const [room, id] = key.split('|') as [SetupRoomId, string];
          return { id, room: roomKey(room), people: refs };
        }),
      ],
      rewards: catalog.rewards.filter((r) => offered(r) && rewardTicked(r)).map((r) => ({ id: r.id, ...rewardText(r) })),
      cashTitles: catalog.cashAmounts.map((a) => t('setup.cashTitle').replace('{amount}', fmtMoney(a))),
      goals: goalsOn ? (kids.length ? kids : adults).filter((p) => p.plays).map((p) => ({ person: p.ref, title: t('setup.goalTitle') })) : [],
    };
    try {
      const result = await api.saveSetup(body);
      await onSaved();
      setMade(result);
      setStep(4);
      window.scrollTo({ top: 0 });
    } catch (e) {
      const code = (e as { body?: { code?: string } }).body?.code;
      setError(code === 'username_taken' ? t('setup.errUsernameTaken') : (e as Error).message || t('common.actionFailed'));
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    await api.skipSetup().catch(() => undefined);
    onExit();
  };

  if (loadFailed) return <div className="tq-card tq-card-padded setup-page">{t('common.actionFailed')}</div>;
  if (!catalog || !rooms) return <div className="tq-card tq-card-padded setup-page">{t('common.loading')}…</div>;

  const STEPS = [t('setup.stepFamily'), t('setup.stepHome'), t('setup.stepChores'), t('setup.stepRewards')];
  const ages: Array<SetupAge | 'adult'> = [...catalog.ageGroups, 'adult'];
  const ageLabel = (a: SetupAge | 'adult') => (a === 'adult' ? t('setup.grownUp') : a.replace('-', '–'));
  const coinsWeek = (n: number) => t('setup.coinsAWeek').replace('{n}', String(Math.round(n)));

  const choreRow = (owner: string, c: SetupChoreDef) => (
    <label key={tickKey(owner, c)} className="setup-row">
      <input type="checkbox" checked={isTicked(owner, c)} onChange={(e) => setChoreTicks((m) => ({ ...m, [tickKey(owner, c)]: e.target.checked }))} />
      <span className="setup-row-text">
        <span>{taskName(c.name, c.id)}</span>
        <span className="setup-row-meta">
          {freqLabel(c.frequencyDays)} · {t('setup.coinsEach').replace('{n}', String(coinsOf(c)))}
          {c.room !== 'own' && owner !== ADULTS ? ` · ${roomLabel(c.room)}` : ''}
          {c.timerMinutes ? ` · ⏱️ ${t('setup.timer').replace('{n}', String(c.timerMinutes))}` : ''}
        </span>
      </span>
    </label>
  );
  function roomLabel(id: SetupRoomId) {
    const def = catalog!.rooms.find((r) => r.id === id)!;
    return SPECIAL_ROOM_NAMES[id] ? t(SPECIAL_ROOM_NAMES[id]!) : roomName(def.type);
  }
  const choreCard = (owner: string, title: string, list: SetupChoreDef[], earns: number | null) => {
    const main = list.filter((c) => c.ticked);
    const more = list.filter((c) => !c.ticked);
    return (
      <div key={owner} className="tq-card tq-card-padded setup-card">
        <div className="setup-card-head">
          <span className="tq-card-title">{title}</span>
          {earns !== null && <span className="setup-row-meta">{coinsWeek(earns)}</span>}
        </div>
        {list.length === 0 && <p className="setup-help">{t('setup.noChores')}</p>}
        {main.map((c) => choreRow(owner, c))}
        {more.length > 0 && (
          <>
            <button type="button" className="tq-btn tq-btn-sm setup-more" onClick={() => setMoreOpen((m) => ({ ...m, [owner]: !m[owner] }))} aria-expanded={!!moreOpen[owner]}>
              {moreOpen[owner] ? t('setup.fewerIdeas') : t('setup.moreIdeas').replace('{n}', String(more.length))}
            </button>
            {moreOpen[owner] && more.map((c) => choreRow(owner, c))}
          </>
        )}
      </div>
    );
  };

  const kidsWithAllowance = kids.filter((k) => (Number(k.allowance.replace(',', '.')) || 0) > 0);

  return (
    <div className="setup-page">
      {step < 4 && (
        <div className="setup-steps" aria-label={t('setup.stepOf').replace('{n}', String(step + 1)).replace('{total}', String(STEPS.length))}>
          {STEPS.map((label, i) => (
            <span key={label} className={`setup-step${i === step ? ' current' : ''}${i < step ? ' done' : ''}`}>{i + 1}. {label}</span>
          ))}
        </div>
      )}

      {step === 0 && (
        <>
          <div className="tq-card tq-card-padded setup-card">
            <div className="tq-card-title">{t('setup.familyTitle')}</div>
            <p className="setup-help">{t('setup.familyHelp')}</p>
          </div>
          {people.map((p) => (
            <div key={p.ref} className="tq-card tq-card-padded setup-card">
              <div className="setup-card-head">
                {p.existingId
                  ? <span className="tq-card-title">{p.displayName}{p.ref === 'me' ? ` (${t('common.you')})` : ''}</span>
                  : <input className="tq-input" value={p.displayName} placeholder={p.kind === 'kid' ? t('setup.kidName') : t('setup.adultName')} aria-label={t('setup.name')}
                      onChange={(e) => update(p.ref, { displayName: e.target.value })} maxLength={40} />}
                {!p.existingId && (
                  <button type="button" className="tq-btn tq-btn-sm tq-btn-secondary" onClick={() => setPeople((list) => list.filter((x) => x.ref !== p.ref))}>
                    {t('setup.remove')}
                  </button>
                )}
              </div>
              {!p.existingAdmin && (
                <div className="setup-chips" role="group" aria-label={t('setup.age')}>
                  {ages.map((a) => {
                    const on = a === 'adult' ? p.kind === 'adult' : p.ageGroup === a;
                    return <button key={a} type="button" className={`setup-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => pickAge(p, a)}>{ageLabel(a)}</button>;
                  })}
                </div>
              )}
              {p.existingId && p.kind === 'kid' && !p.ageGroup && <p className="setup-help">{t('setup.existingKidHelp')}</p>}
              {!p.existingId && p.kind === 'kid' && p.ageGroup && (
                <label className="setup-row">
                  <input type="checkbox" checked={p.logsIn} onChange={(e) => update(p.ref, { logsIn: e.target.checked })} />
                  <span className="setup-row-text">
                    <span>{t('setup.logsIn')}</span>
                    <span className="setup-row-meta">{p.logsIn ? t('setup.logsInHelp') : t('setup.noLoginHelp')}</span>
                  </span>
                </label>
              )}
              {!p.existingId && (p.kind === 'adult' || (p.ageGroup && p.logsIn)) && (
                <div className="setup-login">
                  <label className="tq-label">{t('setup.username')}
                    <input className="tq-input" value={p.username} autoCapitalize="none" autoComplete="off" maxLength={40}
                      onChange={(e) => update(p.ref, { username: e.target.value.replace(/\s/g, ''), usernameEdited: true })} />
                  </label>
                  <label className="tq-label">{t('setup.password')}
                    <input className="tq-input" type="password" value={p.password} autoComplete="new-password"
                      onChange={(e) => update(p.ref, { password: e.target.value })} />
                  </label>
                </div>
              )}
              {!p.existingId && p.kind === 'kid' && p.ageGroup && p.logsIn && (
                <label className="setup-row">
                  <input type="checkbox" checked={p.kidMode} onChange={(e) => update(p.ref, { kidMode: e.target.checked })} />
                  <span className="setup-row-text">
                    <span>{t('setup.kidMode')}</span>
                    <span className="setup-row-meta">{t('setup.kidModeHelp')}</span>
                  </span>
                </label>
              )}
            </div>
          ))}
          <div className="setup-add">
            <button type="button" className="tq-btn tq-btn-secondary" onClick={() => addPerson('kid')}>+ {t('setup.addKid')}</button>
            <button type="button" className="tq-btn tq-btn-secondary" onClick={() => addPerson('adult')}>+ {t('setup.addAdult')}</button>
          </div>
          {!people.some((p) => p.kind === 'kid') && <p className="setup-help">{t('setup.noKidsHelp')}</p>}
        </>
      )}

      {step === 1 && (
        <div className="tq-card tq-card-padded setup-card">
          <div className="tq-card-title">{t('setup.homeTitle')}</div>
          <p className="setup-help">{t('setup.homeHelp')}</p>
          <div className="setup-chips">
            {catalog.rooms.map((r) => {
              const on = picked.has(r.id);
              const existing = existingRoom(r.id);
              return (
                <button key={r.id} type="button" className={`setup-chip${on ? ' on' : ''}`} aria-pressed={on}
                  onClick={() => setRooms((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}>
                  {roomLabel(r.id)}{existing ? ` · ${t('setup.alreadyThere')}` : ''}
                </button>
              );
            })}
          </div>
          {kids.length > 0 && (
            <p className="setup-help">{t('setup.kidRoomsHelp').replace('{rooms}', kids.map((k) => ownRoomOf(k)?.name ?? t('setup.kidRoom').replace('{name}', k.displayName.trim())).join(', '))}</p>
          )}
        </div>
      )}

      {step === 2 && (
        <>
          <div className="tq-card tq-card-padded setup-card">
            <div className="tq-card-title">{t('setup.choresTitle')}</div>
            <p className="setup-help">{t('setup.choresHelp')}</p>
          </div>
          {kids.map((k) => choreCard(k.ref, `${k.displayName.trim()} · ${ageLabel(k.ageGroup!)}`, kidChores(k), weekly(k)))}
          {adults.length > 0 && choreCard(ADULTS, adults.length > 1 ? t('setup.grownUps') : adults[0].displayName.trim(), adultChores,
            adults.some((a) => a.plays) ? weekly(adults[0]) : null)}
        </>
      )}

      {step === 3 && (
        <>
          {kids.length > 0 && (
            <div className="tq-card tq-card-padded setup-card">
              <div className="tq-card-title">{t('setup.allowanceTitle')}</div>
              <p className="setup-help">{t('setup.allowanceHelp')}</p>
              <label className="tq-label">{t('setup.currency')}
                <select className="tq-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c} ({fmtMoney(1, c)})</option>)}
                </select>
              </label>
              {kids.map((k) => (
                <label key={k.ref} className="tq-label setup-allowance">{k.displayName.trim()}
                  <input className="tq-input" inputMode="decimal" value={k.allowance} placeholder="0"
                    onChange={(e) => update(k.ref, { allowance: e.target.value.replace(/[^0-9.,]/g, '') })} />
                  {(Number(k.allowance.replace(',', '.')) || 0) > 0 && weekly(k) > 0 && (
                    <span className="setup-row-meta">{t('setup.allowanceRate').replace('{coins}', String(nicePrice(weekly(k) / Number(k.allowance.replace(',', '.'))))).replace('{money}', fmtMoney(1))}</span>
                  )}
                </label>
              ))}
            </div>
          )}
          <div className="tq-card tq-card-padded setup-card">
            <div className="tq-card-title">{t('setup.rewardsTitle')}</div>
            <p className="setup-help">{t('setup.rewardsHelp')}</p>
            {catalog.rewards.filter(offered).map((r) => {
              const who = audience(r);
              const prices = who.map((p) => nicePrice(r.weeks * weekly(p)));
              const text = rewardText(r);
              return (
                <label key={r.id} className="setup-row">
                  <input type="checkbox" checked={rewardTicked(r)} onChange={(e) => setRewardTicks((m) => ({ ...m, [r.id]: e.target.checked }))} />
                  <span className="setup-row-text">
                    <span>{text.title}</span>
                    <span className="setup-row-meta">
                      {prices.length ? `${Math.min(...prices) === Math.max(...prices) ? Math.min(...prices) : `${Math.min(...prices)}–${Math.max(...prices)}`} 🪙 · ` : ''}
                      {who.map((p) => p.displayName.trim()).join(', ')}
                    </span>
                  </span>
                </label>
              );
            })}
            {kidsWithAllowance.length > 0 && (
              <p className="setup-help">{t('setup.cashHelp').replace('{rewards}', catalog.cashAmounts.map((a) => t('setup.cashTitle').replace('{amount}', fmtMoney(a))).join(', '))}</p>
            )}
          </div>
          <div className="tq-card tq-card-padded setup-card">
            <label className="setup-row">
              <input type="checkbox" checked={goalsOn} onChange={(e) => setGoalsOn(e.target.checked)} />
              <span className="setup-row-text">
                <span className="tq-card-title">{t('setup.goalsTitle')}</span>
                <span className="setup-row-meta">{kids.length ? t('setup.goalsHelp') : t('setup.goalsHelpAdults')}</span>
              </span>
            </label>
          </div>
        </>
      )}

      {step === 4 && made && (
        <div className="tq-card tq-card-padded setup-card">
          <div className="tq-card-title">{t('setup.doneTitle')}</div>
          <p>{t('setup.doneMade').replace('{people}', String(made.people)).replace('{rooms}', String(made.rooms)).replace('{chores}', String(made.chores)).replace('{rewards}', String(made.rewards))}</p>
          <ul className="setup-tips">
            <li>{t('setup.tipInstall')}</li>
            <li>{t('setup.tipNotify')}</li>
            <li>{t('setup.tipChange')}</li>
          </ul>
          <button type="button" className="tq-btn tq-btn-primary" onClick={onExit}>{t('setup.goHome')}</button>
        </div>
      )}

      {error && <p className="setup-error" role="alert">{error}</p>}

      {step < 4 && (
        <div className="setup-nav">
          {step === 0
            ? <button type="button" className="tq-btn tq-btn-secondary" onClick={catalog.needed ? skip : onExit}>{catalog.needed ? t('setup.notNow') : t('common.cancel')}</button>
            : <button type="button" className="tq-btn tq-btn-secondary" onClick={() => { setError(''); setStep((s) => s - 1); }} disabled={saving}>{t('setup.back')}</button>}
          {step < 3
            ? <button type="button" className="tq-btn tq-btn-primary" onClick={next}>{t('setup.next')}</button>
            : <button type="button" className="tq-btn tq-btn-primary" onClick={save} disabled={saving}>{saving ? `${t('setup.saving')}…` : t('setup.finish')}</button>}
        </div>
      )}
    </div>
  );
}
