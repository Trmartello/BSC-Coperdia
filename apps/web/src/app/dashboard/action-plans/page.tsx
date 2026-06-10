'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { CheckCircle2, Circle, Clock, X, Calendar, User } from 'lucide-react';
import { cn } from '../../../lib/utils';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Circle size={14} className="text-white/40" />,
  IN_PROGRESS: <Clock size={14} className="text-amber-400" />,
  DONE: <CheckCircle2 size={14} className="text-emerald-400" />,
  CANCELLED: <X size={14} className="text-red-400" />,
};

const PRIORITY_STYLE: Record<string, string> = {
  LOW: 'text-slate-400 bg-slate-400/10 border-slate-400/20',
  MEDIUM: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  HIGH: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  CRITICAL: 'text-red-400 bg-red-400/10 border-red-400/20',
};

export default function ActionPlansPage() {
  const qc = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['all-action-plans'],
    queryFn: () => api.get('/action-plans').then((r) => r.data),
  });

  const toggleDone = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/action-plans/${id}`, { status: status === 'DONE' ? 'PENDING' : 'DONE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-action-plans'] }),
  });

  const byIndicator = (plans as any[]).reduce((acc: Record<string, any[]>, plan: any) => {
    const key = plan.indicator?.name ?? 'Sem indicador';
    if (!acc[key]) acc[key] = [];
    acc[key].push(plan);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-white font-semibold text-lg">Plano de Ação</h1>
        <div className="flex gap-2">
          {['PENDING', 'IN_PROGRESS', 'DONE'].map((s) => (
            <div key={s} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/5">
              {STATUS_ICONS[s]}
              <span className="text-xs text-white/50">{(plans as any[]).filter((p) => p.status === s).length}</span>
            </div>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        Object.entries(byIndicator).map(([indicatorName, indicatorPlans]) => (
          <div key={indicatorName}>
            <p className="text-white/30 text-xs uppercase tracking-widest mb-2 px-1">{indicatorName}</p>
            <div className="space-y-2">
              {(indicatorPlans as any[]).map((plan) => (
                <div key={plan.id} className="card-dark p-4 flex items-start gap-3">
                  <button
                    onClick={() => toggleDone.mutate({ id: plan.id, status: plan.status })}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {STATUS_ICONS[plan.status]}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn('text-sm font-medium', plan.status === 'DONE' ? 'line-through text-white/30' : 'text-white/85')}>
                        {plan.title}
                      </p>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', PRIORITY_STYLE[plan.priority])}>
                        {plan.priority}
                      </span>
                    </div>
                    {plan.description && (
                      <p className="text-xs text-white/40 mt-0.5">{plan.description}</p>
                    )}
                    <div className="flex gap-4 mt-1.5 text-[10px] text-white/30">
                      {plan.responsible && (
                        <span className="flex items-center gap-1"><User size={10} />{plan.responsible}</span>
                      )}
                      {plan.dueDate && (
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          {new Date(plan.dueDate).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {!isLoading && (plans as any[]).length === 0 && (
        <div className="text-center py-20 text-white/20">
          <p className="text-sm">Nenhum plano de ação cadastrado.</p>
          <p className="text-xs mt-1">Crie ações a partir dos cards de indicadores no Mapa.</p>
        </div>
      )}
    </div>
  );
}
