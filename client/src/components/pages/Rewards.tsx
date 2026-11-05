import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CoinIcon } from '../icons/UIIcons';
import { matchesQuery } from '../../utils/tasks';
import { useTranslation } from '../../hooks/useTranslation';
import { api, type RewardAvailability, type RewardPot } from '../../hooks/useApi';
import { formatCoins } from '../../utils/format';
import { localeFor } from '../../utils/locale';
import { byFeatured } from '../../utils/rewardRules';
import { rewardDescText, rewardTitleText } from '../../utils/presetRewards';

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
  onRewardRequestAction?: (id: number, status: 'approved' | 'rejected') => Promise<void>;
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
  const pct = pot.target > 0 ? Math.min(100, Math.round((pot.saved / pot.target) * 100)) : 0;
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      <div style={{ height: 10, borderRadius: 99, backgroundColor: 'var(--warm-border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--warm-accent)' }} />
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
        {t('rewardRules.potSaved').replace('{saved}', formatCoins(pot.saved, locale)).replace('{target}', formatCoins(pot.target, locale))}
        {pot.contributors.length > 0 && ` · ${pot.contributors.map((c) => `${c.displayName} ${formatCoins(c.amount, locale)}`).join(', ')}`}
      </div>
      {pot.awaitingApproval ? (
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--warm-accent)' }}>🎉 {t('rewardRules.potWaiting')}</div>
      ) : onContribute && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" min={0} max={most} className="tq-input-compact" value={amount} onChange={(e) => setAmount(e.target.value)}
            onFocus={(e) => e.target.select()} aria-label={t('rewardRules.chipIn')} style={{ width: 80 }} disabled={most < 1} />
          <button className="tq-btn tq-btn-primary tq-btn-sm" disabled={!valid}
            onClick={async () => {
              setError('');
              if (!valid) return;
              try { await onContribute(n); setAmount('0'); } catch (err) { setError(err instanceof Error ? err.message : t('common.error')); }
            }}>
            {t('rewardRules.chipIn')}
          </button>
          {error && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-danger)' }}>{error}</span>}
        </div>
      )}
    </div>
  );
}

export function Rewards({ language, rewards: ownRewards, mine: ownMine, userCoins: ownCoins, isAdmin, pendingRequests, onRewardRequestAction, onRedeem, onCancel, onContribute, people, onBoughtFor }: RewardsProps) {
  const { t } = useTranslation(language);
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
  const rewardDesc = (r: Reward): string => rewardDescText(r, t) || t('rewards.noDescription');

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
  const chipStyle = (on: boolean): CSSProperties => ({
    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 800, fontFamily: 'Nunito', cursor: 'pointer',
    border: `1.5px solid ${on ? 'var(--warm-accent)' : 'var(--warm-border)'}`,
    backgroundColor: on ? 'var(--warm-accent-light)' : 'var(--warm-bg-input)', color: on ? 'var(--warm-accent)' : 'var(--warm-text-muted)',
  });

  const confirmRedeem = async () => {
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
  };

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
    <div className="page-enter" style={{ display: 'grid', gap: 16 }}>
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
      <div className="tq-card tq-card-padded">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CoinIcon />
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)' }}>
            {buyingFor && `${forName}: `}{formatCoins(userCoins, localeFor(language))} {t('settings.coins')}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, marginTop: 4 }}>
          {buyingFor ? t('rewards.buyingForHint').replace('{name}', forName) : t('rewards.balanceHint')}
        </div>
        {isAdmin && people && people.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap', fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)' }}>
            🛒 {t('rewards.buyingFor')}
            <select className="tq-input-compact" value={forId ?? ''} onChange={(e) => pickPerson(e.target.value ? Number(e.target.value) : null)}
              style={{ padding: '6px 10px', fontSize: 13, cursor: 'pointer', minWidth: 0, maxWidth: '100%' }}>
              <option value="">{t('rewards.buyingForMe')}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
          </label>
        )}
        {forFailed && <div role="alert" style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-danger)', marginTop: 6 }}>{t('common.actionFailed')}</div>}
      </div>

      {isAdmin && pendingRequests && pendingRequests.filter(r => r.status === 'requested').length > 0 && (
        <div className="tq-card tq-card-padded">
          <h3 className="tq-card-title">{t('dashboard.rewardRequestsTitle')}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {pendingRequests.filter(r => r.status === 'requested').map((r) => (
              <div key={r.id} style={{ border: '1.5px solid var(--warm-border)', borderRadius: 12, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>{r.displayName} — {rewardTitleByName(r.title)}</div>
                  <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 700 }}>{new Date(r.redeemedAt).toLocaleString()} · {r.costCoins} coins</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={() => onRewardRequestAction?.(r.id, 'approved')}>{t('dashboard.approve')}</button>
                  <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => onRewardRequestAction?.(r.id, 'rejected')}>{t('dashboard.reject')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="tq-card rewards-catalog-card tq-card-padded">
        <h3 className="tq-card-title">{t('rewards.catalog')}</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <input
            type="search"
            className="tq-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('rewards.searchPlaceholder')}
            aria-label={t('rewards.searchPlaceholder')}
            style={{ flex: '2 1 220px', minWidth: 0 }}
          />
          <select className="tq-input-compact" value={sort} onChange={(e) => setSortChoice(e.target.value as typeof sortChoice)}
            style={{ flex: '1 1 150px', padding: '8px 10px', fontSize: 13, cursor: 'pointer', minWidth: 0 }}>
            {hasFeatured && <option value="featured">{t('rewardOrder.featured')}</option>}
            <option value="priceLow">{t('rewards.sortPriceLow')}</option>
            <option value="priceHigh">{t('rewards.sortPriceHigh')}</option>
            <option value="name">{t('rewards.sortName')}</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--warm-text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={affordableOnly} onChange={(e) => setAffordableOnly(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--warm-accent)', cursor: 'pointer' }} />
            {t('rewards.canAfford')}
          </label>
        </div>
        {categories.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }} role="group" aria-label={t('rewardOrder.category')}>
            <button type="button" style={chipStyle(category === null)} onClick={() => setCategory(null)}>{t('rewardOrder.all')}</button>
            {categories.map((c) => <button type="button" key={c} style={chipStyle(category === c)} onClick={() => setCategory(c)}>{c}</button>)}
            {hasUncategorized && <button type="button" style={chipStyle(category === '')} onClick={() => setCategory('')}>{t('rewardOrder.other')}</button>}
          </div>
        )}
        {visibleRewards.length === 0 && (
          <div className="tq-empty-state" style={{ padding: '16px 4px' }}>{t('rewards.noMatches')}</div>
        )}
        <div className="rewards-catalog-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {visibleRewards.map((r) => {
            const usedUp = !!r.availability && r.availability.remaining <= 0;
            const canBuy = userCoins >= r.costCoins && !usedUp;
            return (
              <div key={r.id} style={{ border: '1.5px solid var(--warm-border)', borderRadius: 14, padding: 12, backgroundColor: 'var(--warm-bg-subtle)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--warm-text)', marginBottom: 4 }}>{rewardTitle(r)}</div>
                <div style={{ fontSize: 11, color: 'var(--warm-text-light)', fontWeight: 600, minHeight: 32 }}>{rewardDesc(r)}</div>
                {(r.availability || r.availableUntil) && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: usedUp ? 'var(--warm-danger)' : 'var(--warm-text-muted)', marginTop: 4 }}>
                    {r.availability && (usedUp
                      ? t(`rewardRules.usedUp_${r.availability.period}`).replace('{day}', r.availability.resetsAt ? new Date(r.availability.resetsAt).toLocaleDateString(localeFor(language), { weekday: 'long' }) : '')
                      : t(`rewardRules.left_${r.availability.period}`).replace('{n}', String(r.availability.remaining)))}
                    {r.availability && r.availableUntil ? ' · ' : ''}
                    {r.availableUntil && t('rewardRules.untilDate').replace('{date}', new Date(`${r.availableUntil}T12:00:00`).toLocaleDateString(localeFor(language), { month: 'short', day: 'numeric' }))}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <CoinIcon /> {formatCoins(r.costCoins, localeFor(language))}
                  </div>
                  {!r.isShared && (
                    <button
                      className="tq-btn tq-btn-primary tq-btn-sm"
                      style={{ opacity: canBuy ? 1 : 0.6 }}
                      disabled={!canBuy}
                      onClick={() => { setRedeemError(''); setPendingRewardId(r.id); }}
                    >
                      {usedUp ? t('rewardRules.usedUp') : canBuy ? t('rewards.redeem') : t('rewards.notEnough')}
                    </button>
                  )}
                </div>
                {r.isShared && r.pot && (
                  <SharedPot pot={r.pot} userCoins={userCoins} language={language} onContribute={onContribute && !buyingFor ? (n) => onContribute(r.id, n) : undefined} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="tq-card tq-card-padded">
        <h3 className="tq-card-title">{buyingFor ? t('rewards.theirRequests').replace('{name}', forName) : t('rewards.myRequests')}</h3>
        {mine.length === 0 ? (
          <div className="tq-empty-state" style={{ padding: '16px 0' }}>{t('rewards.noRequests')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {mine.map((m) => (
              <div key={m.id} className="rewards-my-row" style={{ border: '1.5px solid var(--warm-border)', borderRadius: 12, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>{rewardTitleByName(m.title)}</div>
                  <div style={{ fontSize: 10, color: 'var(--warm-text-light)', fontWeight: 700 }}>
                    {new Date(m.redeemedAt).toLocaleString()}
                    {m.boughtByName && ` · 🛒 ${t('rewards.boughtBy').replace('{name}', m.boughtByName)}`}
                  </div>
                  {cancelFailed === m.id && <div role="alert" style={{ fontSize: 11, fontWeight: 700, color: 'var(--warm-danger)' }}>{t('common.actionFailed')}</div>}
                </div>
                <div className="rewards-my-row-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--warm-accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>- {m.costCoins} <CoinIcon /></div>
                  <span style={{ ...statusStyle(m.status), fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {statusLabel(m.status)}
                  </span>
                  {m.status === 'requested' && m.isShared ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-muted)' }}>{t('rewards.sharedParentDecides')}</span>
                  ) : m.status === 'requested' && !buyingFor && (
                    <button className="tq-btn tq-btn-secondary" onClick={() => { setCancelFailed(null); onCancel(m.id).catch(() => setCancelFailed(m.id)); }} style={{ padding: '4px 8px', fontSize: 10 }}>
                      {t('rewards.cancelRequest')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
              <button className="tq-btn tq-btn-secondary tq-btn-sm" onClick={() => setPendingRewardId(null)}>{t('common.cancel')}</button>
              <button className="tq-btn tq-btn-primary tq-btn-sm" onClick={confirmRedeem}>{t('rewards.confirmBuy')}</button>
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
