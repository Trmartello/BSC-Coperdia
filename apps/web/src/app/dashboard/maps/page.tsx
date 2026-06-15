'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, BarChart2, X, ChevronRight } from 'lucide-react';
import { mapsApi } from '../../../lib/api';
import { IndicatorMap, MapCategory } from '../../../types/maps';
import { cn } from '../../../lib/utils';

// ─── Category badge colors ────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  Financeiro: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Comercial: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Operacional: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Agro: 'bg-green-600/20 text-green-400 border-green-600/30',
};

function getCategoryStyle(name: string, color: string): string {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
}

// ─── New Map Modal ────────────────────────────────────────────────────────────
function NewMapModal({
  categories,
  onClose,
  onCreated,
}: {
  categories: MapCategory[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '', categoryId: categories[0]?.id ?? '' });

  const mutation = useMutation({
    mutationFn: () => mapsApi.create(form).then((r) => r.data),
    onSuccess: (map) => {
      qc.invalidateQueries({ queryKey: ['maps'] });
      onCreated(map.id);
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/5">
          <h2 className="text-white font-semibold">Novo Mapa</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Nome do mapa <span className="text-red-400">*</span></label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Resultado Financeiro"
              autoFocus
              className="input-dark"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Descrição <span className="text-white/25">(opcional)</span></label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descreva o fluxo causal deste mapa..."
              rows={2}
              className="input-dark resize-none"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Categoria</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              className="input-dark appearance-none"
            >
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-between px-6 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/50 border border-white/10 hover:border-white/20 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.name.trim() || !form.categoryId || mutation.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            <Plus size={14} /> {mutation.isPending ? 'Criando...' : 'Criar Mapa'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Map Card ─────────────────────────────────────────────────────────────────
function MapCard({ map, onClick }: { map: IndicatorMap; onClick: () => void }) {
  const catStyle = getCategoryStyle(map.category.name, map.category.color);
  return (
    <button
      onClick={onClick}
      className="group text-left bg-[#111827] border border-white/8 hover:border-white/20 rounded-2xl p-5 flex flex-col gap-3 transition-all hover:bg-[#151d2e]"
    >
      {/* Icon + name */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600/30 to-purple-600/30 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
          <BarChart2 size={18} className="text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-snug group-hover:text-indigo-200 transition-colors">
            {map.name}
          </p>
        </div>
        <ChevronRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors mt-1 flex-shrink-0" />
      </div>

      {/* Description */}
      {map.description && (
        <p className="text-xs text-white/40 leading-relaxed line-clamp-2">{map.description}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className={cn('text-[10px] px-2.5 py-1 rounded-full border font-medium', catStyle)}>
          {map.category.name}
        </span>
        <span className="text-[10px] text-white/30">{map._count?.entries ?? 0} indicadores</span>
      </div>
    </button>
  );
}

// ─── Add Map Card (dashed) ────────────────────────────────────────────────────
function AddMapCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-transparent border border-dashed border-white/15 hover:border-indigo-500/40 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 transition-all min-h-[160px] group"
    >
      <Plus size={20} className="text-white/20 group-hover:text-indigo-400 transition-colors" />
      <span className="text-sm text-white/30 group-hover:text-white/60 transition-colors">Novo mapa</span>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MapsGalleryPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showNew, setShowNew] = useState(false);

  const { data: categories = [] } = useQuery<MapCategory[]>({
    queryKey: ['map-categories'],
    queryFn: () => mapsApi.getCategories().then((r) => r.data),
  });

  const { data: maps = [] } = useQuery<IndicatorMap[]>({
    queryKey: ['maps'],
    queryFn: () => mapsApi.list().then((r) => r.data),
  });

  const filtered = activeCategory === 'all'
    ? maps
    : maps.filter((m) => m.categoryId === activeCategory);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white font-semibold text-xl">Mapa Causal</h1>
          <p className="text-white/40 text-sm">{maps.length} mapas</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          Novo Mapa
        </button>
      </div>

      {/* ── Category filter tabs ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory('all')}
          className={cn(
            'px-4 py-1.5 rounded-full text-sm border transition-all',
            activeCategory === 'all'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'text-white/50 border-white/10 hover:text-white/80 hover:border-white/20',
          )}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm border transition-all',
              activeCategory === cat.id
                ? 'bg-white/10 text-white border-white/20'
                : 'text-white/50 border-white/10 hover:text-white/80 hover:border-white/20',
            )}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* ── Maps Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((map) => (
          <MapCard
            key={map.id}
            map={map}
            onClick={() => router.push(`/dashboard/maps/${map.id}`)}
          />
        ))}
        <AddMapCard onClick={() => setShowNew(true)} />
      </div>

      {showNew && (
        <NewMapModal
          categories={categories}
          onClose={() => setShowNew(false)}
          onCreated={(id) => router.push(`/dashboard/maps/${id}`)}
        />
      )}
    </div>
  );
}
