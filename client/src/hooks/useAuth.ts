import { useState, useEffect, useCallback } from 'react';
import { api, forgetPhotos, forgetPush, type LoginDetails } from './useApi';
import { deviceZone } from '../utils/clock';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: 'admin' | 'member' | 'child';
  avatarColor: string;
  avatarType: 'letter' | 'preset' | 'photo';
  avatarPreset: string | null;
  avatarPhotoUrl: string | null;
  coins: number;
  currentStreak: number;
  streakShields?: number;
  points: number;
  isVacationMode: boolean;
  language: string;
  /** Set by a parent: 'all' | 'mine' (starts on Mine) | 'mineOnly' (locked) */
  taskView?: 'all' | 'mine' | 'mineOnly';
  kidMode?: number | boolean;
  /** Home's card order and hidden cards (ENH-6); null = the default */
  homeLayout?: { order: string[]; hidden: string[] } | null;
  /** Their color theme (follows them to every device); null = the device's */
  theme?: string | null;
  /** 0 = keep their own theme's colors during holidays */
  holidayColors?: number;
  /** 'MM-DD' */
  birthday?: string | null;
}

/** This device signs out: push stops here, and the token and the photos cookie go. */
function forget(): void {
  forgetPush();
  localStorage.removeItem('tidyquest_token');
  forgetPhotos();
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  // Only a saved token needs checking; with none, the login page shows straight away
  const [loading, setLoading] = useState(() => !!localStorage.getItem('tidyquest_token'));

  // The server couldn't be reached when the app opened (a restart, no Wi-Fi): still signed in, trying again
  const [startFailed, setStartFailed] = useState(false);

  const check = useCallback(() => api.me().then((userData) => {
    setUser(userData);
    setStartFailed(false);
  }).catch((err: { status?: number }) => {
    // Only a real "you're signed out" ends the login: apiFetch has already handled a 401, and a 404 is a
    // person who was removed. Anything else (a 502 while the server restarts, no network, a 500) keeps the
    // login and this phone's notifications, and the app tries again (BUG-34).
    if (err?.status === 404) {
      forget();
      setStartFailed(false);
    } else if (localStorage.getItem('tidyquest_token')) {
      setStartFailed(true);
    }
  }).finally(() => setLoading(false)), []);

  useEffect(() => {
    if (localStorage.getItem('tidyquest_token')) void check();
  }, [check]);

  useEffect(() => {
    if (!startFailed) return;
    const timer = setInterval(() => void check(), 5000);
    window.addEventListener('online', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', check);
    };
  }, [startFailed, check]);

  const login = async (details: LoginDetails) => {
    const { token, user: userData } = await api.login(details);
    signIn(token, userData);
  };

  /** Signed in by a sign-up or a password reset link */
  const signIn = (token: string, userData: User) => {
    localStorage.setItem('tidyquest_token', token);
    setUser(userData);
  };

  const register = async (data: { username: string; password: string; displayName: string; avatarColor?: string; language?: string }) => {
    // A new install's first parent sets the family's time zone from this device (Settings → General changes it)
    const { token, user: userData } = await api.register({ ...data, timeZone: deviceZone() });
    localStorage.setItem('tidyquest_token', token);
    setUser(userData);
  };

  const logout = () => {
    forget();
    setStartFailed(false);
    setUser(null);
  };

  const refreshUser = useCallback(async () => {
    try {
      const userData = await api.me();
      // Guard: don't restore session if user logged out during the in-flight request
      if (localStorage.getItem('tidyquest_token')) {
        // Asked every 15 seconds (BUG-36): the same person object when nothing changed, so nothing redraws
        setUser((prev) => (prev && JSON.stringify(prev) === JSON.stringify(userData) ? prev : userData));
      }
    } catch { /* ignore */ }
  }, []);

  return { user, loading, startFailed, retryStart: check, login, signIn, register, logout, refreshUser };
}
