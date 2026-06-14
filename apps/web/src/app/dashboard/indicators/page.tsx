'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { indicatorsApi } from '../../../lib/api';
import { IndicatorCard } from '../../../components/indicators/IndicatorCard';
import { IndicatorDetailPanel } from '../../../components/indicators/IndicatorDetailPanel';
import { IndicatorDetailModal } from '../../../components/indicators/IndicatorDetailModal';
import { cn } from '../../../lib/utils';

const CURRENT_PERIOD = new Date().toISOString().slice(0, 7) + '-01';

export default function IndicatorsPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);

  const { data: indicators = [], isLoading, refetch } = useQuery({
    queryKey: ['indicators'],
    queryFn: () => indicatorsApi.list().then((r) => r.data),
  });

  const indList = indicators as any[];
  const categories = Array.from(new Set(indList.map((i) => i.category))).sort();

  const filtered = indList.filter((ind) => {
    const matchSearch =
      ind.name.toLowerCase().includes(search.toLowerCase()) ||
      ind.code.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'all' || ind.category === activeCategory;
    return matchSearch && matchCat;
  });

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-56px-48px)]">
      {/* Header + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Indicadores</h1>
          <p className="text-sm text-white/40">{indList.length} indicadores cadastrados</p>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 bg-[#1a1f2e] border border-white/10 rounded-xl px-3 py-2">
          <Search size={13} className="text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none w-48"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory('all')}
          className={cn(
            'px-3 py-1 rounded-full text-xs border transition-all',
            activeCategory === 'all'
              ? 'bg-purple-600 text-white border-purple-600'
              : 'text-white/50 border-white/10 hover:text-white/80',
          )}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'px-3 py-1 rounded-full text-xs border transition-all',
              activeCategory === cat
                ? 'bg-white/10 text-white border-white/20'
                : 'text-white/50 border-white/10 hover:text-white/80',
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 bg-[#1a1f2e] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-white/20 text-sm">
            Nenhum indicador encontrado.
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
            {filtered.map((ind: any) => (
              <IndicatorCard
                key={ind.id}
                data={{
                  indicator: ind,
                  realized: ind.realizedValues?.[0]?.value ?? null,
                  goal: ind.goals?.[0]?.value ?? null,
                  estimate: ind.forecastValues?.[0]?.value ?? null,
                }}
                onOpenInfo={() => setInfoId(ind.id)}
                onOpenDetail={() => setDetailId((prev) => prev === ind.id ? null : ind.id)}
                onUpdated={() => refetch()}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info modal (formula + impact chain) */}
      {infoId && (
        <IndicatorDetailModal
          indicatorId={infoId}
          onClose={() => setInfoId(null)}
          onOpenActionPlan={() => { setInfoId(null); setDetailId(infoId); }}
          onUpdated={() => refetch()}
        />
      )}

      {/* Overlay detail panel */}
      {detailId && (
        <IndicatorDetailPanel
          indicatorId={detailId}
          period={CURRENT_PERIOD}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
