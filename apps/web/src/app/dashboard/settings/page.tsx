'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings, BarChart2, Map, Tag, Plus, Pencil, Trash2, Activity, FileSpreadsheet,
} from 'lucide-react';
import { settingsApi } from '../../../lib/api';
import { IndicatorFormPanel } from '../../../components/indicators/IndicatorFormPanel';
import { ImportDataModal } from '../../../components/indicators/ImportDataModal';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

const TABS = [
  { key: 'overview', label: 'Visão Geral', icon: Activity },
  { key: 'indicators', label: 'Indicadores', icon: BarChart2 },
  { key: 'maps', label: 'Mapas', icon: Map },
  { key: 'categories', label: 'Categorias', icon: Tag },
];

const UNIT_LABEL: Record<string, string> = {
  CURRENCY: 'Moeda', PERCENTAGE: '%', NUMBER: 'Número', DAYS: 'Dias', INDEX: 'Índice',
};

// Método de consolidação no modo "Acumular" (YTD)
const ACC_OPTIONS: { value: string; label: string }[] = [
  { value: 'SUM', label: 'Soma (fluxo)' },
  { value: 'AVERAGE', label: 'Média (prazo/taxa)' },
  { value: 'LAST', label: 'Último saldo' },
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const [newCat, setNewCat] = useState({ name: '', color: '#6366f1' });
  const [showNewCat, setShowNewCat] = useState(false);
  const [showIndForm, setShowIndForm] = useState(false);
  const [editIndId, setEditIndId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const { data: systemData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getSystem().then((r) => r.data),
  });

  const { data: flags } = useQuery({
    queryKey: ['settings-flags'],
    queryFn: () => settingsApi.getFlags().then((r) => r.data),
  });

  const setFlagMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) => settingsApi.setFlag(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-flags'] });
      toast.success('Configuração atualizada');
    },
    onError: () => toast.error('Erro ao atualizar (verifique sua permissão)'),
  });

  const { data: indicators = [] } = useQuery({
    queryKey: ['settings-indicators'],
    queryFn: () => settingsApi.getIndicators().then((r) => r.data),
    enabled: tab === 'indicators',
  });

  const { data: maps = [] } = useQuery({
    queryKey: ['settings-maps'],
    queryFn: () => settingsApi.getMaps().then((r) => r.data),
    enabled: tab === 'maps',
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['settings-categories'],
    queryFn: () => settingsApi.getCategories().then((r) => r.data),
    enabled: tab === 'categories',
  });

  const deleteIndMutation = useMutation({
    mutationFn: (id: string) => settingsApi.deleteIndicator(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings-indicators'] }); toast.success('Indicador removido'); },
  });

  const setAccMutation = useMutation({
    mutationFn: ({ id, accumulation }: { id: string; accumulation: string }) =>
      settingsApi.updateIndicator(id, { accumulation }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-indicators'] });
      // os valores acumulados dependem disso → revalida dashboard e mapas
      qc.invalidateQueries({ queryKey: ['dashboard-executive'] });
      qc.invalidateQueries({ queryKey: ['map'] });
      toast.success('Método de acumulação atualizado');
    },
    onError: () => toast.error('Erro ao atualizar (verifique sua permissão)'),
  });

  const createCatMutation = useMutation({
    mutationFn: () => settingsApi.createCategory(newCat),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings-categories'] }); setShowNewCat(false); setNewCat({ name: '', color: '#6366f1' }); toast.success('Categoria criada'); },
  });

  const deleteCatMutation = useMutation({
    mutationFn: (id: string) => settingsApi.deleteCategory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings-categories'] }); toast.success('Categoria removida'); },
  });

  const stats = (systemData as any)?.stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings size={20} className="text-white/40" />
          Configurações do Sistema
        </h1>
        <p className="text-sm text-white/40 mt-0.5">Administração de indicadores, mapas e categorias</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[#1a1f2e] border border-white/10 rounded-xl p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab === t.key
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                : 'text-white/40 hover:text-white/70',
            )}
          >
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4">
          {stats && [
            { label: 'Usuários cadastrados', value: stats.userCount, icon: Activity, color: 'text-purple-400' },
            { label: 'Indicadores ativos', value: stats.indicatorCount, icon: BarChart2, color: 'text-blue-400' },
            { label: 'Mapas de indicadores', value: stats.mapCount, icon: Map, color: 'text-emerald-400' },
            { label: 'Planos de ação', value: stats.planCount, icon: Settings, color: 'text-amber-400' },
          ].map((s) => (
            <div key={s.label} className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
              <s.icon size={18} className={cn(s.color, 'mb-3')} />
              <p className="text-3xl font-bold text-white">{s.value}</p>
              <p className="text-sm text-white/40 mt-1">{s.label}</p>
            </div>
          ))}

          <div className="col-span-2 bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
            <p className="text-sm font-medium text-white/60 mb-3">Preferências de exibição</p>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <div>
                <p className="text-sm text-white/80">Habilitar estimativa de indicadores</p>
                <p className="text-xs text-white/40 mt-0.5">
                  Exibe a coluna "Estimativa" nos cards e no painel expandido dos indicadores.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFlagMutation.mutate({ key: 'showEstimate', value: !(flags?.showEstimate ?? true) })}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                  (flags?.showEstimate ?? true) ? 'bg-purple-600' : 'bg-white/15',
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                  (flags?.showEstimate ?? true) ? 'translate-x-5' : 'translate-x-0',
                )} />
              </button>
            </label>
          </div>

          <div className="col-span-2 bg-[#1a1f2e] border border-white/10 rounded-2xl p-5">
            <p className="text-sm font-medium text-white/60 mb-1">Versão do sistema</p>
            <p className="text-lg font-bold text-white">{(systemData as any)?.system?.name ?? 'BSC Copérdia'}</p>
            <p className="text-xs text-white/30 mt-1">v{(systemData as any)?.system?.version ?? '1.0.0'}</p>
          </div>
        </div>
      )}

      {/* Indicators */}
      {tab === 'indicators' && (
        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/5 flex items-center justify-between">
            <p className="text-sm font-medium text-white/60">{(indicators as any[]).length} indicadores</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs font-medium transition-colors"
              >
                <FileSpreadsheet size={13} /> Carga de dados
              </button>
              <button
                onClick={() => { setEditIndId(null); setShowIndForm(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors"
              >
                <Plus size={13} /> Novo Indicador
              </button>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Código', 'Nome', 'Categoria', 'Tipo', 'Unidade', 'Acúmulo (YTD)', 'Periodicidade', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-white/30 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(indicators as any[]).map((ind: any) => (
                <tr key={ind.id} className="hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-mono text-xs text-white/40">{ind.code}</td>
                  <td className="px-4 py-3 text-sm text-white/80">{ind.name}</td>
                  <td className="px-4 py-3 text-xs text-white/40">{ind.category}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border',
                      ind.type === 'CALCULATED'
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        : 'bg-blue-500/10 text-blue-400 border-blue-500/20')}>
                      {ind.type === 'CALCULATED' ? 'Calculado' : 'Entrada'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-white/40">{UNIT_LABEL[ind.unit] ?? ind.unit}</td>
                  <td className="px-4 py-3">
                    {ind.type === 'CALCULATED' ? (
                      <span className="text-[11px] text-white/30 italic" title="Indicador calculado: a acumulação reflete a fórmula sobre os insumos já acumulados">
                        Fórmula
                      </span>
                    ) : (
                      <select
                        value={ind.accumulation ?? 'SUM'}
                        onChange={(e) => setAccMutation.mutate({ id: ind.id, accumulation: e.target.value })}
                        className="bg-[#0d0f17] border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:border-purple-500/40 outline-none cursor-pointer"
                        title="Como este indicador é consolidado no modo Acumular (YTD)"
                      >
                        {ACC_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-white/40">{ind.periodicity}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditIndId(ind.id); setShowIndForm(true); }}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/20 hover:text-white/60 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => { if (confirm('Remover indicador?')) deleteIndMutation.mutate(ind.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Maps */}
      {tab === 'maps' && (
        <div className="grid grid-cols-2 gap-4">
          {(maps as any[]).map((map: any) => (
            <div key={map.id} className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-white/80">{map.name}</p>
                  <p className="text-[11px] text-white/30 mt-0.5">{map.description}</p>
                </div>
                {map.category && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/10 text-white/40">
                    {map.category.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/30">{map._count?.entries ?? 0} indicadores</p>
            </div>
          ))}
          {(maps as any[]).length === 0 && (
            <div className="col-span-2 text-center py-12 text-white/20 text-sm">Nenhum mapa cadastrado.</div>
          )}
        </div>
      )}

      {/* Categories */}
      {tab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowNewCat(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/60 hover:text-white/80 transition-colors"
            >
              <Plus size={13} />
              Nova categoria
            </button>
          </div>

          {showNewCat && (
            <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-4 space-y-3">
              <p className="text-sm font-medium text-white/60">Nova categoria</p>
              <div className="flex gap-3">
                <input
                  value={newCat.name}
                  onChange={(e) => setNewCat((c) => ({ ...c, name: e.target.value }))}
                  placeholder="Nome da categoria"
                  className="input-dark flex-1"
                />
                <input
                  type="color"
                  value={newCat.color}
                  onChange={(e) => setNewCat((c) => ({ ...c, color: e.target.value }))}
                  className="w-10 h-10 rounded-xl border border-white/10 bg-transparent cursor-pointer"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowNewCat(false)} className="flex-1 py-1.5 rounded-xl border border-white/10 text-sm text-white/40 hover:bg-white/5">
                  Cancelar
                </button>
                <button
                  onClick={() => createCatMutation.mutate()}
                  disabled={!newCat.name}
                  className="flex-1 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm text-white disabled:opacity-50"
                >
                  Criar
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {(categories as any[]).map((cat: any) => (
              <div key={cat.id} className="bg-[#1a1f2e] border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: cat.color }} />
                <span className="text-sm text-white/80 flex-1">{cat.name}</span>
                <button
                  onClick={() => { if (confirm('Remover categoria?')) deleteCatMutation.mutate(cat.id); }}
                  className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showIndForm && (
        <IndicatorFormPanel
          editIndicatorId={editIndId}
          onClose={() => { setShowIndForm(false); setEditIndId(null); }}
          onSaved={() => {
            setShowIndForm(false);
            setEditIndId(null);
            qc.invalidateQueries({ queryKey: ['settings-indicators'] });
          }}
        />
      )}

      {showImport && <ImportDataModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
