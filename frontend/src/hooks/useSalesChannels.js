import { useMemo } from 'react';
import { useSalesChannelsContext } from '../context/SalesChannelsContext.jsx';

/** Shared sales-channel list (loaded once in Dashboard via SalesChannelsProvider). */
export function useSalesChannels() {
  const { options } = useSalesChannelsContext();
  return useMemo(() => (Array.isArray(options) ? options : []), [options]);
}

export function useSalesChannelsReady() {
  const { ready } = useSalesChannelsContext();
  return ready;
}
