'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, LayoutGrid, List, TrendingUp, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { actionPlansApi } from '../../../lib/api';
import {
  ActionPlan, PlanDashboard,
  PLAN_STATUS_LABEL, PLAN_STATUS_COLOR,
  ActionItemPriority, PRIORITY_COLOR, PRIORITY_LABEL,
} from '../../../types/action-plan';
import { cn } from '../../../lib/utils';
import { NewActionPlanModal } from '../../../components/action-plans/NewActionPlanModal';
import { ActionPlanDetail } from '../../../components/action-plans/ActionPlanDetail';

export default function ActionPlansPage() {
  const [showNew, setShowNew] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS' | 'DONE'>('ALL');

  const { data: plans = [], refetch } = useQuery<ActionPlan[]>({
    queryKey: ['action-plans'],
    queryFn: () => actionPlansApi.list().then((r) => r.data),
  });

  const { data: dash } = useQuery<PlanDashboard>({
    queryKey: ['action-plans-dashboard'],
    queryFn: () => actionPlansApi.dashboard().then((r) => r.data),
  });

  const filtered = plans.filter((p) => filter === 'ALL' || p.status === filter);

  if (selectedPlanId) {
    return (
      <div className="h-full">
        <ActionPlanDetail
          planId={selectedPlanId}
          onClose={() => setSelectedPlanId(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white font-semibold text-lg">Plano de Ação</h1>
          <p className="text-white/40 text-sm">{plans.length} planos cadastrados</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          Novo Plano
        </button>
      </div>

      {/* ── Dashboard Cards ── */}
      {dash && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DashCard
            icon={<LayoutGrid size={16} className="text-blue-400" />}
            label="Em aberto"
            value={dash.open}
            color="text-blue-400"
          />
          <DashCard
            icon={<CheckCircle2 size={16} className="text-emerald-400" />}
            label="Concluídas"
            value={dash.done}
            color="text-emerald-400"
          />
          <DashCard
            icon={<AlertTriangle size={16} className="text-red-400" />}
            label="Atrasadas"
            value={dash.overdue}
            color="text-red-400"
          />
          <DashCard
            icon={<TrendingUp size={16} className="text-purple-400" />}
            label="Progresso médio"
            value={`${dash.avgProgress}%`}
            color="text-purple-400"
          />
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        {(['ALL', 'OPEN', 'IN_PROGRESS', 'DONE'] as const).map((s) => {
          const labels = { ALL: 'Todos', OPEN: 'Abertos', IN_PROGRESS: 'Em andamento', DONE: 'Concluídos' };
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-sm transition-all',
                filter === s ? 'bg-white/10 text-white font-medium' : 'text-white/40 hover:text-white/70',
              )}
            >
              {labels[s]}
            </button>
          );
        })}
      </div>

      {/* ── Plans List ── */}
      <div className="space-y-2">
        {filtered.map((plan) => (
          <PlanRow key={plan.id} plan={plan} onClick={() => setSelectedPlanId(plan.id)} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-white/25">
            <p className="text-sm">Nenhum plano encontrado.</p>
            <button onClick={() => setShowNew(true)} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300">
              + Criar primeiro plano
            </button>
          </div>
        )}
      </div>

      {showNew && (
        <NewActionPlanModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => { refetch(); setSelectedPlanId(id); }}
        />
      )}
    </div>
  );
}

function DashCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="card-dark p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-white/40">{label}</span></div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
    </div>
  );
}

function PlanRow({ plan, onClick }: { plan: ActionPlan; onClick: () => void }) {
  const allActions = plan.initiatives?.flatMap((i) => i.actions ?? []) ?? [];
  const doneCount = allActions.filter((a) => a.status === 'DONE').length;
  const avgProgress = allActions.length
    ? Math.round(allActions.reduce((s, a) => s + (a.progress ?? 0), 0) / allActions.length)
    : 0;

  return (
    <button
      onClick={onClick}
      className="w-full card-dark-hover p-4 flex items-center gap-4 text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-white/85">{plan.problem}</p>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border', PLAN_STATUS_COLOR[plan.status])}>
            {PLAN_STATUS_LABEL[plan.status]}
          </span>
          {plan.indicator && (
            <span className="text-[10px] font-mono text-white/25">{plan.indicator.code}</span>
          )}
        </div>
        {plan.description && (
          <p className="text-xs text-white/35 truncate">{plan.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-white/25">
          <span>{plan.initiatives?.length ?? 0} iniciativas</span>
          <span>{doneCount}/{allActions.length} ações</span>
        </div>
      </div>

      {/* Progress */}
      <div className="flex-shrink-0 flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs text-white/40">{avgProgress}%</p>
        </div>
        <div className="w-20 h-1.5 bg-white/8 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 rounded-full transition-all"
            style={{ width: `${avgProgress}%` }}
          />
        </div>
      </div>
    </button>
  );
}
