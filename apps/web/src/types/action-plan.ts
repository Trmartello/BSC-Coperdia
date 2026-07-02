export type PlanStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';
export type InitiativeStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';
export type ActionItemStatus =
  | 'PENDING' // "No prazo" — automático (data-limite no futuro)
  | 'IN_PROGRESS'
  | 'DONE'
  | 'OVERDUE' // "Atrasada" — automático (data-limite vencida)
  | 'CANCELLED'
  | 'PAUSED'
  | 'AWAITING_VALIDATION';
export type ActionItemPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ActionPlan {
  id: string;
  indicatorId: string | null;
  problem: string;
  description: string | null;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  userId: string;
  user?: { id: string; name: string };
  indicator?: { id: string; code: string; name: string } | null;
  initiatives?: Initiative[];
  comments?: PlanComment[];
  attachments?: PlanAttachment[];
  _count?: { initiatives: number; comments: number; attachments: number };
}

export interface Initiative {
  id: string;
  actionPlanId: string;
  title: string;
  description: string | null;
  status: InitiativeStatus;
  sortOrder: number;
  createdAt: string;
  actions?: ActionItem[];
  _count?: { actions: number };
}

export interface ActionItem {
  id: string;
  initiativeId: string;
  title: string;
  description: string | null;
  priority: ActionItemPriority;
  status: ActionItemStatus;
  dueDate: string | null;
  ownerName: string | null;
  ownerId: string | null;      // responsável pela execução
  userId?: string;             // criador da ação
  progress: number;
  observations: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface PlanComment {
  id: string;
  actionPlanId: string;
  content: string;
  progress: number | null;
  createdAt: string;
  user?: { id: string; name: string };
  // Anexo opcional vinculado ao comentário
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  attachmentMime?: string | null;
}

export interface PlanAttachment {
  id: string;
  actionPlanId: string;
  filename: string;
  url: string;
  size: number;
  mimeType: string;
  createdAt: string;
  user?: { id: string; name: string };
}

export interface PlanDashboard {
  open: number;
  done: number;
  overdue: number;
  avgProgress: number;
  byPriority: Record<string, number>;
  byOwner: Record<string, number>;
  indicatorActionCount: Array<{ indicator: any; openActions: number }>;
  nearDue: ActionItem[];
}

// ─── Labels / display helpers ─────────────────────────────────────────────────

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluído',
};

export const INITIATIVE_STATUS_LABEL: Record<InitiativeStatus, string> = {
  OPEN: 'Aberta',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
};

export const ACTION_STATUS_LABEL: Record<ActionItemStatus, string> = {
  PENDING: 'No prazo',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  OVERDUE: 'Atrasada',
  CANCELLED: 'Cancelada',
  PAUSED: 'Pausada',
  AWAITING_VALIDATION: 'Aguardando validação',
};

export const PRIORITY_LABEL: Record<ActionItemPriority, string> = {
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa',
};

export const PRIORITY_COLOR: Record<ActionItemPriority, string> = {
  HIGH: 'text-red-400',
  MEDIUM: 'text-amber-400',
  LOW: 'text-blue-400',
};

export const PLAN_STATUS_COLOR: Record<PlanStatus, string> = {
  OPEN: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  IN_PROGRESS: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  DONE: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

export const ACTION_STATUS_COLOR: Record<ActionItemStatus, string> = {
  PENDING: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  IN_PROGRESS: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  DONE: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  OVERDUE: 'bg-red-500/20 text-red-300 border-red-500/30',
  CANCELLED: 'bg-slate-700/20 text-slate-500 border-slate-700/30',
  PAUSED: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  AWAITING_VALIDATION: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};
