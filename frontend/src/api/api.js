import { isCancelledError } from '@tanstack/react-query';
import { queryClient } from '../queryClient.js';

function normalizeBaseUrl(raw) {
  if (!raw) return '';
  // Remove trailing slashes so we can safely do `${base}${path}`
  return String(raw).trim().replace(/\/+$/, '');
}

// Configure once via Vite env:
// - Local dev (recommended): leave unset and use Vite proxy for `/api`
// - Production: set `VITE_API_BASE_URL=https://dashbackend.thrivebrands.ai/api`
const API_BASE = normalizeBaseUrl(import.meta.env?.VITE_API_BASE_URL) || '/api';

function isNetworkError(err) {
  const msg = (err && err.message) || '';
  return (
    err?.name === 'TypeError' ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET')
  );
}

async function request(path, options = {}) {
  const token = localStorage.getItem('pattex_token');
  const method = String(options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const doFetch = async (signal) => {
    let res;
    const fetchInit = {
      ...options,
      headers,
      // Critical for auth: browsers may reuse cached GET bodies for the same URL
      // across different Authorization headers, which breaks user switching.
      cache: 'no-store',
    };
    if (signal) {
      fetchInit.signal = signal;
    }
    try {
      res = await fetch(`${API_BASE}${path}`, fetchInit);
    } catch (err) {
      if (isCancelledError(err) || err?.name === 'AbortError') {
        throw err;
      }
      if (isNetworkError(err)) {
        throw new Error('Cannot reach server. Start the backend with: cd backend && npm run dev');
      }
      throw err;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || res.statusText || 'Request failed');
    return data;
  };

  // Cache/dedupe only GET requests. Server-side caching handles heavy aggregation,
  // while React Query avoids duplicate client requests between renders.
  if (method === 'GET') {
    const queryKey = ['api:GET', path, token || ''];
    return queryClient.fetchQuery({
      queryKey,
      queryFn: ({ signal }) => doFetch(signal),
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 0,
    });
  }

  // Non-GET requests are never cached.
  try {
    return await doFetch();
  } catch (err) {
    throw err;
  }
}

export const authApi = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST', body: JSON.stringify({}) }),
  signup: (body) => request('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  getUsersByDatabase: () => request('/auth/users', { method: 'GET' }),
  updateUser: (id, body) => request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteUser: (id) => request(`/auth/users/${id}`, { method: 'DELETE' }),
};

export const dashboardApi = {
  getSalesChannels: () => request('/dashboard/sales-channels'),
  getExecutiveSummary: (params) => {
    const q = new URLSearchParams();
    if (params?.salesChannel) q.set('salesChannel', params.salesChannel);
    if (params?.dateFilterType) q.set('dateFilterType', params.dateFilterType);
    if (params?.customRangeStart) q.set('customRangeStart', params.customRangeStart);
    if (params?.customRangeEnd) q.set('customRangeEnd', params.customRangeEnd);
    const query = q.toString();
    return request(`/dashboard/executive-summary${query ? `?${query}` : ''}`);
  },
  getKeyPerformanceMetrics: (params) => {
    const q = new URLSearchParams();
    if (params?.salesChannel) q.set('salesChannel', params.salesChannel);
    const query = q.toString();
    return request(`/dashboard/key-performance-metrics${query ? `?${query}` : ''}`);
  },
  getLatestUpdatedDate: (params) => {
    const q = new URLSearchParams();
    if (params?.dataset) q.set('dataset', params.dataset);
    if (params?.salesChannel) q.set('salesChannel', params.salesChannel);
    const query = q.toString();
    return request(`/dashboard/latest-updated-date${query ? `?${query}` : ''}`);
  },
  getRevenue: (params) => {
    const q = new URLSearchParams();
    if (params?.dateFilterType) q.set('dateFilterType', params.dateFilterType);
    if (params?.customRangeStart) q.set('customRangeStart', params.customRangeStart);
    if (params?.customRangeEnd) q.set('customRangeEnd', params.customRangeEnd);
    if (params?.salesChannel) q.set('salesChannel', params.salesChannel);
    if (params?.includePeriods) q.set('includePeriods', '1');
    const query = q.toString();
    return request(`/dashboard/revenue${query ? `?${query}` : ''}`);
  },
  getInventory: (params) => {
    const q = new URLSearchParams();
    if (params?.dateFilterType) q.set('dateFilterType', params.dateFilterType);
    if (params?.customRangeStart) q.set('customRangeStart', params.customRangeStart);
    if (params?.customRangeEnd) q.set('customRangeEnd', params.customRangeEnd);
    if (params?.salesChannel) q.set('salesChannel', params.salesChannel);
    const query = q.toString();
    return request(`/dashboard/inventory${query ? `?${query}` : ''}`);
  },
  getBuybox: (params) => {
    const q = new URLSearchParams();
    if (params?.dateFilterType) q.set('dateFilterType', params.dateFilterType);
    if (params?.customRangeStart) q.set('customRangeStart', params.customRangeStart);
    if (params?.customRangeEnd) q.set('customRangeEnd', params.customRangeEnd);
    if (params?.salesChannel) q.set('salesChannel', params.salesChannel);
    const query = q.toString();
    return request(`/dashboard/buybox${query ? `?${query}` : ''}`);
  },
  getBuyboxLast30Sales: (params) => {
    const q = new URLSearchParams();
    if (params?.customRangeStart) q.set('customRangeStart', params.customRangeStart);
    if (params?.customRangeEnd) q.set('customRangeEnd', params.customRangeEnd);
    if (params?.salesChannel) q.set('salesChannel', params.salesChannel);
    const query = q.toString();
    return request(`/dashboard/buybox-last30-sales${query ? `?${query}` : ''}`);
  },
  getMarketing: (params) => {
    const q = new URLSearchParams();
    if (params?.dateFilterType) q.set('dateFilterType', params.dateFilterType);
    if (params?.customRangeStart) q.set('customRangeStart', params.customRangeStart);
    if (params?.customRangeEnd) q.set('customRangeEnd', params.customRangeEnd);
    if (params?.asin) q.set('asin', params.asin);
    if (params?.productName) q.set('productName', params.productName);
    if (params?.productCategory) q.set('productCategory', params.productCategory);
    if (params?.packSize) q.set('packSize', params.packSize);
    if (params?.salesChannel) q.set('salesChannel', params.salesChannel);
    // Campaign-level filters for Detailed Campaign Level Marketing View
    if (params?.campaignDateRange) q.set('campaignDateRange', params.campaignDateRange);
    if (params?.campaignType) q.set('campaignType', params.campaignType);
    if (params?.campaignName) q.set('campaignName', params.campaignName);
    if (params?.campaignPortfolio) q.set('campaignPortfolio', params.campaignPortfolio);
    if (params?.campaignSalesChannel) q.set('campaignSalesChannel', params.campaignSalesChannel);
    const query = q.toString();
    return request(`/dashboard/marketing${query ? `?${query}` : ''}`);
  },
  getProductDetails: () => request('/dashboard/product-details'),
};
