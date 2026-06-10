import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  },
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ accessToken: string; user: any }>('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    api.post('/auth/register', { name, email, password }),
};

// ─── Indicators ──────────────────────────────────────────────────────────────
export const indicatorsApi = {
  list: () => api.get('/indicators'),
  get: (id: string) => api.get(`/indicators/${id}`),
  tree: (rootId?: string) => api.get('/indicators/tree', { params: { rootId } }),
  impactChain: (id: string) => api.get(`/indicators/${id}/impact-chain`),
  updateForecast: (data: { indicatorId: string; scenarioId: string; period: string; value: number }) =>
    api.patch('/indicators/forecast', data),
};

// ─── Scenarios ────────────────────────────────────────────────────────────────
export const scenariosApi = {
  list: () => api.get('/scenarios'),
  get: (id: string) => api.get(`/scenarios/${id}`),
  create: (data: { name: string; description?: string; period: string }) =>
    api.post('/scenarios', data),
  recalculate: (id: string) => api.post(`/scenarios/${id}/recalculate`),
  compare: (base: string, compare: string) =>
    api.get('/scenarios/compare', { params: { base, compare } }),
  impactMap: (id: string) => api.get(`/scenarios/${id}/impact-map`),
  archive: (id: string) => api.patch(`/scenarios/${id}/archive`),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  executive: (period: string, scenarioId?: string) =>
    api.get('/dashboard/executive', { params: { period, scenarioId } }),
  auditLog: (limit?: number) =>
    api.get('/dashboard/audit-log', { params: { limit } }),
};
