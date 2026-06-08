import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { dashboardApi } from '../api/api';
import { useAuth } from './AuthContext';

const SalesChannelsContext = createContext(null);

/** Loads sales channels once per dashboard session (shared across all sections). */
export function SalesChannelsProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [options, setOptions] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (authLoading || !user) {
      setOptions([]);
      setReady(false);
      return undefined;
    }

    let cancelled = false;
    setReady(false);
    dashboardApi
      .getSalesChannels()
      .then((resp) => {
        if (cancelled) return;
        const list = Array.isArray(resp?.options) ? resp.options : [];
        setOptions(list);
      })
      .catch(() => {
        if (cancelled) return;
        setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const value = useMemo(() => ({ options, ready }), [options, ready]);

  return <SalesChannelsContext.Provider value={value}>{children}</SalesChannelsContext.Provider>;
}

export function useSalesChannelsContext() {
  const ctx = useContext(SalesChannelsContext);
  if (!ctx) {
    throw new Error('useSalesChannels must be used within SalesChannelsProvider');
  }
  return ctx;
}
