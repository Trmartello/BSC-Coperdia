'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../lib/api';
import { useScenarioStore } from '../../store/scenario.store';
import { cn, formatValue } from '../../lib/utils';
import { IndicatorStatus } from '../../types';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const STATUS_META: Record<string, { label: string; bar: string; chip: string }> = {
  ON_TRACK: { label: 'No alvo', bar: 'bg-emerald-500', chip: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  AT_RISK: { label: 'Em risco', bar: 'bg-amber-400', chip: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  OFF_TRACK: { label: 'Fora do alvo', bar: 'bg-red-500', chip: 'bg-red-500/10 text-red-400 border-red-500/20' },
  NO_DATA: { label: 'Sem dados', bar: 'bg-white/20', chip: 'bg-white/5 text-white/30 border-white/10' },
};

export function ExecutiveDashboard() {
  const { activeScenario, activePeriod } = useScenarioStore();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-executive', activePeriod, activeScenario?.id],
    queryFn: () => dashboardApi.executive(activePeriod, activeScenario?.id).then((r) => r.data),
    refetchInterval: 30_000,
  });

  if (isLoading) return <DashboardSkeleton />;

  const kpis = (data as any[]) ?? [];

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi: any) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
        {kpis.length === 0 && (
          <div className="col-span-full flex items-center justify-center h-32 text-white/30 text-sm">
            Nenhum indicador com dados para o período.
          </div>
        )}
      </div>

      {/* Charts */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-dark p-5">
            <h3 className="text-sm font-semibold text-white/80 mb-4">Realizado vs Meta vs Previsto</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={kpis.map((k: any) => ({
                name: k.code,
                Realizado: k.realized,
                Meta: k.goal,
                Previsto: k.forecast,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.5)' }} />
                <Tooltip
                  contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }} />
                <Bar dataKey="Realizado" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Meta" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Previsto" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card-dark p-5">
            <h3 className="text-sm font-semibold text-white/80 mb-4">Status dos Indicadores</h3>
            <div className="flex flex-col gap-3">
              {kpis.map((kpi: any) => <StatusBar key={kpi.id} kpi={kpi} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ kpi }: { kpi: any }) {
  const meta = STATUS_META[kpi.status as IndicatorStatus] ?? STATUS_META.NO_DATA;
  const positive = kpi.deviationGoal != null && kpi.deviationGoal >= 0;
  return (
    <div className="card-dark p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">{kpi.code}</p>
        <span className={cn('text-[9px] px-2 py-0.5 rounded-full border', meta.chip)}>{meta.label}</span>
      </div>
      <p className="text-sm font-semibold text-white/80 mt-0.5 mb-3 truncate">{kpi.name}</p>
      <p className="text-2xl font-bold text-white">{formatValue(kpi.effective, kpi.unit)}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-white/40">Meta: {formatValue(kpi.goal, kpi.unit)}</span>
        {kpi.deviationGoal != null && (
          <span className={cn('text-xs font-medium', positive ? 'text-emerald-400' : 'text-red-400')}>
            {positive ? '▲' : '▼'} {Math.abs(kpi.deviationGoal).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBar({ kpi }: { kpi: any }) {
  const pct = kpi.goal && kpi.effective ? Math.min(100, Math.abs((kpi.effective / kpi.goal) * 100)) : 0;
  const meta = STATUS_META[kpi.status as IndicatorStatus] ?? STATUS_META.NO_DATA;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-white/60">{kpi.name}</span>
        <span className="text-white/40">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', meta.bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/10 bg-[#1a1f2e] h-32 animate-pulse" />
      ))}
    </div>
  );
}
