import { useEffect, useMemo, useState } from 'react';
import { dashboardApi } from '../api/api';

/**
 * Fetches an unfiltered, stable list of Sales Channels for dropdowns.
 * Keeps the list stable across screen filters so options never disappear.
 */
export function useSalesChannels() {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    dashboardApi
      .getSalesChannels()
      .then((resp) => {
        if (cancelled) return;
        const list = Array.isArray(resp?.options) ? resp.options : [];
        setOptions(list);
      })
      .catch(() => {
        if (cancelled) return;
        // Keep whatever we already have
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => (Array.isArray(options) ? options : []), [options]);
}

