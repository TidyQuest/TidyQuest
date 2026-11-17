import { TaskIcon } from '../icons/TaskIcons';
import { drawnBadgeIcon } from '../../utils/badges';

/** A parent-made badge's icon: one of the chore icons ("icon:<key>") or, for older badges, an emoji */
export function BadgeIcon({ icon, size = 18 }: { icon: string; size?: number }) {
  const key = drawnBadgeIcon(icon);
  if (key) return <span style={{ display: 'inline-flex', verticalAlign: 'middle', lineHeight: 0 }}><TaskIcon iconKey={key} size={size} /></span>;
  return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
}
