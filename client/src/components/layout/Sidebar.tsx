import { NavLink, useNavigate } from 'react-router-dom';
import { FireIcon, CoinIcon, SparkleIcon } from '../icons/UIIcons';
import { UserAvatar } from '../shared/UserAvatar';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCoins } from '../../utils/format';
import { UserTitle } from '../shared/UserTitle';
import { navLabelKey, visibleNav } from './navItems';
import type { User } from '../../hooks/useAuth';

interface SidebarProps {
  user: User;
  gamificationEnabled?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}

/** The side menu on computers and tablets. Phones get the bottom bar instead (TabBar, ENH-24). */
export function Sidebar({ user, gamificationEnabled = true, collapsed = false, onToggle }: SidebarProps) {
  const navigate = useNavigate();
  const { t } = useTranslation(user.language);
  const effectiveCollapsed = collapsed;

  return (
    <>
      <nav
        style={{
          width: effectiveCollapsed ? 60 : 240,
          backgroundColor: 'var(--warm-sidebar)',
          borderRight: 'var(--shape-border-w) solid var(--warm-sidebar-border)',
          padding: effectiveCollapsed ? '24px 8px' : '24px 0',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 50,
          transition: 'width 0.3s ease, padding 0.3s ease',
        }}
        className="sidebar"
      >
        <div style={{ padding: effectiveCollapsed ? '0 8px' : '0 20px', marginBottom: effectiveCollapsed ? 8 : 36, display: 'flex', alignItems: 'center', justifyContent: effectiveCollapsed ? 'center' : 'flex-start', gap: effectiveCollapsed ? 0 : 12, position: 'relative' }}>
          {effectiveCollapsed && onToggle ? (
            <button
              onClick={onToggle}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 8,
                borderRadius: 8,
                color: 'var(--warm-text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={t('nav.expandSidebar')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3 10h14M3 5h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          ) : (
            <>
              <div style={{
                width: 42, height: 42, borderRadius: 14,
                background: 'var(--warm-sidebar-active)',
                border: 'var(--shape-border-w) solid var(--warm-sidebar-user-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <SparkleIcon />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 19, fontWeight: 900, color: 'var(--warm-text)', letterSpacing: -0.5 }}>TidyQuest</div>
                <div style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 700 }}>
                  {t('nav.tagline')}
                </div>
              </div>
              {onToggle && (
                <button
                  onClick={onToggle}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 8,
                    borderRadius: 8,
                    color: 'var(--warm-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 'auto',
                  }}
                  className="sidebar-collapse"
                  aria-label={t('nav.collapseSidebar')}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M3 10h14M3 5h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column', gap: 2, padding: effectiveCollapsed ? '0 8px' : '0 12px' }}>
          {visibleNav(user, gamificationEnabled).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={{ textDecoration: 'none' }}
            >
              {({ isActive }) => (
                <div
                  title={effectiveCollapsed ? t(navLabelKey(item)) : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: effectiveCollapsed ? '11px 0' : '11px 16px',
                    justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
                    borderRadius: 'var(--shape-radius-control)',
                    backgroundColor: isActive ? 'var(--warm-sidebar-active)' : 'transparent',
                    borderLeft: isActive ? '3px solid var(--warm-accent)' : '3px solid transparent',
                    transition: 'all 0.15s ease',
                  }}>
                  <span style={{ flexShrink: 0 }}><item.Icon active={isActive} /></span>
                  {!effectiveCollapsed && (
                    <span style={{
                      fontSize: 14, fontWeight: isActive ? 800 : 600,
                      color: isActive ? 'var(--warm-accent)' : 'var(--warm-text-muted)',
                    }}>{t(navLabelKey(item))}</span>
                  )}
                </div>
              )}
            </NavLink>
          ))}
        </div>

        <div style={{ padding: effectiveCollapsed ? '0 8px' : '0 14px' }}>
          <div
            onClick={() => navigate('/profile')}
            style={{
              display: 'flex', alignItems: 'center', gap: effectiveCollapsed ? 0 : 10,
              padding: effectiveCollapsed ? '8px' : '12px 14px',
              justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
              backgroundColor: 'var(--warm-sidebar-user-bg)', borderRadius: 'var(--shape-radius-card)', border: 'var(--shape-border-w) solid var(--warm-sidebar-user-border)',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
          >
            <UserAvatar
              userId={user.id}
              name={user.displayName}
              color={user.avatarColor}
              size={effectiveCollapsed ? 28 : 38}
              avatarType={user.avatarType}
              avatarPreset={user.avatarPreset}
              avatarPhotoUrl={user.avatarPhotoUrl}
            />
            {!effectiveCollapsed && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-text)' }}>{user.displayName}</div>
                <UserTitle userId={user.id} language={user.language} style={{ display: 'block', fontSize: 12 }} />
                {gamificationEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                      <CoinIcon /> {formatCoins(user.coins)}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                      <FireIcon /> {t('common.daysShort').replace('{n}', String(user.currentStreak))}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
