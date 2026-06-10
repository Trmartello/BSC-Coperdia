'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, TrendingUp, TrendingDown, ClipboardList } from 'lucide-react';
import { indicatorsApi } from '../../lib/api';
import { formatValue } from '../../lib/utils';

interface Props {
  indicatorId: string;
  onClose: () => void;
  onOpenActionPlan: () => void;
  onUpdated: () => void;
}

export function IndicatorDetailModal({ indicatorId, onClose, onOpenActionPlan }: Props) {
  const { data: indicator, isLoading } = useQuery({
    queryKey: ['indicator', indicatorId],
    queryFn: () => indicatorsApi.get(indicatorId).then((r) => r.data),
  });

  const { data: impactChain } = useQuery({
    queryKey: ['impact-chain', indicatorId],
    queryFn: () => indicatorsApi.impactChain(indicatorId).then((r) => r.data),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-xl mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/5">
          <div>
            {isLoading ? (
              <div className="h-5 w-48 bg-white/5 rounded animate-pulse" />
            ) : (
              <>
                <p className="text-white/40 text-xs font-mono">{indicator?.code}</p>
                <h2 className="text-white font-semibold text-lg">{indicator?.name}</h2>
                <p className="text-white/40 text-xs mt-0.5">{indicator?.category} · {indicator?.periodicity}</p>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors mt-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Direction */}
          {indicator && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-white/5">
              {indicator.direction === 'LOWER_IS_BETTER'
                ? <TrendingDown size={16} className="text-blue-400" />
                : <TrendingUp size={16} className="text-green-400" />}
              <span className="text-sm text-white/70">
                {indicator.direction === 'LOWER_IS_BETTER' ? 'Quanto Menor Melhor' : 'Quanto Maior Melhor'}
              </span>
              <span className="ml-auto text-xs text-white/30">{indicator.unit}</span>
            </div>
          )}

          {/* Formula */}
          {indicator?.formula && (
            <div className="p-3 rounded-xl bg-white/5">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Fórmula</p>
              <code className="text-sm text-purple-300 font-mono">{indicator.formula.expression}</code>
            </div>
          )}

          {/* Parents / Children */}
          {indicator && (
            <div className="grid grid-cols-2 gap-3">
              <RelationList title="Indicadores Pais" items={indicator.parents?.map((r: any) => r.parent) ?? []} />
              <RelationList title="Indicadores Filhos" items={indicator.children?.map((r: any) => r.child) ?? []} />
            </div>
          )}

          {/* Impact chain */}
          {impactChain?.affectedIndicators?.length > 0 && (
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Cadeia de Impacto</p>
              <div className="flex flex-wrap gap-1.5">
                {impactChain.affectedIndicators.map((id: string) => (
                  <span key={id} className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/20">
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-white/5">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-colors">
            Fechar
          </button>
          <button onClick={onOpenActionPlan}
            className="px-4 py-2 rounded-xl text-sm bg-purple-600 hover:bg-purple-700 text-white font-medium flex items-center gap-2 transition-colors">
            <ClipboardList size={14} />
            Plano de Ação
          </button>
        </div>
      </div>
    </div>
  );
}

function RelationList({ title, items }: { title: string; items: any[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs text-white/40 uppercase tracking-wider mb-1.5">{title}</p>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="text-xs text-white/70 bg-white/5 rounded-lg px-2.5 py-1.5">
            <span className="text-white/30 font-mono mr-1.5">{item.code}</span>
            {item.name}
          </div>
        ))}
      </div>
    </div>
  );
}
