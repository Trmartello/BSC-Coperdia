'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, TrendingUp, TrendingDown, Minus, Target, ClipboardList,
  Plus, Calendar, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { indicatorsApi, actionPlansApi } from '../../lib/api';
import { cn, formatValue } from '../../lib/utils';
import { toast } from 'sonner';

// ─── Mini sparkline bar chart ─────────────────────────────────────────────────

function SparkBars({ data, direction }: { data: { period: string; value: number; goal?: number }[]; direction: string }) {
  if (!data.length) return <div className="h-24 flex items-center justify-center text-white/20 text-xs">Sem dados históricos</div>;

  const maxVal = Math.max(...data.map((d) => Math.max(d.value, d.goal ?? 0)));

  return (
    <div className="flex items-end gap-1 h-24">
      {data.slice(-12).map((d, i) => {
        const heightPct = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
        const goalPct = d.goal && maxVal > 0 ? (d.goal / maxVal) * 100 : null;
        const isGood = d.goal
          ? direction === 'LOWER_IS_BETTER' ? d.value <= d.goal : d.value >= d.goal
          : null;

        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 relative group">
            <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-[#0d0f17] border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white/70 whitespace-nowrap">
              {d.period}: {d.value.toFixed(1)}
              {d.goal ? ` / Meta: ${d.goal.toFixed(1)}` : ''}
            </div>
            {goalPct !== null && (
              <div
                className="absolute w-full border-t border-dashed border-white/20"
                style={{ bottom: `${goalPct}%` }}
              />
            )}
            <div
              className={cn('w-full rounded-sm transition-all', isGood === null ? 'bg-white/20' : isGood ? 'bg-emerald-500/70' : 'bg-red-500/70')}
              style={{ height: `${Math.max(heightPct, 4)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Detail Panel ────────────────────────────────────────────────────────

interface Props {
  indicatorId: string;
  period: string;
  scenarioId?: string;
  onClose: () => void;
}

export function IndicatorDetailPanel({ indicatorId, period, scenarioId, onClose }: Props) {
  const qc = useQueryClient();
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newProblem, setNewProblem] = useState('');

  const { data: indicator, isLoading } = useQuery({
    queryKey: ['indicator-detail', indicatorId, period],
    queryFn: () => indicatorsApi.get(indicatorId).then((r) => r.data),
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['action-plans', { indicatorId }],
    queryFn: () => actionPlansApi.list({ indicatorId }).then((r) => r.data),
  });

  const createPlanMutation = useMutation({
    mutationFn: () => actionPlansApi.create({ problem: newProblem, indicatorId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plans', { indicatorId }] });
      toast.success('Plano de ação criado');
      setShowNewPlan(false);
      setNewProblem('');
    },
  });

  if (isLoading) {
    return (
      <div className="w-[380px] flex-shrink-0 bg-[#1a1f2e] border-l border-white/5 animate-pulse" />
    );
  }

  if (!indicator) return null;

  const ind = indicator as any;

  // Current period values
  const realized = ind.realizedValues?.[0]?.value ? parseFloat(ind.realizedValues[0].value) : null;
  const goal = ind.goals?.[0]?.value ? parseFloat(ind.goals[0].value) : null;
  const estimate = ind.forecastValues?.[0]?.value ? parseFloat(ind.forecastValues[0].value) : null;
  const effective = estimate ?? realized;

  const vsGoal = goal && effective != null && goal !== 0
    ? ((effective - goal) / Math.abs(goal)) * 100 : null;
  const isGoodVsGoal = vsGoal === null ? null
    : (ind.direction === 'LOWER_IS_BETTER' ? vsGoal <= 0 : vsGoal >= 0);

  // YoY: compare with same period last year (mock from available data)
  const allRealized = (ind.realizedValues ?? []).map((rv: any) => ({
    period: new Date(rv.period).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    value: parseFloat(rv.value),
  }));

  // Build chart data from realized + goals aligned by period
  const chartData = (ind.realizedValues ?? []).slice(-15).map((rv: any) => {
    const goalForPeriod = (ind.goals ?? []).find((g: any) =>
      new Date(g.period).getMonth() === new Date(rv.period).getMonth() &&
      new Date(g.period).getFullYear() === new Date(rv.period).getFullYear()
    );
    return {
      period: new Date(rv.period).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      value: parseFloat(rv.value),
      goal: goalForPeriod ? parseFloat(goalForPeriod.value) : undefined,
    };
  });

  const STATUS_BADGE = isGoodVsGoal === null
    ? { label: 'SEM META', color: 'bg-white/5 text-white/30 border-white/10' }
    : isGoodVsGoal
    ? { label: 'NO ALVO', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' }
    : { label: 'FORA DO ALVO', color: 'bg-red-500/10 text-red-400 border-red-500/20' };

  return (
    <div className="w-[380px] flex-shrink-0 bg-[#1a1f2e] border-l border-white/5 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/5">
        <div className="flex items-start justify-between mb-3">
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider', STATUS_BADGE.color)}>
            {STATUS_BADGE.label}
          </span>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
            <X size={16} />
          </button>
        </div>

        <p className="text-[10px] font-mono text-white/30 uppercase tracking-wider">{ind.code}</p>
        <p className="text-base font-bold text-white leading-snug mt-0.5">{ind.name}</p>

        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-white/30">{ind.category}</span>
          <span className="text-white/10">·</span>
          <span className="text-[10px] text-white/30">
            {new Date(period).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Main values */}
        <div className="px-5 py-4 border-b border-white/5">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-4xl font-black text-white">
              {effective != null ? formatValue(effective, ind.unit) : '—'}
            </span>
            {estimate == null && realized != null && (
              <span className="text-xs text-white/30">(realizado)</span>
            )}
          </div>

          <div className="flex gap-4">
            {vsGoal !== null && (
              <div className="flex items-center gap-1">
                {isGoodVsGoal ? (
                  <TrendingUp size={12} className="text-emerald-400" />
                ) : (
                  <TrendingDown size={12} className="text-red-400" />
                )}
                <span className={cn('text-sm font-bold', isGoodVsGoal ? 'text-emerald-400' : 'text-red-400')}>
                  {vsGoal > 0 ? '+' : ''}{vsGoal.toFixed(1)}%
                </span>
                <span className="text-xs text-white/30">vs meta</span>
              </div>
            )}

            {goal != null && (
              <div className="flex items-center gap-1">
                <Target size={12} className="text-white/30" />
                <span className="text-sm text-white/60">{formatValue(goal, ind.unit)}</span>
                <span className="text-xs text-white/30">meta</span>
              </div>
            )}
          </div>

          {/* Tiles row */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[
              { label: 'Realizado', val: formatValue(realized, ind.unit) },
              { label: 'Meta', val: formatValue(goal, ind.unit) },
              { label: 'Estimativa', val: formatValue(estimate, ind.unit) },
            ].map((col) => (
              <div key={col.label} className="bg-white/[0.03] rounded-xl p-3 text-center">
                <p className="text-[9px] text-white/25 uppercase tracking-wider">{col.label}</p>
                <p className="text-sm font-bold text-white/80 mt-1">{col.val}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Historical chart */}
        <div className="px-5 py-4 border-b border-white/5">
          <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-3">Histórico</p>
          <SparkBars data={chartData} direction={ind.direction} />
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-emerald-500/70" />
              <span className="text-[10px] text-white/30">Realizado (no alvo)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm bg-red-500/70" />
              <span className="text-[10px] text-white/30">Fora do alvo</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 border-t border-dashed border-white/20" />
              <span className="text-[10px] text-white/30">Meta</span>
            </div>
          </div>
        </div>

        {/* Diagnosis */}
        <div className="px-5 py-4 border-b border-white/5">
          <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-3">Diagnóstico</p>
          <div className="space-y-2">
            {vsGoal !== null && (
              <div className={cn('flex items-start gap-2 p-3 rounded-xl text-xs', isGoodVsGoal ? 'bg-emerald-500/5 text-emerald-300' : 'bg-red-500/5 text-red-300')}>
                {isGoodVsGoal ? <TrendingUp size={12} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />}
                <span>
                  {isGoodVsGoal
                    ? `Indicador ${Math.abs(vsGoal).toFixed(1)}% ${ind.direction === 'LOWER_IS_BETTER' ? 'abaixo' : 'acima'} da meta — dentro do alvo.`
                    : `Indicador ${Math.abs(vsGoal).toFixed(1)}% ${ind.direction === 'LOWER_IS_BETTER' ? 'acima' : 'abaixo'} da meta — ação necessária.`
                  }
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-white/30">
              <div className={cn('w-2 h-2 rounded-sm', ind.direction === 'LOWER_IS_BETTER' ? 'bg-blue-500' : 'bg-emerald-500')} />
              {ind.direction === 'LOWER_IS_BETTER' ? 'Quanto menor, melhor' : 'Quanto maior, melhor'}
            </div>
          </div>
        </div>

        {/* Action Plans */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Planos de Ação</p>
            <button
              onClick={() => setShowNewPlan(true)}
              className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
            >
              <Plus size={11} />
              Nova ação
            </button>
          </div>

          {showNewPlan && (
            <div className="mb-3 space-y-2">
              <textarea
                value={newProblem}
                onChange={(e) => setNewProblem(e.target.value)}
                placeholder="Descreva o problema a resolver..."
                rows={2}
                className="input-dark resize-none text-xs"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowNewPlan(false)} className="flex-1 py-1.5 rounded-xl border border-white/10 text-xs text-white/40 hover:bg-white/5">
                  Cancelar
                </button>
                <button
                  onClick={() => createPlanMutation.mutate()}
                  disabled={!newProblem.trim() || createPlanMutation.isPending}
                  className="flex-1 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-xs text-white disabled:opacity-50"
                >
                  Criar plano
                </button>
              </div>
            </div>
          )}

          {(plans as any[]).length === 0 && !showNewPlan ? (
            <p className="text-xs text-white/20 text-center py-4">Nenhum plano vinculado.</p>
          ) : (
            <div className="space-y-2">
              {(plans as any[]).map((plan: any) => {
                const totalActions = plan.initiatives?.reduce((acc: number, ini: any) => acc + (ini.actions?.length ?? 0), 0) ?? 0;
                const doneActions = plan.initiatives?.reduce((acc: number, ini: any) =>
                  acc + (ini.actions?.filter((a: any) => a.status === 'DONE').length ?? 0), 0) ?? 0;

                return (
                  <div key={plan.id} className="bg-white/[0.03] rounded-xl p-3 hover:bg-white/[0.05] transition-colors cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-white/70 leading-snug flex-1">{plan.problem}</p>
                      <ChevronRight size={12} className="text-white/20 flex-shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border',
                        plan.status === 'DONE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : plan.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : 'bg-white/5 text-white/30 border-white/10')}>
                        {plan.status === 'DONE' ? 'Concluído' : plan.status === 'IN_PROGRESS' ? 'Em andamento' : 'Aberto'}
                      </span>
                      {totalActions > 0 && (
                        <span className="text-[10px] text-white/30">{doneActions}/{totalActions} ações</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
