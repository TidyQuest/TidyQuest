import type { ComponentType } from 'react';
import { HomeIcon, RoomsIcon, TasksIcon, TrophyIcon, CalendarIcon, ActivityIcon, AchievementsIcon, SettingsIcon, RewardsIcon, InsightsIcon } from '../icons/NavIcons';
import type { User } from '../../hooks/useAuth';

export interface NavItem {
  to: string;
  /** Its name is the `nav.<label in lower case>` translation */
  label: string;
  Icon: ComponentType<{ active: boolean }>;
  adminOnly?: boolean;
}

/** Every page in the menu, in the side menu's order */
export const navItems: NavItem[] = [
  { to: '/', label: 'Home', Icon: HomeIcon },
  { to: '/rooms', label: 'Rooms', Icon: RoomsIcon },
  { to: '/tasks', label: 'Tasks', Icon: TasksIcon },
  { to: '/leaderboard', label: 'Board', Icon: TrophyIcon },
  { to: '/calendar', label: 'Calendar', Icon: CalendarIcon },
  { to: '/activity', label: 'Activity', Icon: ActivityIcon },
  { to: '/insights', label: 'Insights', Icon: InsightsIcon, adminOnly: true },
  { to: '/rewards', label: 'Rewards', Icon: RewardsIcon },
  { to: '/achievements', label: 'Achievements', Icon: AchievementsIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

const GAMIFICATION_ROUTES = new Set(['/leaderboard', '/rewards', '/achievements']);

/** The pages this person can open */
export function visibleNav(user: Pick<User, 'role'>, gamificationEnabled: boolean): NavItem[] {
  return navItems.filter((item) => (gamificationEnabled || !GAMIFICATION_ROUTES.has(item.to)) && (!item.adminOnly || user.role === 'admin'));
}

// The phone's bottom bar has four pages and More (ENH-24). Kids get their badges instead of Rooms. The spares fill
// the bar when the family has switched coins and rewards off.
const PARENT_TABS = ['/', '/rooms', '/rewards', '/leaderboard'];
const KID_TABS = ['/', '/rewards', '/leaderboard', '/achievements'];
const SPARE_TABS = ['/rooms', '/tasks', '/calendar', '/activity'];

export function isKidNav(user: Pick<User, 'role' | 'kidMode'>): boolean {
  return user.role === 'child' || !!user.kidMode;
}

/** The phone's bottom bar: the four pages on it, and the rest, which More lists */
export function phoneNav(user: Pick<User, 'role' | 'kidMode'>, gamificationEnabled: boolean): { tabs: NavItem[]; more: NavItem[] } {
  const all = visibleNav(user, gamificationEnabled);
  const tabs: NavItem[] = [];
  for (const to of [...(isKidNav(user) ? KID_TABS : PARENT_TABS), ...SPARE_TABS]) {
    const item = all.find((i) => i.to === to);
    if (item && !tabs.includes(item) && tabs.length < 4) tabs.push(item);
  }
  return { tabs, more: all.filter((i) => !tabs.includes(i)) };
}

/** The translation key of a page's name; on the bottom bar the badges page gets its short name */
export function navLabelKey(item: NavItem, onTabBar = false): string {
  return onTabBar && item.to === '/achievements' ? 'nav.badges' : `nav.${item.label.toLowerCase()}`;
}

/** Which bottom-bar tab a page belongs to: one of the four, or 'more' */
export function activeTab(tabs: NavItem[], path: string): string {
  if (path === '/' || path === '/focus') return '/';
  return tabs.find((tab) => tab.to !== '/' && (path === tab.to || path.startsWith(`${tab.to}/`)))?.to ?? 'more';
}
