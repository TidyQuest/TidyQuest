import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../../hooks/useTranslation';
import type { User } from '../../hooks/useAuth';
import { navLabelKey, phoneNav } from '../layout/navItems';
import { useChoreTimer } from '../../hooks/useChoreTimer';

/**
 * "What's new" after a big update (NEW-38): a few click-through slides the first time someone opens the app after a
 * change we picked (the list is in utils/whatsNew.ts). Button names come from the app's own labels, so every
 * language says what's on screen.
 */
interface Slide { key: string; title: string; lead: string; steps: string[]; mock: ReactNode }

export function WhatsNew({ user, gamificationEnabled, auto, onClose, onOpenGuide, onOpenLook }: {
  user: User;
  gamificationEnabled: boolean;
  /** Opened by itself after an update (not from the guide): it waits for another day while a chore timer runs */
  auto?: boolean;
  onClose: () => void;
  onOpenGuide: () => void;
  onOpenLook: () => void;
}) {
  const { t, taskName } = useTranslation(user.language);
  const [slide, setSlide] = useState(0);
  const timer = useChoreTimer();
  // Decided once: a timer running when the app opened keeps it away until the app is opened again
  const [held] = useState(() => !!auto && !!timer?.state);
  const isAdmin = user.role === 'admin';
  const kid = !!user.kidMode;

  const { tabs, more } = phoneNav(user, gamificationEnabled);
  const names: Record<string, string> = {
    '{more}': t('nav.more'), '{moreList}': more.map((i) => t(navLabelKey(i))).join(', '), '{home}': t('nav.home'),
    '{overdue}': t('today.overdue'), '{todayList}': t('today.today'), '{anytime}': t('today.anytime'), '{mine}': t('dashboard.myTasks'),
    '{everyone}': t('today.everyone'), '{edit}': t('common.edit'), '{pin}': t('chore.pin'), '{search}': t('search.button'),
    '{rooms}': t('nav.rooms'), '{addTask}': t('roomDetail.addTask'), '{addRoom}': t('rooms.addRoom'), '{editRooms}': t('rooms.editRooms'),
    '{settings}': t('settings.title'), '{searchSettings}': t('settingsIndex.search'), '{look}': t('look.title'),
    '{fresh}': t('look.fresh'), '{quest}': t('look.quest'), '{calm}': t('look.calm'), '{nextUp}': t('today.nextUp'),
    '{doneBig}': t('today.doneBig'), '{pickAnother}': t('today.pickAnother'),
  };
  const fill = (text: string) => Object.entries(names).reduce((out, [k, v]) => out.split(k).join(v), text);
  const lines = (key: string) => fill(t(key)).split('\n').filter(Boolean);
  const chip = (label: string, hl = false) => <span className={`setup-mock-btn${hl ? ' hl' : ''}`}>{label}</span>;
  const row = (...children: ReactNode[]) => <div className="setup-mock-row">{children}</div>;
  const name = (text: string, small?: string) => <span className="setup-mock-name">{text}{small && <small>{small}</small>}</span>;
  const counters = `🧽 ${taskName('Clean Counters', 'kitchen.clean_counters')}`;
  const make = (key: string, mock: ReactNode, steps = `whatsNew.${key}Steps`): Slide => ({
    key, title: fill(t(`whatsNew.${key}Title`)), lead: fill(t(`whatsNew.${key}Lead`)), steps: lines(steps), mock,
  });

  const tabBar = row(...tabs.map((i) => chip(t(navLabelKey(i, true)))), chip(`⋯ ${t('nav.more')}`, true));
  const choreRow = row(name(counters, `${t('today.today')}`), chip('5 🪙'), chip('✓', true));
  const SLIDES: Slide[] = kid ? [
    make('kidTabs', tabBar),
    make('kidNext', <>{row(name(`🧹 ${taskName('10-minute room tidy', 'starter.room_tidy')}`, t('today.nextUp')))}{row(chip(`✓ ${t('today.doneBig')}`, true), chip(t('today.pickAnother')))}</>),
    make('kidRows', choreRow),
  ] : [
    make('tabs', tabBar),
    make('today', <>{row(chip('60%'), name(t('today.left').replace('{n}', '3')), chip('🔥 4'))}{row(chip(t('today.overdue')), chip(t('today.today'), true), chip(t('today.anytime')))}</>),
    make('rows', <>{choreRow}{row(chip(t('common.edit'), true), chip(t('chore.pin')), chip('⋯'))}</>),
    make('top', row(name(t('nav.rooms')), chip('🪙 120'), chip('🔍', true), ...(isAdmin ? [chip('+', true)] : [])), isAdmin ? 'whatsNew.topStepsAdmin' : 'whatsNew.topSteps'),
    ...(isAdmin ? [make('settings', <>{row(name(t('settingsGroups.household')))}{row(name(`🎨 ${t('look.title')}`, t('look.fresh')), chip(t('look.quest')), chip(t('look.calm')))}</>)] : []),
  ];
  if (held) return null;
  const s = SLIDES[slide];
  const last = slide === SLIDES.length - 1;

  return createPortal(
    <div className="tq-modal-overlay whats-new-overlay">
      <div className={`tq-card tq-modal tq-card-padded setup-tour whats-new${kid ? ' whats-new-kid' : ''}`} role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
        <div className="setup-card-head">
          <span className="setup-row-meta">📣 {t('whatsNew.title')}</span>
          <span className="setup-row-meta">{slide + 1} / {SLIDES.length}</span>
        </div>
        <div className="tq-card-title" id="whats-new-title" aria-live="polite">{s.title}</div>
        <p className="setup-tour-lead">{s.lead}</p>
        <div className="setup-mock" aria-hidden="true">{s.mock}</div>
        <ul className="setup-tour-steps">{s.steps.map((x) => <li key={x}>{x}</li>)}</ul>
        <div className="setup-dots" aria-hidden="true">
          {SLIDES.map((sl, i) => <span key={sl.key} className={i === slide ? 'on' : ''} />)}
        </div>
        <div className="setup-nav setup-tour-nav">
          {slide > 0
            ? <button type="button" className="tq-btn tq-btn-secondary" onClick={() => setSlide((n) => n - 1)}>{t('setup.back')}</button>
            : <span />}
          {!last && <button type="button" className="tq-btn tq-btn-sm setup-skip" onClick={onClose}>{t('setup.tourSkip')}</button>}
          {!last
            ? <button type="button" className="tq-btn tq-btn-primary" onClick={() => setSlide((n) => n + 1)} autoFocus>{t('setup.next')}</button>
            : <button type="button" className="tq-btn tq-btn-primary" onClick={onClose} autoFocus>{t('whatsNew.gotIt')}</button>}
        </div>
        {last && (
          <div className="whats-new-more">
            {isAdmin && !kid && <button type="button" className="tq-btn tq-btn-sm tq-btn-secondary" onClick={onOpenLook}>🎨 {t('look.title')}</button>}
            <button type="button" className="tq-btn tq-btn-sm tq-btn-secondary" onClick={onOpenGuide}>📖 {t('guide.title')}</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
