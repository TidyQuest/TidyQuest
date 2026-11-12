import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useNavigationType, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { taskErrorText } from './utils/taskError';
import { useAppUpdate } from './utils/appUpdate';
import { api, NEW_TOKEN_EVENT } from './hooks/useApi';
import { Sidebar } from './components/layout/Sidebar';
import { TabBar } from './components/layout/TabBar';
import { More } from './components/pages/More';
import { PageHeader } from './components/layout/PageHeader';
import { ConfettiEffect } from './components/shared/ConfettiEffect';
import { ChoreTimerBar, ChoreTimerProvider } from './components/shared/ChoreTimer';
import { SearchOverlay } from './components/shared/SearchOverlay';
import { SearchContext } from './components/shared/searchContext';
import type { Proof } from './components/shared/ProofModal';
import { PhotoFailedNote, type PhotoProblem } from './components/shared/PhotoFailedNote';
import { AchievementUnlockToast } from './components/ui/AchievementUnlockToast';
import Dashboard from './components/pages/Dashboard';
import { Focus, type FocusData } from './components/pages/Focus';
import { RoomsList } from './components/pages/RoomsList';
import { RoomDetail } from './components/pages/RoomDetail';
import { TaskList } from './components/pages/TaskList';
import { Calendar } from './components/pages/Calendar';
import { Leaderboard } from './components/pages/Leaderboard';
import { History } from './components/pages/History';
import { Insights } from './components/pages/Insights';
import { Settings } from './components/pages/Settings';
import { Profile } from './components/pages/Profile';
import { Guide } from './components/pages/Guide';
import { SetupWizard } from './components/pages/SetupWizard';
import { Login } from './components/pages/Login';
import { Register } from './components/pages/Register';
import { SignUp } from './components/pages/SignUp';
import { ConfirmEmail, ResetPassword, Unsubscribe } from './components/pages/EmailLinks';
import { AgreeScreen, ConfirmEmailBanner, LockedScreen } from './components/shared/HostedAccount';
import { isShutOut, limitError, takeFamilyLink, useHosted, type HostedAccount } from './utils/hosted';
import { Achievements } from './components/pages/Achievements';
import { Rewards } from './components/pages/Rewards';
import { useTranslation } from './hooks/useTranslation';
import { localeFor } from './utils/locale';
import { isTheme, type Theme } from './utils/themes';
import { activeSeason, useSeasonPreview } from './utils/seasons';
import { CosmeticsContext, type Cosmetic } from './utils/unlocks';
import { WeekStartContext } from './utils/week';
import { familyZone, setFamilyZone } from './utils/clock';
import { syncPush } from './utils/pushSync';

const NO_COSMETICS: Record<number, Cosmetic> = {};
import { SeasonGreeting, SeasonParticles, SeasonStrip } from './components/shared/SeasonalDecor';

// Opened through a family link (app.tidyquest.org/<code>): this device remembers the family
takeFamilyLink();

function AppContent() {
  const { user, loading, startFailed, retryStart, login, signIn, register, logout, refreshUser } = useAuth();
  const hosted = useHosted();
  // Hosted mode: the family code, this person's sign-in email, and whether the family is locked
  const [hostedAccount, setHostedAccount] = useState<HostedAccount | null>(null);
  const loadHostedAccount = useCallback(() => {
    api.hostedAccount().then(setHostedAccount).catch(() => {});
  }, []);
  useEffect(() => {
    if (hosted && user?.id) loadHostedAccount();
  }, [hosted, user?.id, loadHostedAccount]);
  // Web push (NEW-5): keep this device's sign-up current when the app opens and after a fresh login
  useEffect(() => {
    if (!user?.id) return;
    const id = user.id;
    void syncPush(id);
    const again = () => void syncPush(id);
    window.addEventListener(NEW_TOKEN_EVENT, again);
    return () => window.removeEventListener(NEW_TOKEN_EVENT, again);
  }, [user?.id]);
  const browserLang = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en';
  // Always call useTranslation unconditionally (React hooks rule) — use user's language if known, else browser lang
  const { t, roomDisplayName } = useTranslation(user?.language ?? browserLang);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [family, setFamily] = useState<any[]>([]);
  const [familySettings, setFamilySettings] = useState<any[]>([]);
  const [pointsPeriod, setPointsPeriod] = useState<'all' | 'week' | 'month' | 'year'>('all');
  const [pointsLeaderboard, setPointsLeaderboard] = useState<any[]>([]);
  // Home's family progress uses this week's coins (the Board page loads its own periods)
  const [leaderboardPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('week');
  const [coinsByEffort, setCoinsByEffort] = useState<Record<number, number>>({ 1: 5, 2: 10, 3: 15, 4: 20, 5: 25 });
  const [achievementsData, setAchievementsData] = useState<any>(null);
  const [rewardsData, setRewardsData] = useState<{ rewards: any[]; mine: any[] }>({ rewards: [], mine: [] });
  // The device's theme (also the login screen's); a signed-in person's own theme wins
  const [deviceTheme, setDeviceTheme] = useState<Theme>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('tidyquest_theme') : null;
    return isTheme(saved) ? saved : 'orange';
  });
  const theme: Theme = isTheme(user?.theme) ? user.theme : deviceTheme;
  const changeTheme = async (next: Theme) => {
    setDeviceTheme(next);
    if (user) {
      await api.updateProfile(user.id, { theme: next });
      await refreshUser();
    }
  };
  // Seasonal styling (utils/seasons.ts): the holiday showing now, or the one a parent is previewing
  const seasonPreview = useSeasonPreview();
  const season = activeSeason({ enabled: !!dashboardData && dashboardData.features?.seasonal !== false, off: dashboardData?.holidaysOff ?? [], preview: seasonPreview });
  const seasonColors = season && user?.holidayColors !== 0 ? season : null;
  const [vacationConfig, setVacationConfig] = useState<{ vacationMode: boolean; vacationStartDate: string | null; vacationEndDate: string | null } | null>(null);
  const vacationUpdatePending = useRef(false);
  const dashboardLoadInFlight = useRef<Promise<void> | null>(null);
  const roomsRefreshInFlight = useRef<Promise<void> | null>(null);
  const [gamificationEnabled, setGamificationEnabled] = useState(true);
  const [confetti, setConfetti] = useState(false);
  // The short banner after a Done: red when it failed, green (ok) when it only waits for a parent (FIX-33)
  const [taskMsg, setTaskMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [photoProblem, setPhotoProblem] = useState<PhotoProblem | null>(null);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  // Names for the pop-up from the completion itself (parent-made and secret badges aren't in the page data yet)
  const [unlockedInfo, setUnlockedInfo] = useState<Array<{ id: string; titleKey: string | null; title: string | null }>>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('tidyquest-sidebar-collapsed');
    return saved === 'true';
  });
  const navigate = useNavigate();
  const location = useLocation();
  useAppUpdate(location.pathname);

  const refreshRooms = useCallback(async () => {
    if (roomsRefreshInFlight.current) return roomsRefreshInFlight.current;
    const p = (async () => {
      try {
        const roomsData = await api.getRooms();
        setRooms(roomsData);
        setRoomsLoaded(true);
      } catch { /* ignore */ }
    })().finally(() => {
      roomsRefreshInFlight.current = null;
    });
    roomsRefreshInFlight.current = p;
    return p;
  }, []);

  const loadDashboard = useCallback(async () => {
    if (dashboardLoadInFlight.current) return dashboardLoadInFlight.current;
    const p = (async () => {
      try {
        const [dash, lb, users, coinCfg, ach, roomsData] = await Promise.all([
          api.dashboard(),
          api.leaderboard(leaderboardPeriod),
          api.getUsers(),
          api.getCoinsConfig(),
          api.achievements(),
          api.getRooms(),
        ]);
        // The family's clock first, so everything drawn from this dashboard counts days at home
        setFamilyZone(dash.timeZone);
        setDashboardData(dash);
        if (dash.vacation && !vacationUpdatePending.current) setVacationConfig(dash.vacation);
        setRooms(roomsData);
        setRoomsLoaded(true);
        setFamily(lb);
        setFamilySettings(users);
        setCoinsByEffort(coinCfg.coinsByEffort || { 1: 5, 2: 10, 3: 15, 4: 20, 5: 25 });
        setAchievementsData(ach);
      } catch { /* not logged in */ }
    })().finally(() => {
      dashboardLoadInFlight.current = null;
    });
    dashboardLoadInFlight.current = p;
    return p;
  }, [leaderboardPeriod]);

  const loadRewards = useCallback(() => api.getRewards()
    .then((data) => setRewardsData(data))
    .catch(() => setRewardsData({ rewards: [], mine: [] })), []);

  // A new family's parent lands in the setup wizard once (NEW-17); "Not now" or finishing it stops that
  const setupOpened = useRef(false);
  useEffect(() => {
    if (dashboardData?.setupNeeded && location.pathname === '/' && !setupOpened.current) {
      setupOpened.current = true;
      navigate('/setup');
    }
  }, [dashboardData?.setupNeeded, location.pathname, navigate]);

  // Search lists rewards with their prices, so fetch them fresh when it opens (a price just changed in Settings
  // otherwise showed the old one until the Rewards page was opened)
  useEffect(() => {
    if (searchOpen && user) loadRewards();
  }, [searchOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) {
      loadDashboard();
      api.getGamificationConfig().then((cfg) => setGamificationEnabled(cfg.gamificationEnabled)).catch(() => {});
    }
  }, [user, loadDashboard]);

  // Selectively refresh data when navigating to pages that need fresh data
  useEffect(() => {
    if (!user) return;
    const path = location.pathname;
    if (path === '/') {
      loadDashboard();
    } else if (path === '/rooms' || path.startsWith('/rooms/') || path === '/tasks') {
      refreshRooms();
    }
    if (path === '/rewards') {
      loadRewards();
      // The balance to spend, and the requests waiting for a parent
      void refreshUser();
      loadDashboard();
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll every 15s to reflect other users' actions without requiring F5
  useEffect(() => {
    if (!user) return;
    const isDashboardPath = location.pathname === '/';
    const isRoomsPath = location.pathname === '/rooms' || location.pathname.startsWith('/rooms/') || location.pathname === '/tasks';
    // Rewards too, so a price or reward a parent just changed shows up on a page left open (BUG-13)
    const isRewardsPath = location.pathname === '/rewards';
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      // The coin balance in the header and on Rewards: a parent may just have approved a chore, given a bonus
      // or refunded a reward (BUG-36)
      void refreshUser();
      // Rewards shows the parents' request list, which comes with the dashboard
      if (isDashboardPath || isRewardsPath) loadDashboard();
      if (isRoomsPath) refreshRooms();
      if (isRewardsPath) loadRewards();
    };
    const interval = setInterval(tick, 15000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [user, location.pathname, loadDashboard, refreshRooms, loadRewards, refreshUser]);

  // Each page opens at the top. A room opened for one task (?task=) scrolls to that task
  // itself, a link with a #section (the guide) scrolls to that section, and Rooms reached by going
  // back from a room returns to where it was (RoomsList); parent effects run after child effects,
  // so skip those here or it would undo them.
  const navType = useNavigationType();
  useEffect(() => {
    if (new URLSearchParams(location.search).has('task') || location.hash) return;
    if (location.pathname === '/rooms' && (navType === 'POP' || (location.state as { fromRoom?: number } | null)?.fromRoom)) return;
    window.scrollTo(0, 0);
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // "/" or Ctrl/Cmd+K opens search from anywhere, unless the user is typing
  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user]);

  useEffect(() => {
    if (user) loadRewards();
  }, [user, loadRewards]);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'orange') {
      html.removeAttribute('data-theme');
    } else {
      html.setAttribute('data-theme', theme);
    }
    localStorage.setItem('tidyquest_theme', theme);
  }, [theme]);

  useEffect(() => {
    const html = document.documentElement;
    const set = (name: string, value: string | null) => (value ? html.setAttribute(name, value) : html.removeAttribute(name));
    set('data-season', season?.id ?? null);
    set('data-season-colors', seasonColors?.id ?? null);
    set('data-season-dark', seasonColors?.dark ? '1' : null);
    if (season) html.style.setProperty('--season-pattern', season.pattern); else html.style.removeProperty('--season-pattern');
  }, [season, seasonColors]);

  // Added to a phone's home screen, the status bar takes this color: keep it the page's own background
  useEffect(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--warm-bg').trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }, [theme, seasonColors]);

  useEffect(() => {
    document.title = 'TidyQuest';
  }, []);

  useEffect(() => {
    if (user && (location.pathname === '/login' || location.pathname === '/register')) {
      navigate('/', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem('tidyquest-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  /** Resolves true when the chore was recorded (or waits for approval) */
  const handleCompleteTask = async (taskId: number, proof?: Proof): Promise<boolean> => {
    try {
      const result = await api.completeTask(taskId, undefined, proof?.note ? { note: proof.note } : {});
      if (proof?.file && result.completionId) {
        const { file } = proof;
        const { completionId } = result;
        // The chore is already recorded; a failed photo upload shouldn't undo that
        await api.uploadCompletionPhoto(completionId, file).catch((err) => {
          // Say why when it's a limit (file size, the family's photo space); otherwise the same photo can go
          // again while a parent still has to look at the chore
          const why = limitError(err, t, '');
          setPhotoProblem({ completionId, file, why, canRetry: !why && !!result.pendingApproval });
        });
      }
      if (result.pendingApproval) {
        setConfetti(false);
        setTaskMsg({ text: t('app.pendingApproval'), ok: true });
        setTimeout(() => setTaskMsg(null), 3500);
        // Home and the room page both show "waiting for approval" once they reload
        await Promise.all([refreshRooms(), loadDashboard()]);
        return true;
      }
      if (result.newAchievements && result.newAchievements.length > 0) {
        setUnlockedInfo(result.newAchievementInfo ?? []);
        setUnlockedAchievements(result.newAchievements);
      }
      setConfetti(true);
      refreshUser();
      await Promise.all([refreshRooms(), loadDashboard()]);
      setTimeout(() => setConfetti(false), 2200);
      return true;
    } catch (err) {
      setConfetti(false);
      setTaskMsg({ text: taskErrorText(err, t) });
      setTimeout(() => setTaskMsg(null), 3500);
      return false;
    }
  };

  const handleExport = async () => {
    const data = await api.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tidyquest-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || !Array.isArray(data.users) || !Array.isArray(data.rooms)) {
          alert(t('app.importInvalid'));
          return;
        }
        await api.importData(data);
        // Start again with the imported family (you may have another id in it)
        window.location.reload();
      } catch (err) {
        const body = (err as { body?: { code?: string; username?: string } })?.body;
        if (body?.code === 'not-in-backup') {
          alert(t('app.importNotIn').replace('{name}', body.username ?? ''));
          return;
        }
        alert(t('app.importFailed').replace('{error}', limitError(err, t, err instanceof Error ? err.message : t('common.error'))));
      }
    };
    input.click();
  };

  if (loading || (!user && hosted === null)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--warm-bg)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--warm-text-light)' }}>{t('common.loading')}...</div>
      </div>
    );
  }

  // Signed in, but the server didn't answer when the app opened (BUG-34): say so and keep trying
  if (startFailed && !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', backgroundColor: 'var(--warm-bg)' }}>
        <div style={{ fontSize: 44 }} aria-hidden>📡</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--warm-text)', margin: 0 }}>{t('app.cantReachTitle')}</h2>
        <p style={{ color: 'var(--warm-text-light)', fontWeight: 600, maxWidth: 340, margin: 0 }}>{t('app.cantReachText')}</p>
        <button onClick={() => void retryStart()} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'var(--warm-accent)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
          {t('proof.tryAgain')}
        </button>
        <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--warm-text-light)', fontWeight: 600, fontSize: 13, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>
          {t('profile.logout')}
        </button>
      </div>
    );
  }

  // The links in hosted mode's emails
  if (location.pathname === '/confirm-email') return <ConfirmEmail signedIn={!!user} />;
  if (location.pathname === '/reset-password') return <ResetPassword onSignedIn={signIn} />;
  if (location.pathname === '/unsubscribe') return <Unsubscribe />;

  if (!user) {
    if (hosted && location.pathname === '/signup') return <SignUp onSignedIn={signIn} />;
    if (authView === 'register') {
      return <Register onRegister={register} onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <Login onLogin={login} onSwitchToRegister={() => setAuthView('register')} hosted={!!hosted} onSignUp={() => navigate('/signup')} />;
  }

  if (hostedAccount && isShutOut(hostedAccount)) {
    return <LockedScreen account={hostedAccount} language={user.language} onChanged={loadHostedAccount}
      onLogout={() => { logout(); setHostedAccount(null); navigate('/login', { replace: true }); }} />;
  }
  // NEW-34: a parent or member agrees to the terms first; a full load then fetches what the server held back
  if (hostedAccount?.mustAgree) {
    return <AgreeScreen account={hostedAccount} language={user.language} onAgreed={() => { window.location.href = '/'; }}
      onLogout={() => { logout(); setHostedAccount(null); navigate('/login', { replace: true }); }} />;
  }

  const today = new Date().toLocaleDateString(localeFor(user.language), { weekday: 'long', month: 'long', day: 'numeric', timeZone: familyZone() });
  // The phone's top bar on Home: "Hi, Dad" over a short date (ENH-24)
  const todayShort = new Date().toLocaleDateString(localeFor(user.language), { weekday: 'short', month: 'short', day: 'numeric', timeZone: familyZone() });
  const periods: Array<'all' | 'week' | 'month' | 'year'> = ['all', 'week', 'month', 'year'];
  const myPoints = pointsPeriod === 'all'
    ? (user.points ?? 0)
    : (pointsLeaderboard.find((u: any) => u.id === user.id)?.points ?? 0);
  const pointsPeriodLabel = pointsPeriod === 'all' ? '' : t(`period.${pointsPeriod}`);
  const handlePointsClick = async () => {
    const next = periods[(periods.indexOf(pointsPeriod) + 1) % periods.length];
    setPointsPeriod(next);
    if (next !== 'all') {
      const lb = await api.leaderboard(next);
      setPointsLeaderboard(lb);
    } else {
      setPointsLeaderboard([]);
    }
  };
  // Parents get paused chores too (ENH-1), but only a room's own page shows them
  const activeRooms: typeof rooms = rooms.map((r: { tasks?: Array<{ pausedAt?: string | null }> }) => (r.tasks || []).some((t) => t.pausedAt)
    ? { ...r, tasks: (r.tasks || []).filter((t) => !t.pausedAt) } : r);
  // Build flat tasks list for calendar
  const allTasks = activeRooms.flatMap((r: any) =>
    (r.tasks || []).map((t: any) => ({ ...t, roomName: r.name, roomType: r.roomType }))
  );

  // One thing at a time: a page of its own, or Home itself when a parent chose that ("?all=1" shows the full Home)
  const focusData: FocusData | null = dashboardData?.focus ?? null;
  const focusIsHome = focusData?.mode === 'home' && !new URLSearchParams(location.search).has('all');
  const focusPage = (onLeave: () => void, leaveLabel: string) => focusData && (
    <Focus focus={focusData} userId={user.id} language={user.language} coinsByEffort={coinsByEffort}
      gamificationEnabled={gamificationEnabled} mission={gamificationEnabled ? dashboardData?.rescueMission : null}
      roomName={(name, roomId) => roomDisplayName(name, rooms.find((r: { id: number; roomType?: string }) => r.id === roomId)?.roomType || '')}
      onComplete={(id) => handleCompleteTask(id)} onSeeAll={() => navigate('/tasks')} onLeave={onLeave} leaveLabel={leaveLabel} />
  );

  return (
    <SearchContext.Provider value={openSearch}>
    <CosmeticsContext.Provider value={dashboardData?.cosmetics ?? NO_COSMETICS}>
    <WeekStartContext.Provider value={dashboardData?.weekStart ?? 1}>
    <ChoreTimerProvider key={user.id} userId={user.id} role={user.role} language={user.language} onComplete={(id) => handleCompleteTask(id)}>
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--warm-bg)' }}>
      <ConfettiEffect show={confetti} season={season} celebration={dashboardData?.cosmetics?.[user.id]?.celebration} />
      {season && <SeasonParticles season={season} />}

      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          rooms={activeRooms}
          rewards={rewardsData.rewards}
          language={user.language}
          gamificationEnabled={gamificationEnabled}
          onNavigate={(path) => navigate(path)}
          mineOnlyFor={user.taskView === 'mineOnly' || user.kidMode ? user : null}
        />
      )}

      {/* Achievement unlock toast */}
      {unlockedAchievements.length > 0 && (
        <AchievementUnlockToast
          achievementIds={unlockedAchievements}
          onDismiss={() => setUnlockedAchievements([])}
          language={user?.language}
          titles={Object.fromEntries([
            ...((achievementsData?.me?.achievements ?? []) as Array<{ id: string; titleKey?: string | null; title?: string | null }>),
            ...unlockedInfo,
          ].filter((a) => a.titleKey || a.title).map((a) => [a.id, a.titleKey ? t(a.titleKey) : a.title as string]))}
        />
      )}

      {/* After a Done: what went wrong (red), or that it now waits for a parent (green) */}
      {taskMsg && (
        <div role={taskMsg.ok ? 'status' : 'alert'} style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, background: taskMsg.ok ? '#15803D' : '#EF4444', color: '#fff',
          padding: '12px 24px', borderRadius: 12, fontWeight: 700, fontSize: 15,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', pointerEvents: 'none',
          width: 'max-content', maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', textAlign: 'center',
        }}>
          {taskMsg.ok && '✅ '}{taskMsg.text}
        </div>
      )}

      {photoProblem && (
        <PhotoFailedNote key={photoProblem.completionId} problem={photoProblem} language={user?.language}
          onClose={() => setPhotoProblem((p) => (p === photoProblem ? null : p))} />
      )}

      <Sidebar
        user={user}
        gamificationEnabled={gamificationEnabled}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(prev => !prev)}
      />
      <TabBar user={user} gamificationEnabled={gamificationEnabled} />

      <main style={{ marginLeft: sidebarCollapsed ? 60 : 240, flex: 1, padding: '28px 36px', maxWidth: 1320, backgroundColor: 'var(--warm-bg)', transition: 'margin-left 0.3s ease' }} className={`main-content${user.kidMode ? ' kid-mode' : ''}`}>
        <ChoreTimerBar language={user.language} />
        {hostedAccount && <ConfirmEmailBanner account={hostedAccount} language={user.language} onChanged={loadHostedAccount} />}
        {season && <SeasonStrip season={season} previewing={!!seasonPreview} language={user.language} />}
        <Routes>
          <Route path="/" element={
            <>
              <PageHeader title={focusIsHome ? t('focus.title') : t('nav.home')} subtitle={today} homeDate={focusIsHome ? undefined : todayShort} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              {/* Today shows the countdown as a chip (ENH-26) */}
              {season && focusIsHome && <SeasonGreeting season={season} language={user.language} />}
              {focusIsHome && focusPage(() => navigate('/?all=1'), t('focus.fullHome'))}
              {dashboardData && !focusIsHome && (
                <Dashboard
                  data={dashboardData}
                  allRooms={activeRooms}
                  seasonCostume={season?.costume}
                  season={season}
                  family={family}
                  users={familySettings}
                  language={user.language}
                  gamificationEnabled={gamificationEnabled}
                  leaderboardPeriod={leaderboardPeriod}
                  onCompleteTask={handleCompleteTask}
                  onRefresh={loadDashboard}
                  onCoinsChanged={refreshUser}
                  onNavigateToRoom={(id) => navigate(`/rooms/${id}`)}
                  onOpenTask={(roomId, taskId) => navigate(`/rooms/${roomId}?task=${taskId}`)}
                  coinsByEffort={coinsByEffort}
                  onNavigateToActivity={() => navigate('/activity')}
                  onNavigateToRewards={() => navigate('/rewards')}
                  onNavigateToRooms={() => navigate('/rooms')}
                  onNavigateToTasks={(criticalOnly) => navigate(`/tasks?person=all${criticalOnly ? '&status=critical' : ''}`)}
                  onOpenFocus={() => navigate('/focus')}
                  onRewardRequestAction={async (id, status, note) => {
                    await api.updateRedemptionStatus(id, status, note);
                    await Promise.all([loadDashboard(), loadRewards()]);
                  }}
                />
              )}
            </>
          } />

          <Route path="/rooms" element={
            <>
              <PageHeader title={t('nav.rooms')} subtitle={`${rooms.length} ${t('app.roomsConfigured')}`} addLabel={user.role === 'admin' ? t('rooms.addRoom') : undefined} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <RoomsList rooms={activeRooms} language={user.language} onSelectRoom={(id) => navigate(`/rooms/${id}`)}
                onOpenTask={(roomId, taskId) => navigate(`/rooms/${roomId}?task=${taskId}`)}
                isAdmin={user.role === 'admin'}
                users={familySettings}
                onCreateRoom={async (data) => {
                  await api.createRoom({ name: data.name, roomType: data.roomType, color: data.color, accentColor: data.accentColor, tasks: data.tasks, assignedUserId: data.assignedUserId });
                  void refreshRooms();
                }}
                onDeleteRoom={async (roomId) => {
                  await api.deleteRoom(roomId);
                  void refreshRooms();
                }}
                onAssignRoom={async (roomId, assignedUserId, force) => {
                  await api.updateRoom(roomId, { assignedUserId, ...(force ? { force: true } : {}) });
                  void refreshRooms();
                }}
                onRenameRoom={async (roomId, name) => {
                  await api.updateRoom(roomId, { name });
                  void refreshRooms();
                }}
                onRoomsChanged={refreshRooms}
                viewer={user}
              />
            </>
          } />

          <Route path="/rooms/:id" element={
            <RoomDetailWrapper rooms={rooms} roomsLoaded={roomsLoaded} strictMode={!!dashboardData?.strictMode} shieldsOn={!!dashboardData?.shields} allowOneTime={dashboardData?.features?.todos !== false} allowPhotos={dashboardData?.features?.proofPhotos !== false} allowPins={dashboardData?.features?.usual !== false} user={user} users={familySettings} coinsByEffort={coinsByEffort} gamificationEnabled={gamificationEnabled} onCompleteTask={handleCompleteTask} onRefresh={() => { refreshRooms(); loadDashboard(); }} onAchievementsUnlocked={setUnlockedAchievements} />
          } />

          <Route path="/focus" element={
            <>
              <PageHeader title={t('focus.title')} subtitle={today} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              {focusData ? focusPage(() => navigate('/'), t('focus.backHome')) : dashboardData && <Navigate to="/" replace />}
            </>
          } />

          <Route path="/tasks" element={
            <>
              <PageHeader title={t('nav.tasks')} subtitle={t('app.tasksSubtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <TaskList
                rooms={activeRooms}
                users={familySettings}
                currentUserId={user.id}
                coinsByEffort={coinsByEffort}
                language={user.language}
                gamificationEnabled={gamificationEnabled}
                loading={!roomsLoaded}
                taskView={user.taskView}
                kidMode={user.kidMode}
                isAdmin={user.role === 'admin'}
                onRefresh={() => { refreshRooms(); loadDashboard(); }}
                onOpenTask={(roomId, taskId) => navigate(`/rooms/${roomId}?task=${taskId}`)}
              />
            </>
          } />

          <Route path="/calendar" element={
            <>
              <PageHeader title={t('nav.calendar')} subtitle={t('app.calendarSubtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <Calendar tasks={allTasks} viewer={user} language={user.language} onOpenTask={(roomId, taskId) => navigate(`/rooms/${roomId}?task=${taskId}`)} />
            </>
          } />

          <Route path="/leaderboard" element={
            gamificationEnabled ? (
            <>
              <PageHeader title={t('app.leaderboardTitle')} subtitle={t('app.leaderboardSubtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <Leaderboard language={user.language} />
            </>
            ) : <Navigate to="/" replace />
          } />

          <Route path="/activity" element={
            <>
              <PageHeader title={t('nav.activity')} subtitle={t('app.activitySubtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <History language={user.language} isAdmin={user.role === 'admin'} users={familySettings} rooms={rooms} userId={user.id} mascotName={dashboardData?.mascot?.name} />
            </>
          } />
          <Route path="/history" element={
            <>
              <PageHeader title={t('nav.activity')} subtitle={t('app.activitySubtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <History language={user.language} isAdmin={user.role === 'admin'} users={familySettings} rooms={rooms} userId={user.id} mascotName={dashboardData?.mascot?.name} />
            </>
          } />

          <Route path="/insights" element={user.role !== 'admin' ? <Navigate to="/" replace /> : (
            <>
              <PageHeader title={t('nav.insights')} subtitle={t('insights.subtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <Insights language={user.language} gamificationEnabled={gamificationEnabled} />
            </>
          )} />

          <Route path="/more" element={
            <>
              <PageHeader title={t('nav.more')} subtitle="" user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <More user={user} gamificationEnabled={gamificationEnabled} />
            </>
          } />

          <Route path="/profile" element={
            <>
              <PageHeader title={t('nav.profile')} subtitle={t('app.profileSubtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <Profile user={user} theme={theme} onChangeTheme={changeTheme} onUnlocksChanged={() => { void loadDashboard(); }} onSave={async () => { await refreshUser(); }} onLogout={() => { logout(); navigate('/login', { replace: true }); }} />
            </>
          } />

          <Route path="/guide" element={
            <>
              <PageHeader title={t('guide.title')} subtitle={t('guide.subtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <Guide language={user.language} />
            </>
          } />
          <Route path="/settings/:section?" element={
            <>
              <PageHeader title={t('nav.settings')} subtitle={t('app.settingsSubtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <Settings
                user={user}
                family={familySettings}
                gamificationEnabled={gamificationEnabled}
                onGamificationChange={setGamificationEnabled}
                vacationConfig={vacationConfig ?? undefined}
                onUpdateVacation={async (data) => {
                  vacationUpdatePending.current = true;
                  try {
                    const updated = await api.updateVacationConfig(data);
                    setVacationConfig(updated);
                  } finally {
                    vacationUpdatePending.current = false;
                  }
                }}
                onWeekStartChange={async (weekStart) => { await api.updateWeekStart(weekStart); await loadDashboard(); }}
                timeZone={dashboardData?.timeZone ? { zone: dashboardData.timeZone, set: !!dashboardData.timeZoneSet } : undefined}
                onTimeZoneChange={async (timeZone) => { await api.updateTimeZone(timeZone); await loadDashboard(); }}
                shields={dashboardData?.shields ?? null}
                onGiveShield={async (targetUserId) => {
                  await api.giveShield(targetUserId);
                  setFamilySettings(await api.getUsers());
                }}
                onUpdateRole={async (targetUserId, role) => {
                  await api.updateUserRole(targetUserId, role);
                  setFamilySettings(await api.getUsers());
                  await refreshUser();
                }}
                onAddMember={async (member) => {
                  await api.createUser(member);
                  setFamilySettings(await api.getUsers());
                }}
                onSetMemberLogin={async (targetUserId, data) => {
                  await api.setUserLogin(targetUserId, data);
                  setFamilySettings(await api.getUsers());
                }}
                onDeleteUser={async (targetUserId) => {
                  await api.deleteUser(targetUserId);
                  setFamilySettings(await api.getUsers());
                  await refreshUser();
                  await loadDashboard();
                }}
                onUpdateMemberProfile={async (memberUserId, profile) => {
                  await api.updateProfile(memberUserId, profile);
                  setFamilySettings(await api.getUsers());
                  if (memberUserId === user.id) {
                    await refreshUser();
                  }
                }}
                onChangePassword={async (targetUserId, payload) => {
                  await api.updatePassword(targetUserId, payload);
                }}
                coinsByEffort={coinsByEffort}
                onSaveCoinsByEffort={async (values) => {
                  const updated = await api.updateCoinsConfig({ coinsByEffort: values });
                  setCoinsByEffort(updated.coinsByEffort);
                }}
                onResetCoinsByEffort={async () => {
                  const updated = await api.updateCoinsConfig({ useDefault: true });
                  setCoinsByEffort(updated.coinsByEffort);
                }}
                onExport={handleExport}
                onImport={handleImport}
                hostedAccount={hostedAccount}
                onHostedChanged={loadHostedAccount}
                rooms={rooms}
                onDataChanged={() => { refreshRooms(); loadDashboard(); }}
                onAdjustCoins={async (userId: number, amount: number, reason?: string) => {
                  await api.adjustCoins(userId, amount, reason);
                  setFamilySettings(await api.getUsers());
                }}
              />
            </>
          } />
          <Route path="/setup" element={user.role !== 'admin' ? <Navigate to="/" replace /> : (
            <>
              <PageHeader title={t('setup.title')} subtitle={t('setup.subtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <SetupWizard user={user} onSaved={() => Promise.all([loadDashboard(), loadRewards()])} onExit={() => { loadDashboard(); navigate('/', { replace: true }); }} onOpenGuide={() => navigate('/guide', { replace: true })} />
            </>
          )} />
          <Route path="/achievements" element={
            gamificationEnabled ? (
            <>
              <PageHeader title={t('nav.achievements')} subtitle={t('app.achievementsSubtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <Achievements data={achievementsData} language={user.language} />
            </>
            ) : <Navigate to="/" replace />
          } />
          <Route path="/rewards" element={
            gamificationEnabled ? (
            <>
              <PageHeader title={t('nav.rewards')} subtitle={t('app.rewardsSubtitle')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} onPointsClick={handlePointsClick} userPoints={myPoints} pointsPeriodLabel={pointsPeriodLabel} gamificationEnabled={gamificationEnabled} shieldsOn={!!dashboardData?.shields} />
              <Rewards
                key={location.search}
                language={user.language}
                rewards={rewardsData.rewards}
                mine={rewardsData.mine}
                userCoins={user.coins}
                isAdmin={user.role === 'admin'}
                people={user.role === 'admin' ? familySettings.filter((u) => u.id !== user.id) : undefined}
                onBoughtFor={() => void loadDashboard()}
                pendingRequests={dashboardData?.pendingRewardRequests}
                onRewardRequestAction={async (id, status, note) => {
                  try {
                    await api.updateRedemptionStatus(id, status, note);
                  } finally {
                    // Also when it failed: the other parent may have decided it already, so the list is out of date
                    await Promise.all([loadDashboard(), loadRewards()]);
                  }
                }}
                onRedeem={async (rewardId: number, costCoins: number) => {
                  try {
                    await api.redeemReward(rewardId, { costCoins });
                  } catch (err) {
                    // A parent changed the price since this page loaded: fetch it so the box shows the new one
                    if ((err as { body?: { error?: string } }).body?.error === 'price_changed') await loadRewards();
                    throw err;
                  }
                  await refreshUser();
                  await loadDashboard();
                  await loadRewards();
                }}
                onContribute={async (rewardId: number, amount: number) => {
                  await api.contributeReward(rewardId, amount);
                  await refreshUser();
                  await loadDashboard();
                  await loadRewards();
                }}
                onCancel={async (redemptionId: number) => {
                  await api.cancelRedemption(redemptionId);
                  await refreshUser();
                  await loadDashboard();
                  await loadRewards();
                }}
              />
            </>
            ) : <Navigate to="/" replace />
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
    </ChoreTimerProvider>
    </WeekStartContext.Provider>
    </CosmeticsContext.Provider>
    </SearchContext.Provider>
  );
}

function RoomDetailWrapper({ rooms, roomsLoaded, strictMode, shieldsOn, allowOneTime, allowPhotos, allowPins, user, users, coinsByEffort, gamificationEnabled, onCompleteTask, onRefresh, onAchievementsUnlocked }: { rooms: any[]; roomsLoaded: boolean; strictMode?: boolean; shieldsOn?: boolean; allowOneTime?: boolean; allowPhotos?: boolean; allowPins?: boolean; user: any; users?: any[]; coinsByEffort: Record<number, number>; gamificationEnabled: boolean; onCompleteTask: (id: number, proof?: Proof) => void; onRefresh: () => void; onAchievementsUnlocked?: (ids: string[]) => void }) {
  const navigate = useNavigate();
  const { t, roomDisplayName } = useTranslation(user?.language || 'en');
  const { id: idParam } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const focusTaskId = Number(searchParams.get('task')) || undefined;
  const id = parseInt(idParam || '0');
  const room = rooms.find((r) => r.id === id);

  if (!room && !roomsLoaded) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#B0A090', fontWeight: 600 }}>{t('common.loading')}</div>;
  }
  if (!room) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#B0A090', fontWeight: 600 }}>
        {t('rooms.roomNotFound')}
        <button onClick={() => navigate('/rooms')} className="tq-btn tq-btn-secondary"
          style={{ padding: '8px 18px', fontSize: 13, marginLeft: 10 }}>
          {t('rooms.backToRooms')}
        </button>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={roomDisplayName(room.name, room.roomType)} subtitle={room.isTodoRoom ? t('todos.countLine').replace('{n}', String(room.todoCount ?? 0)) : `${room.tasks?.length || 0} ${t('rooms.tasksTracked')}`} addLabel={user?.role === 'admin' ? t(room.isTodoRoom ? 'todos.add' : 'roomDetail.addTask') : undefined} onBack={() => navigate('/rooms', { state: { fromRoom: room.id } })} backLabel={t('rooms.backToRooms')} user={user} onCoinsClick={() => navigate('/rewards')} onStreakClick={() => navigate('/achievements')} gamificationEnabled={gamificationEnabled} shieldsOn={shieldsOn} />
      <RoomDetail room={room} language={user?.language} isAdmin={user?.role === 'admin'} currentUserId={user?.id} currentUserRole={user?.role} users={users} coinsByEffort={coinsByEffort} onCompleteTask={onCompleteTask} onOpenRoom={(id) => navigate(`/rooms/${id}`)} allowOneTime={allowOneTime} allowPhotos={allowPhotos} allowPins={allowPins} focusTaskId={focusTaskId} strictMode={strictMode} onlyMine={user?.taskView === 'mineOnly' || !!user?.kidMode} onRefresh={onRefresh} onAchievementsUnlocked={onAchievementsUnlocked} />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
