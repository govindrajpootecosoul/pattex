import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../api/api';
import { queryClient } from '../queryClient.js';
import { PATTEX_UI_STORAGE_KEYS } from '../constants/logoutStorageKeys.js';

const AuthContext = createContext(null);

const TOKEN_KEY = 'pattex_token';
const USER_KEY = 'pattex_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const saved = localStorage.getItem(USER_KEY);
    if (token && saved) {
      try {
        setUser(JSON.parse(saved));
      } catch (_) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = (userData, token) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setUser(userData);
  };

  const signup = (userData, token) => {
    login(userData, token);
  };

  const logout = async () => {
    // Cancel in-flight GETs first so nothing repopulates React Query after clear().
    // Then clear cache before server logout so we are not blocked on Redis SCAN while stale data could win races.
    await queryClient.cancelQueries();
    queryClient.clear();
    try {
      if (localStorage.getItem(TOKEN_KEY)) {
        await authApi.logout();
      }
    } catch (_) {
      // Still clear client state if the server is down or the token expired.
    }
    for (const key of PATTEX_UI_STORAGE_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch (_) {
        /* ignore quota / private mode */
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  const getToken = () => localStorage.getItem(TOKEN_KEY);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
