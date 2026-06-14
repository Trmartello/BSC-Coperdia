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
  setRealized: (id: string, data: { period: string; value: number }) =>
    api.post(`/indicators/${id}/realized`, data),
  setGoal: (id: string, data: { period: string; value: number }) =>
    api.post(`/indicators/${id}/goal`, data),
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

// ─── Action Plans ─────────────────────────────────────────────────────────────
export const actionPlansApi = {
  list: (params?: { indicatorId?: string; standalone?: boolean }) =>
    api.get('/action-plans', { params }),
  get: (id: string) => api.get(`/action-plans/${id}`),
  dashboard: () => api.get('/action-plans/dashboard'),
  create: (data: { problem: string; description?: string; status?: string; indicatorId?: string }) =>
    api.post('/action-plans', data),
  update: (id: string, data: any) => api.patch(`/action-plans/${id}`, data),
  delete: (id: string) => api.delete(`/action-plans/${id}`),

  createInitiative: (planId: string, data: { title: string; description?: string }) =>
    api.post(`/action-plans/${planId}/initiatives`, data),
  updateInitiative: (id: string, data: any) => api.patch(`/action-plans/initiatives/${id}`, data),
  deleteInitiative: (id: string) => api.delete(`/action-plans/initiatives/${id}`),

  createAction: (initiativeId: string, data: any) =>
    api.post(`/action-plans/initiatives/${initiativeId}/actions`, data),
  updateAction: (id: string, data: any) => api.patch(`/action-plans/actions/${id}`, data),
  deleteAction: (id: string) => api.delete(`/action-plans/actions/${id}`),

  addComment: (planId: string, data: { content: string; progress?: number }) =>
    api.post(`/action-plans/${planId}/comments`, data),
  deleteComment: (planId: string, commentId: string) =>
    api.delete(`/action-plans/${planId}/comments/${commentId}`),

  uploadAttachment: (planId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/action-plans/${planId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  deleteAttachment: (planId: string, attachmentId: string) =>
    api.delete(`/action-plans/${planId}/attachments/${attachmentId}`),
};

// ─── Maps ────────────────────────────────────────────────────────────────────
export const mapsApi = {
  // categories
  getCategories: () => api.get('/maps/categories'),
  createCategory: (data: { name: string; color?: string }) => api.post('/maps/categories', data),
  updateCategory: (id: string, data: any) => api.patch(`/maps/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/maps/categories/${id}`),
  // maps
  list: (categoryId?: string) => api.get('/maps', { params: { categoryId } }),
  get: (id: string) => api.get(`/maps/${id}`),
  create: (data: { name: string; description?: string; categoryId: string }) => api.post('/maps', data),
  update: (id: string, data: any) => api.patch(`/maps/${id}`, data),
  delete: (id: string) => api.delete(`/maps/${id}`),
  saveLayout: (id: string, data: { nodes: any[]; edges: any[] }) => api.post(`/maps/${id}/layout`, data),
  addIndicator: (id: string, indicatorId: string, position?: { x: number; y: number }) =>
    api.post(`/maps/${id}/indicators`, { indicatorId, position }),
  removeIndicator: (id: string, indicatorId: string) =>
    api.delete(`/maps/${id}/indicators/${indicatorId}`),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersApi = {
  list: () => api.get('/users'),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  remove: (id: string) => api.delete(`/users/${id}`),
  toggleActive: (id: string) => api.patch(`/users/${id}/toggle-active`),
};

// ─── Settings ────────────────────────────────────────────────────────────────
export const settingsApi = {
  getSystem: () => api.get('/settings'),
  getFlags: () => api.get('/settings/flags'),
  setFlag: (key: string, value: any) => api.patch('/settings/flags', { key, value }),
  getIndicators: () => api.get('/settings/indicators'),
  createIndicator: (data: any) => api.post('/settings/indicators', data),
  updateIndicator: (id: string, data: any) => api.patch(`/settings/indicators/${id}`, data),
  deleteIndicator: (id: string) => api.delete(`/settings/indicators/${id}`),
  getMaps: () => api.get('/settings/maps'),
  getCategories: () => api.get('/settings/categories'),
  createCategory: (data: any) => api.post('/settings/categories', data),
  updateCategory: (id: string, data: any) => api.patch(`/settings/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/settings/categories/${id}`),
};

// ─── Formulas ────────────────────────────────────────────────────────────────
export const formulasApi = {
  get: (indicatorId: string) => api.get(`/formulas/${indicatorId}`),
  create: (data: { indicatorId: string; expression: string; variables: Record<string, string>; description?: string }) =>
    api.post('/formulas', data),
  validate: (data: { expression: string; variables: Record<string, string> }) =>
    api.post('/formulas/validate', data),
  remove: (indicatorId: string) => api.delete(`/formulas/${indicatorId}`),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  executive: (period: string, scenarioId?: string) =>
    api.get('/dashboard/executive', { params: { period, scenarioId } }),
  auditLog: (limit?: number) =>
    api.get('/dashboard/audit-log', { params: { limit } }),
};
