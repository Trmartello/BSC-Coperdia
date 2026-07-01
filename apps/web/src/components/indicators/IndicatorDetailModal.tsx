'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Target, ClipboardList, Sigma, Crosshair } from 'lucide-react';
import { indicatorsApi } from '../../lib/api';
import { humanizeExpression } from '../../lib/utils';

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

  const { data: allInds = [] } = useQuery({
    queryKey: ['indicators'],
    queryFn: () => indicatorsApi.list().then((r) => r.data),
  });

  const ind = indicator as any;
  const isCalculated = ind?.type === 'CALCULATED';
  const monitoringPoints: string[] = ind?.monitoringPoints ?? [];

  // Leitura amigável da fórmula: troca cada variável (alias) pelo nome do indicador.
  const formulaReading = (() => {
    const expr = ind?.formula?.expression;
    const variables: Record<string, string> = ind?.formula?.variables ?? {};
    if (!expr || Object.keys(variables).length === 0) return '';
    const byId = new Map((allInds as any[]).map((i) => [i.id, i.name]));
    const tokenToName: Record<string, string> = {};
    for (const [alias, indId] of Object.entries(variables)) {
      tokenToName[alias] = byId.get(indId as string) ?? alias;
    }
    return humanizeExpression(expr, tokenToName);
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#161b27] border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-white/5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Crosshair size={16} className="text-purple-300" />
            </div>
            <div>
              {isLoading ? (
                <div className="h-5 w-48 bg-white/5 rounded animate-pulse" />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    {ind?.category && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                        {ind.category}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">{ind?.code}</span>
                  </div>
                  <h2 className="text-white font-bold text-lg leading-snug mt-1">{ind?.name}</h2>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/80 transition-colors mt-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto">
          <p className="text-xs text-white/35">
            Tópicos pré-mapeados para monitoramento e intervenção neste indicador.
          </p>

          {/* Fórmula / Descrição */}
          {(isCalculated && ind?.formula?.expression) ? (
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sigma size={12} className="text-purple-300" />
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Fórmula</p>
              </div>
              <code className="text-sm text-purple-200 font-mono">{ind.formula.expression}</code>
              {formulaReading && (
                <p className="text-xs text-white/55 mt-2 leading-snug">
                  <span className="text-white/30">Leitura: </span>{formulaReading}
                </p>
              )}
              {ind?.description && (
                <p className="text-xs text-white/40 mt-2">{ind.description}</p>
              )}
            </div>
          ) : ind?.description ? (
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
              <p className="text-sm text-white/60">{ind.description}</p>
            </div>
          ) : null}

          {/* Pontos de monitoria */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-white/30">›</span>
              <p className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">
                Pontos de Monitoria
              </p>
            </div>
            {monitoringPoints.length > 0 ? (
              <ul className="space-y-2.5">
                {monitoringPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-white/75">
                    <span className="text-purple-400 mt-1.5 text-[8px] flex-shrink-0">●</span>
                    <span className="leading-snug">{point}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-white/25 py-2">
                Nenhuma frente de trabalho cadastrada para este indicador.
              </p>
            )}
          </div>
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
