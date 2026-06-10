'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { indicatorsApi } from '../../../lib/api';
import { IndicatorTree } from '../../../components/tree/IndicatorTree';
import { TreeNode } from '../../../types';
import { Settings, Plus } from 'lucide-react';
import { IndicatorDetailModal } from '../../../components/indicators/IndicatorDetailModal';
import { ActionPlanModal } from '../../../components/indicators/ActionPlanModal';

const TABS = ['Mapas', 'Capital de Giro', 'Indicadores'];

export default function MapsPage() {
  const [activeTab, setActiveTab] = useState('Capital de Giro');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionPlanId, setActionPlanId] = useState<string | null>(null);

  const { data: tree = [], isLoading, refetch } = useQuery<TreeNode[]>({
    queryKey: ['indicator-tree'],
    queryFn: () => indicatorsApi.tree().then((r) => {
      const raw = r.data;
      return Array.isArray(raw) ? raw : [raw];
    }),
  });

  // Build values map from tree (flat pass)
  const valuesMap = new Map<string, { realized: number | null; goal: number | null; estimate: number | null }>();

  function extractValues(node: TreeNode) {
    valuesMap.set(node.id, {
      realized: (node as any).realized ?? null,
      goal: (node as any).goal ?? null,
      estimate: (node as any).estimate ?? null,
    });
    node.children?.forEach(extractValues);
  }
  tree.forEach(extractValues);

  const totalIndicators = valuesMap.size;

  return (
    <div className="space-y-4">
      {/* Sub-header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm transition-all ${
                activeTab === tab
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors">
          <Settings size={14} />
          Gerenciar Indicadores
        </button>
      </div>

      {/* Title row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-white font-semibold">Indicadores</h1>
          <span className="text-white/40 text-sm">{totalIndicators} indicadores</span>
          {/* Status dots */}
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" title="On Track" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" title="At Risk" />
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" title="Off Track" />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" title="No Data" />
          </div>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white/80 text-sm transition-colors">
          <Plus size={13} />
          Novo mapa
        </button>
      </div>

      {/* Tree */}
      {isLoading ? (
        <div className="h-[600px] rounded-2xl bg-[#0d0f17] border border-white/5 animate-pulse" />
      ) : (
        <IndicatorTree
          tree={tree}
          values={valuesMap}
          onNodeClick={(id) => setSelectedId(id)}
        />
      )}

      {/* Modals */}
      {selectedId && (
        <IndicatorDetailModal
          indicatorId={selectedId}
          onClose={() => setSelectedId(null)}
          onOpenActionPlan={() => { setActionPlanId(selectedId); setSelectedId(null); }}
          onUpdated={refetch}
        />
      )}
      {actionPlanId && (
        <ActionPlanModal
          indicatorId={actionPlanId}
          onClose={() => setActionPlanId(null)}
        />
      )}
    </div>
  );
}
