import { Link } from 'react-router-dom';
import { FireIcon, CoinIcon } from '../icons/UIIcons';
import { UserAvatar } from '../shared/UserAvatar';
import { UserTitle } from '../shared/UserTitle';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCoins } from '../../utils/format';
import { navLabelKey, phoneNav } from '../layout/navItems';
import type { User } from '../../hooks/useAuth';

/** The phone's More tab: your profile, and the pages that aren't on the bottom bar (ENH-24) */
export function More({ user, gamificationEnabled = true }: { user: User; gamificationEnabled?: boolean }) {
  const { t } = useTranslation(user.language);
  const { more } = phoneNav(user, gamificationEnabled);
  const row = { display: 'flex', alignItems: 'center', gap: 12, minHeight: 54, padding: '0 16px', textDecoration: 'none', color: 'var(--warm-text)' } as const;

  return (
    <div style={{ maxWidth: 560 }}>
      <Link to="/profile" className="tq-card" style={{ ...row, padding: '12px 16px', marginBottom: 14 }}>
        <UserAvatar userId={user.id} name={user.displayName} color={user.avatarColor} size={42}
          avatarType={user.avatarType} avatarPreset={user.avatarPreset} avatarPhotoUrl={user.avatarPhotoUrl} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, overflowWrap: 'anywhere' }}>{user.displayName}</div>
          <UserTitle userId={user.id} language={user.language} style={{ display: 'block' }} />
          {gamificationEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2, fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><CoinIcon /> {formatCoins(user.coins)}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><FireIcon /> {t('common.daysShort').replace('{n}', String(user.currentStreak))}</span>
            </div>
          )}
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--warm-accent)', flexShrink: 0 }}>{t('nav.profile')}</span>
      </Link>

      <div className="tq-card" style={{ padding: 0, overflow: 'hidden' }}>
        {more.map((item, i) => (
          <Link key={item.to} to={item.to} style={{ ...row, borderTop: i ? '1px solid var(--warm-border-subtle)' : 'none' }}>
            <span style={{ display: 'flex', flexShrink: 0 }}><item.Icon active={false} /></span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t(navLabelKey(item))}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
