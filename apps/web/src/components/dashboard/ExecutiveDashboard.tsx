'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../../lib/api';
import { useScenarioStore } from '../../store/scenario.store';
import { cn, formatValue, statusBg, statusColor, deltaArrow } from '../../lib/utils';
import { IndicatorStatus, MeasureUnit } from '../../types';
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export function ExecutiveDashboard() {
  const { activeScenario, activePeriod } = useScenarioStore();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-executive', activePeriod, activeScenario?.id],
    queryFn: () => dashboardApi.executive(activePeriod, activeScenario?.id).then((r) => r.data),
    refetchInterval: 30_000,
  });

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {data?.map((kpi: any) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      {/* Charts */}
      {data && data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Realizado vs Meta vs Previsto</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.map((k: any) => ({
                name: k.code,
                Realizado: k.realized,
                Meta: k.goal,
                Previsto: k.forecast,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Realizado" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Meta" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Previsto" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Status dos Indicadores</h3>
            <div className="flex flex-col gap-2">
              {data?.map((kpi: any) => <StatusBar key={kpi.id} kpi={kpi} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ kpi }: { kpi: any }) {
  const status = kpi.status as IndicatorStatus;
  return (
    <div className={cn('rounded-xl border p-4 bg-white', statusBg(status))}>
      <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">{kpi.code}</p>
      <p className="text-sm font-semibold text-slate-700 mt-0.5 mb-3">{kpi.name}</p>
      <p className="text-2xl font-bold text-slate-900">{formatValue(kpi.effective, kpi.unit)}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-slate-500">Meta: {formatValue(kpi.goal, kpi.unit)}</span>
        {kpi.deviationGoal !== null && (
          <span className={cn('text-xs font-medium', kpi.deviationGoal >= 0 ? 'text-emerald-600' : 'text-red-500')}>
            {deltaArrow(kpi.deviationGoal)} {Math.abs(kpi.deviationGoal).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBar({ kpi }: { kpi: any }) {
  const pct = kpi.goal && kpi.effective ? Math.min(100, (kpi.effective / kpi.goal) * 100) : 0;
  const color = kpi.status === 'ON_TRACK' ? 'bg-emerald-500' : kpi.status === 'AT_RISK' ? 'bg-amber-400' : 'bg-red-500';

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-600">{kpi.name}</span>
        <span className="text-slate-500">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-slate-50 h-32 animate-pulse" />
      ))}
    </div>
  );
}
