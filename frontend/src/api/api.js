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
  getRevenue: () => request('/dashboard/revenue'),
  getInventory: () => request('/dashboard/inventory'),
  getBuybox: () => request('/dashboard/buybox'),
  getMarketing: () => request('/dashboard/marketing'),
  getProductDetails: () => request('/dashboard/product-details'),
};
