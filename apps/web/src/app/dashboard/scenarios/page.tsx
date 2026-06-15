'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scenariosApi } from '../../../lib/api';
import { ImpactMap } from '../../../components/scenarios/ImpactMap';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';
import { Plus, RefreshCw, Layers, X } from 'lucide-react';

const defaultPeriod = () => new Date().toISOString().slice(0, 7) + '-01';

export default function ScenariosPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', period: defaultPeriod() });

  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => scenariosApi.list().then((r) => r.data),
  });

  const list = scenarios as any[];

  const createMut = useMutation({
    mutationFn: () => scenariosApi.create(form),
    onSuccess: (r) => {
      toast.success('Cenário criado');
      qc.invalidateQueries({ queryKey: ['scenarios'] });
      setShowNew(false);
      setForm({ name: '', description: '', period: defaultPeriod() });
      setSelectedId(r.data.id);
    },
    onError: () => toast.error('Erro ao criar cenário (verifique sua permissão)'),
  });

  const recalcMut = useMutation({
    mutationFn: (id: string) => scenariosApi.recalculate(id),
    onSuccess: (r) => {
      toast.success(`Recalculado: ${r.data.computed} indicadores`);
      qc.invalidateQueries({ queryKey: ['impact-map'] });
    },
    onError: () => toast.error('Erro ao recalcular (verifique sua permissão)'),
  });

  const selected = list.find((s) => s.id === selectedId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Simulador de Cenários</h1>
          <p className="text-sm text-white/40 mt-0.5">
            {list.length} cenários — simule projeções e veja o impacto propagar pela árvore
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-xl"
        >
          <Plus size={15} /> Novo Cenário
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Lista de cenários */}
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 bg-[#1a1f2e] rounded-2xl animate-pulse" />
            ))
          ) : list.length === 0 ? (
            <p className="text-white/30 text-sm">Nenhum cenário ainda.</p>
          ) : (
            list.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  'card-dark w-full text-left p-4 transition-all',
                  selectedId === s.id ? 'ring-2 ring-purple-500' : 'hover:bg-white/5',
                )}
              >
                <div className="flex items-center gap-2">
                  <Layers size={14} className="text-purple-400" />
                  <p className="text-sm font-semibold text-white flex-1 truncate">{s.name}</p>
                  {s.isBaseline && (
                    <span className="text-[9px] bg-purple-600/30 text-purple-300 px-1.5 py-0.5 rounded">
                      base
                    </span>
                  )}
                </div>
                {s.description && (
                  <p className="text-xs text-white/40 mt-1 line-clamp-2">{s.description}</p>
                )}
                <p className="text-[10px] text-white/30 mt-2">
                  {s._count?.forecastValues ?? 0} projeções • {s.status}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Detalhe + Mapa de Impacto */}
        <div className="col-span-2 space-y-4">
          {!selected ? (
            <div className="card-dark p-8 text-center text-white/30 text-sm">
              Selecione um cenário para ver o mapa de impacto.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                <button
                  onClick={() => recalcMut.mutate(selected.id)}
                  disabled={recalcMut.isPending}
                  className="flex items-center gap-2 text-sm border border-white/10 text-white/70 hover:text-white px-3 py-1.5 rounded-xl disabled:opacity-50"
                >
                  <RefreshCw size={13} className={recalcMut.isPending ? 'animate-spin' : ''} />
                  Recalcular
                </button>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white/70 mb-2">Mapa de Impacto</h3>
                <ImpactMap scenarioId={selected.id} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal: novo cenário */}
      {showNew && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowNew(false)}
        >
          <div className="card-dark p-6 w-[420px] space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Novo Cenário</h2>
              <button onClick={() => setShowNew(false)} className="text-white/40 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/50">Nome</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-dark w-full mt-1"
                  placeholder="Ex: Cenário Otimista 2026"
                />
              </div>
              <div>
                <label className="text-xs text-white/50">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="input-dark w-full mt-1"
                  rows={2}
                  placeholder="Premissas do cenário..."
                />
              </div>
              <div>
                <label className="text-xs text-white/50">Período</label>
                <input
                  type="date"
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                  className="input-dark w-full mt-1"
                />
              </div>
            </div>
            <button
              onClick={() => createMut.mutate()}
              disabled={!form.name || createMut.isPending}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm py-2 rounded-xl disabled:opacity-50"
            >
              {createMut.isPending ? 'Criando...' : 'Criar Cenário'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
