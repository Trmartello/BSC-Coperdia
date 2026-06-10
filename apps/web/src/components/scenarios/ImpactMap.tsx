'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { scenariosApi } from '../../lib/api';
import { cn, formatValue, deltaArrow } from '../../lib/utils';
import { ScenarioValue } from '../../types';

interface Props { scenarioId: string }

export function ImpactMap({ scenarioId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['impact-map', scenarioId],
    queryFn: () => scenariosApi.impactMap(scenarioId).then((r) => r.data as ScenarioValue[]),
    enabled: !!scenarioId,
  });

  if (isLoading) return <div className="h-40 animate-pulse bg-slate-100 rounded-xl" />;
  if (!data?.length) return <p className="text-sm text-slate-400">Nenhum impacto registrado.</p>;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700">Mapa de Impacto</h3>
      {data.map((sv) => (
        <div key={sv.id} className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3">
          <div className="flex-1">
            <p className="text-xs font-mono text-slate-400">{sv.indicator.code}</p>
            <p className="text-sm font-medium text-slate-700">{sv.indicator.name}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">{formatValue(sv.value, sv.indicator.unit)}</p>
            <p className={cn('text-xs font-medium', sv.delta > 0 ? 'text-emerald-600' : sv.delta < 0 ? 'text-red-500' : 'text-slate-400')}>
              {deltaArrow(sv.delta)} {Math.abs(sv.deltaPercent).toFixed(2)}%
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
