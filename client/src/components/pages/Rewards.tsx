import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CoinIcon } from '../icons/UIIcons';
import { matchesQuery } from '../../utils/tasks';
import { useTranslation } from '../../hooks/useTranslation';
import { api, type RewardAvailability, type RewardPot } from '../../hooks/useApi';
import { formatCoins } from '../../utils/format';
import { useBusy } from '../../hooks/useBusy';
import { RewardRejectNote } from '../shared/RewardRejectNote';
import { localeFor } from '../../utils/locale';
import { byFeatured } from '../../utils/rewardRules';
import { rewardDescText, rewardTitleText } from '../../utils/presetRewards';
import { RewardsIcon } from '../icons/NavIcons';
import Toggle from '../shared/Toggle';

/** A title's leading emoji goes in the row's tile: "🍦 Ice Cream Treat" → { emoji: "🍦", name: "Ice Cream Treat" } */
const LEAD_EMOJI = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u20E3|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200D\p{Extended_Pictographic}\uFE0F?)*)\s*/u;
function splitEmoji(title: string): { emoji: string; name: string } {
  const m = LEAD_EMOJI.exec(title);
  return m && m[0].length < title.length ? { emoji: m[1], name: title.slice(m[0].length) } : { emoji: '', name: title };
}

/** The shop shows this many rewards before "Show {n} more"; requests show this many */
const SHOP_LIMIT = 20;
const MINE_LIMIT = 3;

interface Reward {
  category?: string | null;
  /** The parents' "Featured" order (0 = not placed) */
  sortOrder?: number;
  id: number;
  title: string;
  description?: string | null;
  costCoins: number;
  isPreset?: boolean;
  /** The reward's usual price when this person has their own price */
  regularCostCoins?: number;
  isShared?: boolean;
  availability?: RewardAvailability | null;
  pot?: RewardPot | null;
  availableUntil?: string | null;
}

interface Redemption {
  id: number;
  title: string;
  costCoins: number;
  redeemedAt: string;
  status: string;
  /** Paid for together (chip-in pot): only a parent can turn it down, so there's no Cancel */
  isShared?: number | boolean;
  /** The parent who bought it for this person (ENH-16) */
  boughtByName?: string | null;
  /** The one line a parent gave when rejecting it (ENH-23) */
  rejectNote?: string | null;
}

interface PendingRequest {
  id: number;
  title: string;
  displayName: string;
  costCoins: number;
  redeemedAt: string;
  status: string;
}

interface RewardsProps {
  language?: string;
  rewards: Reward[];
  mine: Redemption[];
  userCoins: number;
  isAdmin?: boolean;
  pendingRequests?: PendingRequest[];
  onRewardRequestAction?: (id: number, status: 'approved' | 'rejected', note?: string) => Promise<void>;
  /** costCoins: the price shown in the confirm box */
  onRedeem: (rewardId: number, costCoins: number) => Promise<void>;
  onCancel: (redemptionId: number) => Promise<void>;
  /** Chip coins into a shared reward (Family Goals) */
  onContribute?: (rewardId: number, amount: number) => Promise<void>;
  /** Parents: the others they can buy a reward for (ENH-16), with that person's coins, prices and limits */
  people?: Array<{ id: number; displayName: string }>;
  /** After buying for someone else (their coins changed) */
  onBoughtFor?: () => void;
}

/** What the shop looks like for the person a parent is buying for */
interface ShopFor { id: number; rewards: Reward[]; mine: Redemption[]; coins: number }

/** A shared reward's pot: progress, who chipped in, and a box to add more. */
function SharedPot({ pot, userCoins, language, onContribute }: { pot: RewardPot; userCoins: number; language?: string; onContribute?: (amount: number) => Promise<void> }) {
  const { t } = useTranslation(language);
  const locale = localeFor(language);
  const most = Math.min(pot.remaining, userCoins);
  // Starts at 0 so a stray tap on Chip in can't spend coins
  const [amount, setAmount] = useState('0');
  const n = Math.round(Number(amount));
  const valid = Number.isFinite(n) && n >= 1 && n <= most;
  const [error, setError] = useState('');
  const [busy, run] = useBusy();
  const pct = pot.target > 0 ? Math.min(100, Math.round((pot.saved / pot.target) * 100)) : 0;
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      <div style={{ height: 10, borderRadius: 99, backgroundColor: 'var(--warm-border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--warm-accent)' }} />
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
        {t('rewardRules.potSaved').replace('{saved}', formatCoins(pot.saved, locale)).replace('{target}', formatCoins(pot.target, locale))}
        {pot.contributors.length > 0 && ` · ${pot.contributors.map((c) => `${c.displayName} ${formatCoins(c.amount, locale)}`).join(', ')}`}
      </div>
      {pot.awaitingApproval ? (
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)' }}>🎉 {t('rewardRules.potWaiting')}</div>
      ) : onContribute && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" min={0} max={most} className="tq-input-compact" value={amount} onChange={(e) => setAmount(e.target.value)}
            onFocus={(e) => e.target.select()} aria-label={t('rewardRules.chipIn')} style={{ width: 80 }} disabled={most < 1} />
          <button className="tq-btn tq-btn-primary tq-btn-sm" disabled={!valid || busy}
            onClick={() => void run(async () => {
              setError('');
              if (!valid) return;
              try { await onContribute(n); setAmount('0'); } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
            })}>
            {t('rewardRules.chipIn')}
          </button>
          {error && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

export function Rewards({ language, rewards: ownRewards, mine: ownMine, userCoins: ownCoins, isAdmin, pendingRequests, onRewardRequestAction, onRedeem, onCancel, onContribute, people, onBoughtFor }: RewardsProps) {
  const { t } = useTranslation(language);
  const locale = localeFor(language);
  // A parent buying for someone else (ENH-16): the shop shows that person's rewards, prices, limits and coins
  const [forId, setForId] = useState<number | null>(null);
  const [shopFor, setShopFor] = useState<ShopFor | null>(null);
  const [forFailed, setForFailed] = useState(false);
  // The person picked last: an answer for someone picked earlier is dropped
  const forIdRef = useRef<number | null>(null);
  const forName = people?.find((p) => p.id === forId)?.displayName ?? '';
  const loadFor = (id: number) => api.getRewards(id)
    .then((d) => setShopFor((prev) => (forIdRef.current === id ? { id, rewards: d.rewards as Reward[], mine: d.mine as Redemption[], coins: d.coins ?? 0 } : prev)))
    .catch(() => setForFailed(true));
  const pickPerson = (id: number | null) => {
    forIdRef.current = id;
    setForId(id);
    setShopFor(null);
    setForFailed(false);
    if (id !== null) void loadFor(id);
  };
  const buyingFor = forId !== null;
  const rewards = buyingFor ? shopFor?.rewards ?? [] : ownRewards;
  const mine = buyingFor ? shopFor?.mine ?? [] : ownMine;
  const userCoins = buyingFor ? shopFor?.coins ?? 0 : ownCoins;
  const [pendingRewardId, setPendingRewardId] = useState<number | null>(null);
  const [redeemError, setRedeemError] = useState('');
  const [spendFx, setSpendFx] = useState<{ amount: number; key: number } | null>(null);
  const [refundFx, setRefundFx] = useState<{ amount: number; key: number } | null>(null);
  // The request whose Cancel just failed (e.g. a parent approved it meanwhile, or the phone is offline)
  const [cancelFailed, setCancelFailed] = useState<number | null>(null);
  const previousStatuses = useRef<Record<number, string>>({});
  const [searchParams] = useSearchParams();
  // Search opens this page with ?q=<reward title> to show that reward
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [affordableOnly, setAffordableOnly] = useState(false);
  // '' = the default: Featured when the parents have ordered rewards, else cheapest first
  const [sortChoice, setSortChoice] = useState<'' | 'featured' | 'priceLow' | 'priceHigh' | 'name'>('');
  const [category, setCategory] = useState<string | null>(null);

  const pendingReward = useMemo(() => rewards.find((r) => r.id === pendingRewardId) || null, [pendingRewardId, rewards]);

  const rewardTitleByName = (title: string): string => rewardTitleText(title, t);
  const rewardTitle = (r: Reward): string => rewardTitleText(r.title, t);
  // For search only: the rows leave out a missing description
  const rewardDesc = (r: Reward): string => rewardDescText(r, t);

  const hasFeatured = rewards.some((r) => (r.sortOrder ?? 0) > 0);
  const sort = sortChoice || (hasFeatured ? 'featured' : 'priceLow');
  const categories = [...new Set(rewards.map((r) => r.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  const hasUncategorized = categories.length > 0 && rewards.some((r) => !r.category);
  const visibleRewards = rewards
    .filter((r) => (!affordableOnly || userCoins >= r.costCoins) && matchesQuery(query, [rewardTitle(r), rewardDesc(r), r.category]))
    .filter((r) => category === null || (category === '' ? !r.category : r.category === category))
    .sort((a, b) => sort === 'featured' ? byFeatured(a, b)
      : sort === 'name' ? rewardTitle(a).localeCompare(rewardTitle(b))
      : (sort === 'priceHigh' ? b.costCoins - a.costCoins : a.costCoins - b.costCoins));
  const chip = (label: string, on: boolean, onClick: () => void, key: string) => (
    <button type="button" key={key} className={`today-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>{label}</button>
  );
  const [showAllShop, setShowAllShop] = useState(false);
  const [showAllMine, setShowAllMine] = useState(false);
  // The reward whose description is shown in full (tap the row)
  const [openId, setOpenId] = useState<number | null>(null);
  const shortDate = (iso: string) => new Date(iso).toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const waitingForParent = (pendingRequests ?? []).filter((r) => r.status === 'requested');
  // Still waiting first, then the newest
  const mineSorted = [...mine].sort((a, b) => Number(b.status === 'requested') - Number(a.status === 'requested')
    || b.redeemedAt.localeCompare(a.redeemedAt));

  const rewardRow = (r: Reward) => {
    const usedUp = !!r.availability && r.availability.remaining <= 0;
    const short = r.costCoins - userCoins;
    const canBuy = short <= 0 && !usedUp;
    const { emoji, name } = splitEmoji(rewardTitle(r));
    const desc = rewardDescText(r, t);
    const limits = [
      r.availability && (usedUp
        ? t(`rewardRules.usedUp_${r.availability.period}`).replace('{day}', r.availability.resetsAt ? new Date(r.availability.resetsAt).toLocaleDateString(locale, { weekday: 'long' }) : '')
        : t(`rewardRules.left_${r.availability.period}`).replace('{n}', String(r.availability.remaining))),
      r.availableUntil && t('rewardRules.untilDate').replace('{date}', new Date(`${r.availableUntil}T12:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })),
    ].filter(Boolean).join(' · ');
    const open = openId === r.id;
    return (
      <div key={r.id} className={`chore-row rw-row${open ? ' open' : ''}`}>
        <div className="chore-row-top">
          <button type="button" className="chore-row-main" aria-expanded={open} onClick={() => setOpenId(open ? null : r.id)}>
            <span className="chore-tile rw-tile" aria-hidden="true">{emoji || <RewardsIcon active={false} />}</span>
            <span className="chore-text">
              <span className="chore-name">{name}</span>
              {desc && <span className="chore-sub">{desc}</span>}
              {limits && <span className={`chore-sub${usedUp ? ' rw-used' : ''}`}>{limits}</span>}
              {!r.isShared && !usedUp && short > 0 && (
                <span className="chore-sub rw-need">{t('rewards.needMore').replace('{n}', formatCoins(short, locale))}</span>
              )}
            </span>
          </button>
          <span className="rw-side">
            <span className="chore-coins"><span className="chore-coins-amount"><CoinIcon />{formatCoins(r.costCoins, locale)}</span></span>
            {!r.isShared && (
              <button type="button" className="rw-buy" disabled={!canBuy} onClick={() => { setRedeemError(''); setPendingRewardId(r.id); }}>
                {usedUp ? t('rewardRules.usedUp') : t('rewards.redeem')}
              </button>
            )}
          </span>
        </div>
        {r.isShared && r.pot && (
          <div className="rw-under">
            <SharedPot pot={r.pot} userCoins={userCoins} language={language} onContribute={onContribute && !buyingFor ? (n) => onContribute(r.id, n) : undefined} />
          </div>
        )}
      </div>
    );
  };

  // One purchase at a time: a double tap on Buy spent the coins twice (BUG-35)
  const [buying, runBuy] = useBusy();
  const confirmRedeem = () => runBuy(async () => {
    if (!pendingReward) return;
    setRedeemError('');
    try {
      if (forId !== null) {
        try {
          await api.redeemReward(pendingReward.id, { costCoins: pendingReward.costCoins, forUserId: forId });
        } catch (err) {
          // A changed price: load that person's shop again so the box shows the new one
          if ((err as { body?: { error?: string } }).body?.error === 'price_changed') await loadFor(forId);
          throw err;
        }
        await loadFor(forId);
        onBoughtFor?.();
      } else await onRedeem(pendingReward.id, pendingReward.costCoins);
    } catch (err) {
      // The price changed since the page loaded: the box now shows the new one, so ask again (BUG-13)
      const body = (err as { body?: { error?: string; costCoins?: number } }).body;
      setRedeemError(body?.error === 'price_changed' ? t('rewards.priceChanged').replace('{coins}', String(body.costCoins))
        : body?.error === 'Not enough coins' ? t('rewards.notEnough') : t('common.actionFailed'));
      return;
    }
    setSpendFx({ amount: pendingReward.costCoins, key: Date.now() });
    setPendingRewardId(null);
  });

  // A parent's Approve or Reject: one at a time, and a failure says so (BUG-36: the other parent had already
  // decided it, and nothing happened). The list reloads either way.
  const [deciding, runDecide] = useBusy();
  const [decideFailed, setDecideFailed] = useState('');
  // The request whose Reject box (an optional note for the kid) is open
  const [rejecting, setRejecting] = useState<number | null>(null);
  const decide = (id: number, status: 'approved' | 'rejected', note?: string) => runDecide(async () => {
    setDecideFailed('');
    setRejecting(null);
    try { await onRewardRequestAction?.(id, status, note); } catch (err) {
      setDecideFailed(t((err as { status?: number }).status === 400 ? 'rewards.alreadyDecided' : 'common.actionFailed'));
    }
  });

  useEffect(() => {
    if (!spendFx) return;
    const id = window.setTimeout(() => setSpendFx(null), 1500);
    return () => window.clearTimeout(id);
  }, [spendFx]);

  useEffect(() => {
    const prev = previousStatuses.current;
    for (const r of mine) {
      if (prev[r.id] === 'requested' && r.status === 'rejected') {
        setRefundFx({ amount: r.costCoins, key: Date.now() + r.id });
        break;
      }
    }
    const next: Record<number, string> = {};
    mine.forEach((r) => {
      next[r.id] = r.status;
    });
    previousStatuses.current = next;
  }, [mine]);

  useEffect(() => {
    if (!refundFx) return;
    const id = window.setTimeout(() => setRefundFx(null), 1800);
    return () => window.clearTimeout(id);
  }, [refundFx]);

  const statusLabel = (status: string): string => {
    if (status === 'requested') return t('rewards.statusPending');
    if (status === 'approved') return t('rewards.statusApproved');
    if (status === 'rejected') return t('rewards.statusRejected');
    if (status === 'cancelled') return t('rewards.statusCancelled');
    return status;
  };

  const statusStyle = (status: string): CSSProperties => {
    if (status === 'approved') return { color: 'var(--status-approved-text)', backgroundColor: 'var(--status-approved-bg)', border: '1px solid var(--status-approved-border)' };
    if (status === 'rejected') return { color: 'var(--status-rejected-text)', backgroundColor: 'var(--status-rejected-bg)', border: '1px solid var(--status-rejected-border)' };
    if (status === 'cancelled') return { color: 'var(--status-cancelled-text)', backgroundColor: 'var(--status-cancelled-bg)', border: '1px solid var(--status-cancelled-border)' };
    return { color: 'var(--warm-accent)', backgroundColor: 'var(--warm-accent-light)', border: '1px solid var(--warm-accent)' };
  };

  return (
    <div className="page-enter rw-page">
      <style>{`
        @keyframes coinSpendFloat {
          0% { opacity: 0; transform: translateY(12px) scale(0.9); }
          20% { opacity: 1; transform: translateY(0px) scale(1); }
          100% { opacity: 0; transform: translateY(-26px) scale(1.04); }
        }
        @keyframes coinRefundFloat {
          0% { opacity: 0; transform: translateY(10px) scale(0.95); }
          20% { opacity: 1; transform: translateY(0px) scale(1); }
          100% { opacity: 0; transform: translateY(-24px) scale(1.04); }
        }
      `}</style>
      <div className="rw-head">
        <span className="rw-balance">
          <CoinIcon />
          {buyingFor && `${forName}: `}{formatCoins(userCoins, locale)} {t('settings.coins')}
        </span>
        {isAdmin && people && people.length > 0 && (
          <label className="rw-for">
            🛒 {t('rewards.buyingFor')}
            <select className="tq-input-compact" value={forId ?? ''} onChange={(e) => pickPerson(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('rewards.buyingForMe')}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
          </label>
        )}
      </div>
      {buyingFor && <div className="rw-hint">{t('rewards.buyingForHint').replace('{name}', forName)}</div>}
      {forFailed && <div role="alert" className="rw-alert">{t('common.actionFailed')}</div>}

      {isAdmin && (waitingForParent.length > 0 || decideFailed) && (
        <section className="today-section">
          <div className="today-sec"><h3>{t('dashboard.rewardRequestsTitle')} · {waitingForParent.length}</h3></div>
          {decideFailed && <div role="alert" className="rw-alert">{decideFailed}</div>}
          {waitingForParent.length > 0 && (
            <div className="tq-card today-list chore-list">
              {waitingForParent.map((r) => {
                const { emoji, name } = splitEmoji(rewardTitleByName(r.title));
                return (
                  <div key={r.id} className="chore-row rw-row">
                    <div className="chore-row-top">
                      <span className="chore-tile rw-tile" aria-hidden="true">{emoji || <RewardsIcon active={false} />}</span>
                      <span className="chore-text">
                        <span className="chore-name">{name}</span>
                        <span className="chore-sub">{r.displayName} · {shortDate(r.redeemedAt)}</span>
                      </span>
                      <span className="chore-coins"><span className="chore-coins-amount"><CoinIcon />{formatCoins(r.costCoins, locale)}</span></span>
                    </div>
                    <div className="rw-under">
                      {rejecting === r.id ? (
                        <RewardRejectNote language={language} name={r.displayName} busy={deciding}
                          onReject={(note) => void decide(r.id, 'rejected', note)} onCancel={() => setRejecting(null)} />
                      ) : (
                        <div className="rw-actions">
                          <button className="tq-btn tq-btn-secondary tq-btn-sm" disabled={deciding} onClick={() => setRejecting(r.id)}>{t('dashboard.reject')}</button>
                          <button className="tq-btn tq-btn-primary tq-btn-sm" disabled={deciding} onClick={() => void decide(r.id, 'approved')}>{t('dashboard.approve')}</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {mine.length > 0 && (
        <section className="today-section rw-mine">
          <div className="today-sec"><h3>{buyingFor ? t('rewards.theirRequests').replace('{name}', forName) : t('rewards.myRequests')} · {mine.length}</h3></div>
          <div className="tq-card today-list chore-list">
            {(showAllMine ? mineSorted : mineSorted.slice(0, MINE_LIMIT)).map((m) => {
              const { emoji, name } = splitEmoji(rewardTitleByName(m.title));
              return (
                <div key={m.id} className={`chore-row rw-row rewards-my-row${m.status === 'requested' ? '' : ' rw-past'}`}>
                  <div className="chore-row-top">
                    <span className="chore-tile rw-tile" aria-hidden="true">{emoji || <RewardsIcon active={false} />}</span>
                    <span className="chore-text">
                      <span className="chore-name">{name}</span>
                      <span className="chore-sub">
                        <span className="rw-status" style={statusStyle(m.status)}>{statusLabel(m.status)}</span>
                        {' '}{shortDate(m.redeemedAt)}
                        {m.boughtByName && ` · 🛒 ${t('rewards.boughtBy').replace('{name}', m.boughtByName)}`}
                        {m.status === 'requested' && m.isShared ? ` · ${t('rewards.sharedParentDecides')}` : ''}
                      </span>
                      {m.status === 'rejected' && m.rejectNote && <span className="chore-sub wrap">💬 {m.rejectNote}</span>}
                      {cancelFailed === m.id && <span role="alert" className="chore-sub rw-alert">{t('common.actionFailed')}</span>}
                    </span>
                    <span className="rw-side">
                      <span className="chore-coins"><span className="chore-coins-amount">−{formatCoins(m.costCoins, locale)}<CoinIcon /></span></span>
                      {m.status === 'requested' && !m.isShared && !buyingFor && (
                        <button className="tq-btn tq-btn-secondary tq-btn-sm rw-cancel" onClick={() => { setCancelFailed(null); onCancel(m.id).catch(() => setCancelFailed(m.id)); }}>
                          {t('rewards.cancelRequest')}
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {mineSorted.length > MINE_LIMIT && (
            <button type="button" className="today-more" onClick={() => setShowAllMine((v) => !v)}>
              {showAllMine ? t('common.showLess') : t('common.showMore').replace('{n}', `${mineSorted.length - MINE_LIMIT}`)}
            </button>
          )}
        </section>
      )}

      <section className="today-section rw-shop">
        {categories.length > 0 && (
          <div className="today-chips rw-chips" role="group" aria-label={t('rewardOrder.category')}>
            {chip(t('rewardOrder.all'), category === null, () => setCategory(null), 'all')}
            {categories.map((c) => chip(c, category === c, () => setCategory(c), `c-${c}`))}
            {hasUncategorized && chip(t('rewardOrder.other'), category === '', () => setCategory(''), 'other')}
          </div>
        )}
        <div className="rw-tools">
          <input type="search" className="tq-input" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('rewards.searchPlaceholder')} aria-label={t('rewards.searchPlaceholder')} />
          <label className="rw-afford">
            <Toggle checked={affordableOnly} onChange={setAffordableOnly} label={t('rewards.canAfford')} />
            <span aria-hidden="true">{t('rewards.canAfford')}</span>
          </label>
        </div>
        <div className="today-sec">
          <h3>{t('rewards.catalog')} · {visibleRewards.length}</h3>
          <select className="tq-input-compact rw-sort" value={sort} onChange={(e) => setSortChoice(e.target.value as typeof sortChoice)} aria-label={t('rewards.sortLabel')}>
            {hasFeatured && <option value="featured">{t('rewardOrder.featured')}</option>}
            <option value="priceLow">{t('rewards.sortPriceLow')}</option>
            <option value="priceHigh">{t('rewards.sortPriceHigh')}</option>
            <option value="name">{t('rewards.sortName')}</option>
          </select>
        </div>
        {visibleRewards.length === 0 ? (
          <div className="tq-card tq-empty-state" style={{ padding: '16px' }}>{t('rewards.noMatches')}</div>
        ) : (
          <div className="tq-card today-list chore-list rw-list">
            {(showAllShop ? visibleRewards : visibleRewards.slice(0, SHOP_LIMIT)).map(rewardRow)}
          </div>
        )}
        {visibleRewards.length > SHOP_LIMIT && (
          <button type="button" className="today-more" onClick={() => setShowAllShop((v) => !v)}>
            {showAllShop ? t('common.showLess') : t('common.showMore').replace('{n}', `${visibleRewards.length - SHOP_LIMIT}`)}
          </button>
        )}
      </section>
      {pendingReward && (
        <div className="tq-modal-overlay" style={{ zIndex: 120 }}>
          <div className="tq-card rewards-confirm-modal tq-modal tq-modal-narrow tq-card-padded">
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--warm-text)', marginBottom: 6 }}>{t('rewards.confirmTitle')}</div>
            <div style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600, marginBottom: 14 }}>
              {(buyingFor ? t('rewards.confirmTextFor').replace('{name}', forName) : t('rewards.confirmText'))
                .replace('{reward}', rewardTitle(pendingReward)).replace('{coins}', String(pendingReward.costCoins))}
            </div>
            {redeemError && <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)', marginBottom: 12 }}>{redeemError}</div>}
            <div className="rewards-confirm-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="tq-btn tq-btn-secondary tq-btn-sm" disabled={buying} onClick={() => setPendingRewardId(null)}>{t('common.cancel')}</button>
              <button className="tq-btn tq-btn-primary tq-btn-sm" disabled={buying} onClick={() => void confirmRedeem()}>{t('rewards.confirmBuy')}</button>
            </div>
          </div>
        </div>
      )}
      {spendFx && (
        <div key={spendFx.key} style={{ position: 'fixed', top: 88, right: 80, zIndex: 121, animation: 'coinSpendFloat 1.4s ease forwards', backgroundColor: 'var(--warm-accent-light)', border: '1.5px solid var(--warm-accent)', borderRadius: 14, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, color: 'var(--warm-accent)' }}>
          -{spendFx.amount} <CoinIcon />
        </div>
      )}
      {refundFx && (
        <div key={refundFx.key} style={{ position: 'fixed', top: 126, right: 80, zIndex: 121, animation: 'coinRefundFloat 1.7s ease forwards', backgroundColor: 'var(--status-approved-bg)', border: '1.5px solid var(--status-approved-border)', borderRadius: 14, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, color: 'var(--status-approved-text)' }}>
          +{refundFx.amount} <CoinIcon />
        </div>
      )}
    </div>
  );
}
