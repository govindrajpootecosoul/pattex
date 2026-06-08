import { useEffect, useMemo, useState } from 'react';
import { dashboardApi } from '../api/api';
import { useSalesChannelsContext } from '../context/SalesChannelsContext.jsx';

function normalizeChannel(v) {
  return String(v ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Resolve latest snapshot date from the backend before fetching day-scoped data.
 * Avoids an extra inventory/buybox call with a wrong default date.
 */
export function useDatasetDateAnchor({ dataset, channel, channelOptionsExtra = [] }) {
  const { options: allSalesChannels, ready: channelsReady } = useSalesChannelsContext();
  const [selectedDate, setSelectedDate] = useState(null);
  const [latestUpdatedAtByChannel, setLatestUpdatedAtByChannel] = useState(null);
  const [dateReady, setDateReady] = useState(false);

  const channelOptions = useMemo(() => {
    if (allSalesChannels.length > 0) return allSalesChannels;
    return Array.isArray(channelOptionsExtra) ? channelOptionsExtra : [];
  }, [allSalesChannels, channelOptionsExtra]);

  const channelForLatestDate = useMemo(() => {
    const ch = String(channel || '').trim();
    if (!ch || channelOptions.length === 0) return '';
    const has = channelOptions.some((opt) => normalizeChannel(opt) === normalizeChannel(ch));
    return has ? ch : '';
  }, [channel, channelOptions]);

  useEffect(() => {
    if (!channelsReady) return undefined;
    let cancelled = false;
    setDateReady(false);
    dashboardApi
      .getLatestUpdatedDate({ dataset, salesChannel: channelForLatestDate })
      .then((resp) => {
        if (cancelled) return;
        setLatestUpdatedAtByChannel(resp?.updatedAt ?? null);
        const dateKey = resp?.dateKey ? String(resp.dateKey).slice(0, 10) : '';
        setSelectedDate(dateKey || new Date().toISOString().split('T')[0]);
      })
      .catch(() => {
        if (cancelled) return;
        setLatestUpdatedAtByChannel(null);
        setSelectedDate(new Date().toISOString().split('T')[0]);
      })
      .finally(() => {
        if (!cancelled) setDateReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dataset, channelForLatestDate, channelsReady]);

  return {
    selectedDate,
    setSelectedDate,
    latestUpdatedAtByChannel,
    dateReady,
    channelOptions,
    allSalesChannels,
    channelsReady,
  };
}
