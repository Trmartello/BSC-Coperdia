'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Plus, BarChart2, X, ChevronRight, MoreVertical, Pencil, Trash2, Copy,
  FolderPlus, Folder, ArrowLeft, Layers, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { mapsApi } from '../../../lib/api';
import { IndicatorMap, MapCategory, MapStructure } from '../../../types/maps';
import { useAuthStore } from '../../../store/auth.store';
import { cn } from '../../../lib/utils';

// Áreas sugeridas para a estrutura (o campo aceita valor customizado).
const AREA_SUGGESTIONS = ['Financeiro', 'Comercial', 'Operacional', 'Agro', 'RH'];

const CATEGORY_COLORS: Record<string, string> = {
  Financeiro: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Comercial: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Operacional: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Agro: 'bg-green-600/20 text-green-400 border-green-600/30',
  RH: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

function getCategoryStyle(name: string): string {
  return CATEGORY_COLORS[name] ?? 'bg-purple-500/20 text-purple-400 border-purple-500/30';
}

// ─── Menu de ações (⋮) ──────────────────────────────────────────────────────────
function ActionMenu({ items }: { items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="p-1.5 rounded-lg text-white/40 hover:text-white/90 hover:bg-white/10 transition-colors"
        aria-label="Ações"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 top-8 z-50 w-44 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden">
            {items.map((it, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setOpen(false); it.onClick(); }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                  it.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-white/70 hover:bg-white/5 hover:text-white',
                )}
              >
                {it.icon} {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Modal genérico ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/5">
          <h2 className="text-white font-semibold">{title}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">{children}</div>
        <div className="flex justify-between px-6 pb-5">{footer}</div>
      </div>
    </div>
  );
}

// ─── Modal Estrutura (criar/editar) ─────────────────────────────────────────────
function StructureModal({ structure, onClose }: { structure?: MapStructure; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!structure;
  const [form, setForm] = useState({
    name: structure?.name ?? '',
    category: structure?.category ?? 'Financeiro',
    description: structure?.description ?? '',
  });

  const mutation = useMutation({
    mutationFn: () => isEdit
      ? mapsApi.updateStructure(structure!.id, form).then((r) => r.data)
      : mapsApi.createStructure(form).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['map-structures'] });
      toast.success(isEdit ? 'Estrutura atualizada' : 'Estrutura criada');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao salvar estrutura'),
  });

  return (
    <Modal
      title={isEdit ? 'Editar Estrutura' : 'Nova Estrutura'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/50 border border-white/10 hover:border-white/20 transition-colors">Cancelar</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.name.trim() || mutation.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            <Plus size={14} /> {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Estrutura'}
          </button>
        </>
      }
    >
      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Nome da estrutura <span className="text-red-400">*</span></label>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Ex: Estrutura Financeira Estratégica" autoFocus className="input-dark" />
      </div>
      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Categoria / Área</label>
        <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          list="area-suggestions" placeholder="Financeiro, Comercial, Operacional…" className="input-dark" />
        <datalist id="area-suggestions">
          {AREA_SUGGESTIONS.map((a) => <option key={a} value={a} />)}
        </datalist>
      </div>
      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Descrição <span className="text-white/25">(opcional)</span></label>
        <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Para que serve esta estrutura de mapas..." rows={2} className="input-dark resize-none" />
      </div>
    </Modal>
  );
}

// ─── Modal Mapa (criar/editar) ───────────────────────────────────────────────────
function MapModal({ structureId, map, categories, onClose, onCreated }: {
  structureId: string; map?: IndicatorMap; categories: MapCategory[]; onClose: () => void; onCreated?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!map;
  const [form, setForm] = useState({
    name: map?.name ?? '',
    description: map?.description ?? '',
    categoryId: map?.categoryId ?? categories[0]?.id ?? '',
  });

  const mutation = useMutation({
    mutationFn: () => isEdit
      ? mapsApi.update(map!.id, form).then((r) => r.data)
      : mapsApi.create({ ...form, structureId }).then((r) => r.data),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ['structure-maps', structureId] });
      qc.invalidateQueries({ queryKey: ['map-structures'] });
      toast.success(isEdit ? 'Mapa atualizado' : 'Mapa criado');
      if (!isEdit && onCreated) onCreated(result.id);
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao salvar mapa'),
  });

  return (
    <Modal
      title={isEdit ? 'Editar Mapa' : 'Novo Mapa'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/50 border border-white/10 hover:border-white/20 transition-colors">Cancelar</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.name.trim() || !form.categoryId || mutation.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            <Plus size={14} /> {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Mapa'}
          </button>
        </>
      }
    >
      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Nome do mapa <span className="text-red-400">*</span></label>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Ex: Resultado Financeiro" autoFocus className="input-dark" />
      </div>
      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Descrição <span className="text-white/25">(opcional)</span></label>
        <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Descreva o fluxo causal deste mapa..." rows={2} className="input-dark resize-none" />
      </div>
      <div>
        <label className="text-xs text-white/50 mb-1.5 block">Categoria</label>
        <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
          className="input-dark appearance-none">
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
    </Modal>
  );
}

// ─── Modal excluir estrutura (cascata ou mover) ─────────────────────────────────
function DeleteStructureModal({ structure, structures, onClose }: {
  structure: MapStructure; structures: MapStructure[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const mapCount = structure._count?.maps ?? 0;
  const others = structures.filter((s) => s.id !== structure.id);
  const [mode, setMode] = useState<'delete' | 'move'>(mapCount > 0 ? 'move' : 'delete');
  const [targetId, setTargetId] = useState(others[0]?.id ?? '');

  const mutation = useMutation({
    mutationFn: async () => {
      if (mapCount > 0 && mode === 'move') {
        const detail = await mapsApi.getStructure(structure.id).then((r) => r.data as MapStructure);
        for (const m of detail.maps ?? []) {
          await mapsApi.update(m.id, { structureId: targetId });
        }
        await mapsApi.deleteStructure(structure.id);
      } else {
        await mapsApi.deleteStructure(structure.id, true);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['map-structures'] });
      qc.invalidateQueries({ queryKey: ['maps'] });
      toast.success('Estrutura excluída');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao excluir estrutura'),
  });

  return (
    <Modal
      title="Excluir Estrutura"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/50 border border-white/10 hover:border-white/20 transition-colors">Cancelar</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (mapCount > 0 && mode === 'move' && !targetId)}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            <Trash2 size={14} /> {mutation.isPending ? 'Excluindo...' : 'Excluir'}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-white/70">
          Você está excluindo <strong className="text-white">{structure.name}</strong>
          {mapCount > 0 ? ` que contém ${mapCount} mapa(s).` : '. Esta estrutura não possui mapas.'}
        </p>
      </div>

      {mapCount > 0 && (
        <div className="space-y-2">
          {others.length > 0 && (
            <label className={cn('flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors',
              mode === 'move' ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-white/10 hover:border-white/20')}>
              <input type="radio" checked={mode === 'move'} onChange={() => setMode('move')} className="mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-white/80">Mover os mapas para outra estrutura</p>
                {mode === 'move' && (
                  <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="input-dark appearance-none mt-2">
                    {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
            </label>
          )}
          <label className={cn('flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors',
            mode === 'delete' ? 'border-red-500/40 bg-red-500/10' : 'border-white/10 hover:border-white/20')}>
            <input type="radio" checked={mode === 'delete'} onChange={() => setMode('delete')} className="mt-0.5" />
            <p className="text-sm text-white/80">Excluir a estrutura <strong>e todos os {mapCount} mapa(s)</strong> vinculados</p>
          </label>
        </div>
      )}
    </Modal>
  );
}

// ─── Card de Estrutura ───────────────────────────────────────────────────────────
function StructureCard({ structure, canManage, onOpen, onEdit, onDelete, onNewMap }: {
  structure: MapStructure; canManage: boolean;
  onOpen: () => void; onEdit: () => void; onDelete: () => void; onNewMap: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="group text-left bg-[#111827] border border-white/8 hover:border-white/20 rounded-2xl p-5 flex flex-col gap-3 transition-all hover:bg-[#151d2e]"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600/30 to-purple-600/30 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
          <Folder size={18} className="text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-snug group-hover:text-indigo-200 transition-colors">{structure.name}</p>
        </div>
        {canManage ? (
          <ActionMenu items={[
            { label: 'Novo mapa', icon: <Plus size={14} />, onClick: onNewMap },
            { label: 'Editar estrutura', icon: <Pencil size={14} />, onClick: onEdit },
            { label: 'Excluir estrutura', icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
          ]} />
        ) : (
          <ChevronRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors mt-1 flex-shrink-0" />
        )}
      </div>
      {structure.description && (
        <p className="text-xs text-white/40 leading-relaxed line-clamp-2">{structure.description}</p>
      )}
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className={cn('text-[10px] px-2.5 py-1 rounded-full border font-medium', getCategoryStyle(structure.category))}>
          {structure.category}
        </span>
        <span className="text-[10px] text-white/30">{structure._count?.maps ?? 0} mapas</span>
      </div>
    </button>
  );
}

// ─── Card de Mapa ────────────────────────────────────────────────────────────────
function MapCard({ map, canManage, onOpen, onEdit, onDuplicate, onDelete }: {
  map: IndicatorMap; canManage: boolean;
  onOpen: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="group text-left bg-[#111827] border border-white/8 hover:border-white/20 rounded-2xl p-5 flex flex-col gap-3 transition-all hover:bg-[#151d2e]"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600/30 to-purple-600/30 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
          <BarChart2 size={18} className="text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-snug group-hover:text-indigo-200 transition-colors">{map.name}</p>
        </div>
        {canManage ? (
          <ActionMenu items={[
            { label: 'Editar mapa', icon: <Pencil size={14} />, onClick: onEdit },
            { label: 'Duplicar mapa', icon: <Copy size={14} />, onClick: onDuplicate },
            { label: 'Excluir mapa', icon: <Trash2 size={14} />, onClick: onDelete, danger: true },
          ]} />
        ) : (
          <ChevronRight size={14} className="text-white/20 group-hover:text-white/50 transition-colors mt-1 flex-shrink-0" />
        )}
      </div>
      {map.description && <p className="text-xs text-white/40 leading-relaxed line-clamp-2">{map.description}</p>}
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className={cn('text-[10px] px-2.5 py-1 rounded-full border font-medium', getCategoryStyle(map.category.name))}>
          {map.category.name}
        </span>
        <span className="text-[10px] text-white/30">{map._count?.entries ?? 0} indicadores</span>
      </div>
    </button>
  );
}

// ─── Card "adicionar" (tracejado) ───────────────────────────────────────────────
function AddCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-transparent border border-dashed border-white/15 hover:border-indigo-500/40 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 transition-all min-h-[160px] group"
    >
      <Plus size={20} className="text-white/20 group-hover:text-indigo-400 transition-colors" />
      <span className="text-sm text-white/30 group-hover:text-white/60 transition-colors">{label}</span>
    </button>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────────
export default function MapsGalleryPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const canManage = user?.role === 'ADMIN' || user?.role === 'CONTROLADORIA';

  const [openStructure, setOpenStructure] = useState<MapStructure | null>(null);

  // Modais
  const [structureModal, setStructureModal] = useState<{ mode: 'new' | 'edit'; structure?: MapStructure } | null>(null);
  const [deleteStructure, setDeleteStructure] = useState<MapStructure | null>(null);
  const [mapModal, setMapModal] = useState<{ structureId: string; map?: IndicatorMap } | null>(null);
  const [deleteMap, setDeleteMap] = useState<IndicatorMap | null>(null);

  const qc = useQueryClient();

  const { data: structures = [] } = useQuery<MapStructure[]>({
    queryKey: ['map-structures'],
    queryFn: () => mapsApi.getStructures().then((r) => r.data),
  });

  const { data: categories = [] } = useQuery<MapCategory[]>({
    queryKey: ['map-categories'],
    queryFn: () => mapsApi.getCategories().then((r) => r.data),
  });

  const { data: structureMaps = [] } = useQuery<IndicatorMap[]>({
    queryKey: ['structure-maps', openStructure?.id],
    queryFn: () => mapsApi.list({ structureId: openStructure!.id }).then((r) => r.data),
    enabled: !!openStructure,
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => mapsApi.duplicate(id).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['structure-maps', openStructure?.id] });
      qc.invalidateQueries({ queryKey: ['map-structures'] });
      toast.success('Mapa duplicado');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao duplicar'),
  });

  const deleteMapMutation = useMutation({
    mutationFn: (id: string) => mapsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['structure-maps', openStructure?.id] });
      qc.invalidateQueries({ queryKey: ['map-structures'] });
      toast.success('Mapa excluído');
      setDeleteMap(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao excluir mapa'),
  });

  // ── Visão: mapas dentro da estrutura ──────────────────────────────────────────
  if (openStructure) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setOpenStructure(null)} className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-white/40">
                <button onClick={() => setOpenStructure(null)} className="hover:text-white/70">Estruturas</button>
                <ChevronRight size={12} />
                <span className="text-white/60">{openStructure.name}</span>
              </div>
              <h1 className="text-white font-semibold text-xl truncate">{openStructure.name}</h1>
            </div>
          </div>
          {canManage && (
            <button
              onClick={() => setMapModal({ structureId: openStructure.id })}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
            >
              <Plus size={14} /> Novo Mapa
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {structureMaps.map((map) => (
            <MapCard
              key={map.id}
              map={map}
              canManage={canManage}
              onOpen={() => router.push(`/dashboard/maps/${map.id}`)}
              onEdit={() => setMapModal({ structureId: openStructure.id, map })}
              onDuplicate={() => duplicateMutation.mutate(map.id)}
              onDelete={() => setDeleteMap(map)}
            />
          ))}
          {canManage && <AddCard label="Novo mapa" onClick={() => setMapModal({ structureId: openStructure.id })} />}
          {structureMaps.length === 0 && !canManage && (
            <div className="col-span-full text-center text-white/30 text-sm py-12">Nenhum mapa nesta estrutura.</div>
          )}
        </div>

        {mapModal && (
          <MapModal
            structureId={mapModal.structureId}
            map={mapModal.map}
            categories={categories}
            onClose={() => setMapModal(null)}
            onCreated={(id) => router.push(`/dashboard/maps/${id}`)}
          />
        )}
        {deleteMap && (
          <Modal
            title="Excluir Mapa"
            onClose={() => setDeleteMap(null)}
            footer={
              <>
                <button onClick={() => setDeleteMap(null)} className="px-4 py-2 rounded-xl text-sm text-white/50 border border-white/10 hover:border-white/20 transition-colors">Cancelar</button>
                <button
                  onClick={() => deleteMapMutation.mutate(deleteMap.id)}
                  disabled={deleteMapMutation.isPending}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={14} /> {deleteMapMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </>
            }
          >
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-white/70">Excluir o mapa <strong className="text-white">{deleteMap.name}</strong>? Os demais mapas da estrutura não são afetados.</p>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ── Visão: lista de estruturas ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={20} className="text-indigo-400" />
          <div>
            <h1 className="text-white font-semibold text-xl">Estruturas de Mapas</h1>
            <p className="text-white/40 text-sm">{structures.length} estruturas</p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => setStructureModal({ mode: 'new' })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            <FolderPlus size={14} /> Nova Estrutura
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {structures.map((s) => (
          <StructureCard
            key={s.id}
            structure={s}
            canManage={canManage}
            onOpen={() => setOpenStructure(s)}
            onEdit={() => setStructureModal({ mode: 'edit', structure: s })}
            onDelete={() => setDeleteStructure(s)}
            onNewMap={() => { setOpenStructure(s); setMapModal({ structureId: s.id }); }}
          />
        ))}
        {canManage && <AddCard label="Nova estrutura" onClick={() => setStructureModal({ mode: 'new' })} />}
        {structures.length === 0 && !canManage && (
          <div className="col-span-full text-center text-white/30 text-sm py-12">Nenhuma estrutura disponível.</div>
        )}
      </div>

      {structureModal && (
        <StructureModal
          structure={structureModal.mode === 'edit' ? structureModal.structure : undefined}
          onClose={() => setStructureModal(null)}
        />
      )}
      {deleteStructure && (
        <DeleteStructureModal
          structure={deleteStructure}
          structures={structures}
          onClose={() => setDeleteStructure(null)}
        />
      )}
    </div>
  );
}
