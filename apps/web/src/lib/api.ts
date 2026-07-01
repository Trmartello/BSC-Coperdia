import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// Monta a URL pública de um arquivo enviado (servido em <host>/uploads, fora do /api/v1)
export function fileUrl(path?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1\/?$/, '');
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

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
  setEstimate: (id: string, data: { period: string; value: number }) =>
    api.post(`/indicators/${id}/estimate`, data),
  downloadTemplate: () =>
    api.get('/indicators/import/template', { responseType: 'blob' }),
  importData: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/indicators/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  importBalancete: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/indicators/import-balancete', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  periods: () => api.get<string[]>('/indicators/periods'),
  addRelation: (parentId: string, childId: string) =>
    api.post('/indicators/relations', { parentId, childId }),
  removeRelation: (parentId: string, childId: string) =>
    api.delete('/indicators/relations', { data: { parentId, childId } }),
};

// ─── Action Plans ─────────────────────────────────────────────────────────────
export const actionPlansApi = {
  list: (params?: {
    indicatorId?: string;
    standalone?: boolean;
    priorities?: string[];
    statuses?: string[];
    ownerOrCreatorIds?: string[];
  }) => {
    const { priorities, statuses, ownerOrCreatorIds, ...rest } = params ?? {};
    return api.get('/action-plans', {
      params: {
        ...rest,
        ...(priorities?.length ? { priorities: priorities.join(',') } : {}),
        ...(statuses?.length ? { statuses: statuses.join(',') } : {}),
        ...(ownerOrCreatorIds?.length ? { ownerOrCreatorIds: ownerOrCreatorIds.join(',') } : {}),
      },
    });
  },
  get: (id: string) => api.get(`/action-plans/${id}`),
  dashboard: () => api.get('/action-plans/dashboard'),
  create: (data: { problem: string; description?: string; status?: string; indicatorId?: string }) =>
    api.post('/action-plans', data),
  ensureForIndicator: (indicatorId: string) =>
    api.post(`/action-plans/indicator/${indicatorId}/ensure`),
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

  // Comentário com anexo opcional — sempre enviado como multipart
  addComment: (planId: string, data: { content?: string; file?: File | null }) => {
    const form = new FormData();
    form.append('content', data.content ?? '');
    if (data.file) form.append('file', data.file);
    return api.post(`/action-plans/${planId}/comments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
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
  // structures (containers/pastas)
  getStructures: () => api.get('/maps/structures'),
  getStructure: (id: string) => api.get(`/maps/structures/${id}`),
  createStructure: (data: { name: string; description?: string; category?: string }) =>
    api.post('/maps/structures', data),
  updateStructure: (id: string, data: any) => api.patch(`/maps/structures/${id}`, data),
  deleteStructure: (id: string, deleteMaps?: boolean) =>
    api.delete(`/maps/structures/${id}`, { params: deleteMaps ? { deleteMaps: 'true' } : {} }),
  // categories
  getCategories: () => api.get('/maps/categories'),
  createCategory: (data: { name: string; color?: string }) => api.post('/maps/categories', data),
  updateCategory: (id: string, data: any) => api.patch(`/maps/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/maps/categories/${id}`),
  // maps
  list: (params?: { categoryId?: string; structureId?: string }) => api.get('/maps', { params }),
  get: (id: string, period?: string, accumulated?: boolean) =>
    api.get(`/maps/${id}`, { params: { ...(period ? { period } : {}), ...(accumulated ? { accumulated: 'true' } : {}) } }),
  create: (data: { name: string; description?: string; categoryId: string; structureId?: string }) => api.post('/maps', data),
  duplicate: (id: string) => api.post(`/maps/${id}/duplicate`),
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
  executive: (period: string, accumulated?: boolean, scenarioId?: string) =>
    api.get('/dashboard/executive', { params: { period, scenarioId, accumulated: accumulated ? 'true' : undefined } }),
  auditLog: (limit?: number) =>
    api.get('/dashboard/audit-log', { params: { limit } }),
};

// ─── Notifications (alertas do sino) ──────────────────────────────────────────
export interface AppNotification {
  id: string;
  type: 'INCONSISTENCY' | 'OVERDUE_ACTION' | 'OFF_TRACK';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  actionPlanId: string | null;
  actionItemId: string | null;
  indicatorId: string | null;
  period: string | null;
  emailSent: boolean;
  readAt: string | null;
  createdAt: string;
}

export const notificationsApi = {
  list: () => api.get<{ items: AppNotification[]; unreadCount: number }>('/notifications'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  scanOffTrack: () => api.post<{ flagged: number }>('/notifications/scan-off-track'),
};
