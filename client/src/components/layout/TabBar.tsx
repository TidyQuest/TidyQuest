import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { activeTab, navLabelKey, phoneNav } from './navItems';
import type { User } from '../../hooks/useAuth';

function MoreIcon({ active }: { active: boolean }) {
  const color = active ? 'var(--warm-accent)' : 'var(--warm-text-light)';
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill={color} aria-hidden="true">
      <circle cx="6" cy="13" r="2.2" /><circle cx="13" cy="13" r="2.2" /><circle cx="20" cy="13" r="2.2" />
    </svg>
  );
}

/** The phone's bottom bar: four pages and More (index.css shows it at phone width only) */
export function TabBar({ user, gamificationEnabled = true }: { user: User; gamificationEnabled?: boolean }) {
  const { t } = useTranslation(user.language);
  const { pathname } = useLocation();
  const { tabs } = phoneNav(user, gamificationEnabled);
  const current = activeTab(tabs, pathname);
  // Tapping the tab you're on goes back to the top of the page
  const toTop = (on: boolean) => () => { if (on) window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <nav className="tabbar" aria-label={t('nav.tabs')}>
      {tabs.map((item) => {
        const on = current === item.to;
        return (
          <Link key={item.to} to={item.to} className={`tabbar-tab${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined} onClick={toTop(on && pathname === item.to)}>
            <item.Icon active={on} />
            <span>{t(navLabelKey(item, true))}</span>
          </Link>
        );
      })}
      <Link to="/more" className={`tabbar-tab${current === 'more' ? ' on' : ''}`} aria-current={pathname === '/more' ? 'page' : undefined} onClick={toTop(pathname === '/more')}>
        <MoreIcon active={current === 'more'} />
        <span>{t('nav.more')}</span>
      </Link>
    </nav>
  );
}
