const API_BASE = '/api';

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
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    if (isNetworkError(err)) {
      throw new Error('Cannot reach server. Start the backend with: cd backend && npm run dev');
    }
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText || 'Request failed');
  return data;
}

export const authApi = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (body) => request('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
};

export const dashboardApi = {
  getExecutiveSummary: () => request('/dashboard/executive-summary'),
  getRevenue: (params) => {
    const q = new URLSearchParams();
    if (params?.dateFilterType) q.set('dateFilterType', params.dateFilterType);
    if (params?.customRangeStart) q.set('customRangeStart', params.customRangeStart);
    if (params?.customRangeEnd) q.set('customRangeEnd', params.customRangeEnd);
    if (params?.includePeriods) q.set('includePeriods', '1');
    const query = q.toString();
    return request(`/dashboard/revenue${query ? `?${query}` : ''}`);
  },
  getInventory: (params) => {
    const q = new URLSearchParams();
    if (params?.dateFilterType) q.set('dateFilterType', params.dateFilterType);
    if (params?.customRangeStart) q.set('customRangeStart', params.customRangeStart);
    if (params?.customRangeEnd) q.set('customRangeEnd', params.customRangeEnd);
    const query = q.toString();
    return request(`/dashboard/inventory${query ? `?${query}` : ''}`);
  },
  getBuybox: (params) => {
    const q = new URLSearchParams();
    if (params?.dateFilterType) q.set('dateFilterType', params.dateFilterType);
    if (params?.customRangeStart) q.set('customRangeStart', params.customRangeStart);
    if (params?.customRangeEnd) q.set('customRangeEnd', params.customRangeEnd);
    const query = q.toString();
    return request(`/dashboard/buybox${query ? `?${query}` : ''}`);
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
