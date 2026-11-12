import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { FireIcon, CoinIcon, PointsIcon } from '../icons/UIIcons';
import { ShieldIcons } from '../shared/StreakShields';
import { SearchContext } from '../shared/searchContext';
import { SearchIcon } from '../shared/SearchOverlay';
import { UserAvatar } from '../shared/UserAvatar';
import { fireHeaderAdd } from './headerAdd';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCoins } from '../../utils/format';
import type { User } from '../../hooks/useAuth';

interface PageHeaderProps {
  title: string;
  subtitle: string;
  user: User;
  onCoinsClick?: () => void;
  onStreakClick?: () => void;
  onPointsClick?: () => void;
  userPoints?: number;
  pointsPeriodLabel?: string;
  gamificationEnabled?: boolean;
  /** Streak shields are on: show the ones held next to the streak */
  shieldsOn?: boolean;
  /** Home: on a phone the bar greets the person ("Hi, Dad") over this short date, next to their picture */
  homeDate?: string;
  /** This page adds things: on a phone the bar's one button is + with this name (it fires useHeaderAdd), not search */
  addLabel?: string;
  /** A page inside another (a room): a ← before the title goes back, named by backLabel (ENH-28) */
  onBack?: () => void;
  backLabel?: string;
}

// On a phone the header is one line (ENH-24; the rules are in index.css): the title or greeting, coins, streak and
// one button. The subtitle, the search button's word and the points chip are for wider screens.

export function PageHeader({ title, subtitle, user, onCoinsClick, onStreakClick, onPointsClick, userPoints, pointsPeriodLabel, gamificationEnabled = true, shieldsOn = false, homeDate, addLabel, onBack, backLabel }: PageHeaderProps) {
  const openSearch = useContext(SearchContext);
  const { t } = useTranslation(user.language);
  return (
    <div className={`page-header${homeDate ? ' page-header-home' : ''}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 16px', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
      <div className="page-header-title">
        {onBack && (
          <button type="button" onClick={onBack} className="ph-back" aria-label={backLabel} title={backLabel}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
          </button>
        )}
        {homeDate && (
          <Link to="/profile" className="ph-phone" aria-label={t('nav.profile')} style={{ flexShrink: 0, textDecoration: 'none' }}>
            <UserAvatar userId={user.id} name={user.displayName} color={user.avatarColor} size={36}
              avatarType={user.avatarType} avatarPreset={user.avatarPreset} avatarPhotoUrl={user.avatarPhotoUrl} />
          </Link>
        )}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--warm-text)', margin: 0, letterSpacing: -0.5 }}>
            {homeDate ? <><span className="ph-desktop">{title}</span><span className="ph-phone">{t('nav.hi').replace('{name}', user.displayName)}</span></> : title}
          </h1>
          <p className="page-header-sub" style={{ fontSize: 13, color: 'var(--warm-text-light)', fontWeight: 600, marginTop: 3 }}>
            {homeDate ? <><span className="ph-desktop">{subtitle}</span><span className="ph-phone">{homeDate}</span></> : subtitle}
          </p>
        </div>
      </div>
      <div className="page-header-actions" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
        {openSearch && (
          <button
            onClick={openSearch}
            aria-label={t('search.button')}
            title={`${t('search.button')} (/)`}
            className="ph-button"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              backgroundColor: 'var(--warm-accent-light)', borderRadius: 14, padding: '8px 14px',
              border: '1.5px solid var(--warm-streak-border)', cursor: 'pointer',
              color: 'var(--warm-streak-text)', fontFamily: 'Nunito', fontSize: 14, fontWeight: 800,
            }}
          >
            <SearchIcon size={17} />
            <span className="search-button-label">{t('search.button')}</span>
          </button>
        )}
        {addLabel && (
          <button onClick={fireHeaderAdd} aria-label={addLabel} title={addLabel} className="ph-button ph-add ph-phone"
            style={{ alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--warm-accent)', color: '#fff', border: 'none', borderRadius: 14, cursor: 'pointer' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        )}
        {gamificationEnabled && (
        <>
        <div
          onClick={onStreakClick}
          role={onStreakClick ? 'button' : undefined}
          tabIndex={onStreakClick ? 0 : -1}
          onKeyDown={(e) => {
            if (!onStreakClick) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onStreakClick();
            }
          }}
          className="ph-streak"
          style={{
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundColor: 'var(--warm-accent-light)', borderRadius: 14, padding: '8px 16px',
          border: '1.5px solid var(--warm-streak-border)',
          cursor: onStreakClick ? 'pointer' : 'default',
        }}>
          <FireIcon />
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-streak-text)' }}>{user.currentStreak}</span>
          {shieldsOn && <ShieldIcons count={user.streakShields} language={user.language} style={{ fontSize: 13 }} />}
        </div>
        <div
          onClick={onCoinsClick}
          role={onCoinsClick ? 'button' : undefined}
          tabIndex={onCoinsClick ? 0 : -1}
          onKeyDown={(e) => {
            if (!onCoinsClick) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onCoinsClick();
            }
          }}
          className="ph-coins"
          style={{
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundColor: 'var(--warm-accent-light)', borderRadius: 14, padding: '8px 16px',
          border: '1.5px solid var(--warm-streak-border)',
          cursor: onCoinsClick ? 'pointer' : 'default',
        }}>
          <CoinIcon />
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-streak-text)' }}>{formatCoins(user.coins)}</span>
        </div>
        <div
          onClick={onPointsClick}
          role={onPointsClick ? 'button' : undefined}
          tabIndex={onPointsClick ? 0 : -1}
          onKeyDown={(e) => {
            if (!onPointsClick) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPointsClick();
            }
          }}
          className="ph-points"
          style={{
          display: 'flex', alignItems: 'center', gap: 6,
          backgroundColor: 'var(--warm-accent-light)', borderRadius: 14, padding: '8px 16px',
          border: '1.5px solid var(--warm-streak-border)',
          cursor: onPointsClick ? 'pointer' : 'default',
        }}>
          <PointsIcon />
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--warm-streak-text)' }}>{formatCoins(userPoints ?? user.points)}</span>
          {pointsPeriodLabel && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--warm-text-light)', textTransform: 'uppercase' }}>{pointsPeriodLabel}</span>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
