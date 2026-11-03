import { useState, useEffect } from 'react';
import { api, forgetPhotos, type LoginDetails } from './useApi';
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

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  // Only a saved token needs checking; with none, the login page shows straight away
  const [loading, setLoading] = useState(() => !!localStorage.getItem('tidyquest_token'));

  useEffect(() => {
    if (!localStorage.getItem('tidyquest_token')) return;
    api.me().then(setUser).catch(() => {
      localStorage.removeItem('tidyquest_token');
      forgetPhotos();
    }).finally(() => setLoading(false));
  }, []);

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
    localStorage.removeItem('tidyquest_token');
    forgetPhotos();
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const userData = await api.me();
      // Guard: don't restore session if user logged out during the in-flight request
      if (localStorage.getItem('tidyquest_token')) {
        setUser(userData);
      }
    } catch { /* ignore */ }
  };

  return { user, loading, login, signIn, register, logout, refreshUser };
}
