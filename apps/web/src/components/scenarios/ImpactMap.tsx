'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { scenariosApi } from '../../lib/api';
import { cn, formatValue } from '../../lib/utils';
import { ArrowDown } from 'lucide-react';

interface Props {
  scenarioId: string;
}

// Mostra a cadeia de indicadores impactados pelo cenário (delta != 0),
// do maior impacto ao menor, com valor, variação absoluta e percentual.
export function ImpactMap({ scenarioId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['impact-map', scenarioId],
    queryFn: () => scenariosApi.impactMap(scenarioId).then((r) => r.data as any[]),
    enabled: !!scenarioId,
  });

  if (isLoading) return <div className="h-40 animate-pulse bg-[#1a1f2e] rounded-2xl" />;

  if (!data?.length) {
    return (
      <div className="card-dark p-6 text-center text-white/30 text-sm">
        Nenhum impacto registrado neste cenário. Edite a estimativa de um indicador de
        entrada e recalcule para ver a propagação pela árvore.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {data.map((sv, i) => {
        const delta = Number(sv.delta);
        const deltaPct = Number(sv.deltaPercent);
        const dir = sv.indicator.direction;
        const neutral = delta === 0;
        const favorable = dir === 'LOWER_IS_BETTER' ? delta < 0 : delta > 0;

        return (
          <React.Fragment key={sv.id}>
            <div className="card-dark flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-mono text-white/30">{sv.indicator.code}</p>
                <p className="text-sm font-medium text-white/80 truncate">{sv.indicator.name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-white">
                  {formatValue(Number(sv.value), sv.indicator.unit)}
                </p>
                <p
                  className={cn(
                    'text-xs font-medium',
                    neutral ? 'text-white/30' : favorable ? 'text-emerald-400' : 'text-red-400',
                  )}
                >
                  {delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '— '}
                  {delta.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                  {' '}({Math.abs(deltaPct).toFixed(1)}%)
                </p>
              </div>
            </div>
            {i < data.length - 1 && (
              <div className="flex justify-center">
                <ArrowDown size={14} className="text-white/20" />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
