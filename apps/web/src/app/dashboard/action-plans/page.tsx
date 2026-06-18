'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, LayoutGrid, TrendingUp, AlertTriangle, CheckCircle2, X, ChevronDown, Search, Check } from 'lucide-react';
import { actionPlansApi, usersApi, mapsApi } from '../../../lib/api';
import {
  ActionPlan, PlanDashboard,
  PLAN_STATUS_LABEL, PLAN_STATUS_COLOR,
} from '../../../types/action-plan';
import { cn } from '../../../lib/utils';
import { useAuthStore } from '../../../store/auth.store';
import { NewActionPlanModal } from '../../../components/action-plans/NewActionPlanModal';
import { ActionPlanDetail } from '../../../components/action-plans/ActionPlanDetail';

export default function ActionPlansPage() {
  const [showNew, setShowNew] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  // Todos os filtros são multi-seleção (Set vazio = "todos").
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [priorities, setPriorities] = useState<Set<string>>(new Set());
  const [mapIds, setMapIds] = useState<Set<string>>(new Set());

  // Filtro de usuário — por padrão, já vem filtrado pelo usuário logado
  const [userIds, setUserIds] = useState<Set<string>>(() => {
    const u = useAuthStore.getState().user;
    return new Set(u ? [u.id] : []);
  });

  const { data: plans = [], refetch } = useQuery<ActionPlan[]>({
    queryKey: ['action-plans'],
    queryFn: () => actionPlansApi.list().then((r) => r.data),
  });

  const { data: dash } = useQuery<PlanDashboard>({
    queryKey: ['action-plans-dashboard'],
    queryFn: () => actionPlansApi.dashboard().then((r) => r.data),
  });

  const { data: maps = [] } = useQuery<any[]>({
    queryKey: ['maps'],
    queryFn: () => mapsApi.list().then((r) => r.data),
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data),
  });

  // União dos indicadores de todos os mapas selecionados
  const selectedMapIndicators = React.useMemo(() => {
    if (mapIds.size === 0) return null;
    const set = new Set<string>();
    for (const m of maps) {
      if (mapIds.has(m.id)) for (const e of m.entries ?? []) set.add(e.indicatorId);
    }
    return set;
  }, [mapIds, maps]);

  const filtered = plans.filter((p) => {
    if (statuses.size > 0 && !statuses.has(p.status)) return false;
    if (sources.size > 0) {
      const isStandalone = p.indicatorId === null;
      const ok = (sources.has('STANDALONE') && isStandalone) || (sources.has('CARD') && !isStandalone);
      if (!ok) return false;
    }
    if (selectedMapIndicators && (!p.indicatorId || !selectedMapIndicators.has(p.indicatorId))) return false;

    const actions = p.initiatives?.flatMap((i) => i.actions ?? []) ?? [];
    if (priorities.size > 0 && !actions.some((a) => priorities.has(a.priority))) return false;
    if (userIds.size > 0) {
      const involved = [...userIds].some(
        (uid) => p.userId === uid || actions.some((a) => a.ownerId === uid),
      );
      if (!involved) return false;
    }
    return true;
  });

  const hasActiveFilters =
    statuses.size > 0 || sources.size > 0 || priorities.size > 0 || mapIds.size > 0 || userIds.size > 0;

  function clearFilters() {
    setStatuses(new Set());
    setSources(new Set());
    setPriorities(new Set());
    setMapIds(new Set());
    setUserIds(new Set());
  }

  if (selectedPlanId) {
    return (
      <div className="h-full">
        <ActionPlanDetail
          planId={selectedPlanId}
          onClose={() => setSelectedPlanId(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white font-semibold text-lg">Plano de Ação</h1>
          <p className="text-white/40 text-sm">
            {hasActiveFilters
              ? `${filtered.length} de ${plans.length} planos`
              : `${plans.length} planos cadastrados`}
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          Novo Plano
        </button>
      </div>

      {/* ── Dashboard Cards ── */}
      {dash && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DashCard
            icon={<LayoutGrid size={16} className="text-blue-400" />}
            label="Em aberto"
            value={dash.open}
            color="text-blue-400"
          />
          <DashCard
            icon={<CheckCircle2 size={16} className="text-emerald-400" />}
            label="Concluídas"
            value={dash.done}
            color="text-emerald-400"
          />
          <DashCard
            icon={<AlertTriangle size={16} className="text-red-400" />}
            label="Atrasadas"
            value={dash.overdue}
            color="text-red-400"
          />
          <DashCard
            icon={<TrendingUp size={16} className="text-purple-400" />}
            label="Progresso médio"
            value={`${dash.avgProgress}%`}
            color="text-purple-400"
          />
        </div>
      )}

      {/* ── Filters (faixa horizontal compacta, multi-seleção) ── */}
      <div className="flex flex-wrap items-center gap-2">
        <MultiFilter
          label="Status"
          allLabel="Todos"
          selected={statuses}
          onToggle={(v) => setStatuses((p) => toggleSet(p, v))}
          onClear={() => setStatuses(new Set())}
          options={[
            { value: 'OPEN', label: 'Abertos' },
            { value: 'IN_PROGRESS', label: 'Em andamento' },
            { value: 'DONE', label: 'Concluídos' },
          ]}
        />

        <MultiFilter
          label="Origem"
          allLabel="Todas"
          selected={sources}
          onToggle={(v) => setSources((p) => toggleSet(p, v))}
          onClear={() => setSources(new Set())}
          options={[
            { value: 'STANDALONE', label: 'Planos avulsos' },
            { value: 'CARD', label: 'Planos de cards' },
          ]}
        />

        <MultiFilter
          label="Prioridade"
          allLabel="Todas"
          selected={priorities}
          onToggle={(v) => setPriorities((p) => toggleSet(p, v))}
          onClear={() => setPriorities(new Set())}
          options={[
            { value: 'HIGH', label: 'Alta', dot: 'bg-red-400', valueClass: 'text-red-400' },
            { value: 'MEDIUM', label: 'Média', dot: 'bg-amber-400', valueClass: 'text-amber-400' },
            { value: 'LOW', label: 'Baixa', dot: 'bg-blue-400', valueClass: 'text-blue-400' },
          ]}
        />

        <MultiFilter
          label="Mapa"
          allLabel="Todos"
          searchable
          minWidth="min-w-[200px]"
          selected={mapIds}
          onToggle={(v) => setMapIds((p) => toggleSet(p, v))}
          onClear={() => setMapIds(new Set())}
          options={maps.map((m) => ({ value: m.id, label: m.name }))}
        />

        <MultiFilter
          label="Usuário"
          allLabel="Todos"
          searchable
          minWidth="min-w-[220px]"
          selected={userIds}
          onToggle={(v) => setUserIds((p) => toggleSet(p, v))}
          onClear={() => setUserIds(new Set())}
          options={users.map((u) => ({ value: u.id, label: u.name, sublabel: u.email }))}
        />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/80 border border-white/10 hover:border-white/20 transition-colors"
          >
            <X size={12} /> Limpar tudo
          </button>
        )}
      </div>

      {/* ── Plans List ── */}
      <div className="space-y-2">
        {filtered.map((plan) => (
          <PlanRow key={plan.id} plan={plan} onClick={() => setSelectedPlanId(plan.id)} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-16 text-white/25">
            <p className="text-sm">Nenhum plano encontrado.</p>
            {hasActiveFilters ? (
              <button onClick={clearFilters} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300">
                Limpar filtros
              </button>
            ) : (
              <button onClick={() => setShowNew(true)} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300">
                + Criar primeiro plano
              </button>
            )}
          </div>
        )}
      </div>

      {showNew && (
        <NewActionPlanModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => { refetch(); setSelectedPlanId(id); }}
        />
      )}
    </div>
  );
}

function toggleSet(prev: Set<string>, v: string): Set<string> {
  const next = new Set(prev);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
}

interface MultiOption {
  value: string;
  label: string;
  sublabel?: string;   // texto auxiliar (ex: e-mail)
  dot?: string;        // classe de cor do ponto (ex: bg-red-400)
  valueClass?: string; // classe de cor do texto selecionado
}

function MultiFilter({
  label,
  options,
  selected,
  onToggle,
  onClear,
  searchable = false,
  minWidth = 'min-w-[170px]',
  allLabel = 'Todas',
}: {
  label: string;
  options: MultiOption[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
  searchable?: boolean;
  minWidth?: string;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const active = selected.size > 0;
  const selectedOpts = options.filter((o) => selected.has(o.value));
  const visible = searchable
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          (o.sublabel ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : options;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((s) => !s); setSearch(''); }}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors',
          active
            ? 'bg-white/10 border-white/15 text-white'
            : 'bg-white/5 border-transparent text-white/60 hover:text-white/85 hover:bg-white/8',
        )}
      >
        <span className="text-white/35 text-xs">{label}:</span>
        {selected.size === 0 && <span className="font-medium text-white/60">{allLabel}</span>}
        {selected.size === 1 && (
          <span className="flex items-center gap-1.5 font-medium max-w-[160px] truncate">
            {selectedOpts[0]?.dot && (
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', selectedOpts[0].dot)} />
            )}
            <span className={cn('truncate', selectedOpts[0]?.valueClass)}>{selectedOpts[0]?.label}</span>
          </span>
        )}
        {selected.size > 1 && <span className="font-medium text-white">{selected.size} selecionados</span>}
        <ChevronDown size={12} className="text-white/30 flex-shrink-0" />
      </button>

      {open && (
        <div className={cn('absolute z-50 left-0 top-full mt-1 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col', minWidth)}>
          {searchable && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 flex-shrink-0">
              <Search size={13} className="text-white/30 flex-shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto py-1">
            {visible.length === 0 && <p className="px-4 py-3 text-xs text-white/30">Nenhuma opção.</p>}
            {visible.map((o) => {
              const checked = selected.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onToggle(o.value)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-white/5 transition-colors text-left"
                >
                  <span className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                    checked ? 'bg-purple-600 border-purple-600' : 'border-white/20',
                  )}>
                    {checked && <Check size={11} className="text-white" />}
                  </span>
                  {o.dot && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', o.dot)} />}
                  <span className="flex-1 min-w-0">
                    <span className={cn('block truncate', o.valueClass ?? 'text-white/80')}>{o.label}</span>
                    {o.sublabel && <span className="block text-[10px] text-white/30 truncate">{o.sublabel}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {active && (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-white/40 hover:text-white/80 border-t border-white/5 flex-shrink-0"
            >
              <X size={11} /> Limpar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DashCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="card-dark p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-white/40">{label}</span></div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
    </div>
  );
}

function PlanRow({ plan, onClick }: { plan: ActionPlan; onClick: () => void }) {
  const allActions = plan.initiatives?.flatMap((i) => i.actions ?? []) ?? [];
  const doneCount = allActions.filter((a) => a.status === 'DONE').length;
  const avgProgress = allActions.length
    ? Math.round(allActions.reduce((s, a) => s + (a.progress ?? 0), 0) / allActions.length)
    : 0;

  return (
    <button
      onClick={onClick}
      className="w-full card-dark-hover p-4 flex items-center gap-4 text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-white/85">{plan.problem}</p>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border', PLAN_STATUS_COLOR[plan.status])}>
            {PLAN_STATUS_LABEL[plan.status]}
          </span>
          {plan.indicator && (
            <span className="text-[10px] font-mono text-white/25">{plan.indicator.code}</span>
          )}
        </div>
        {plan.description && (
          <p className="text-xs text-white/35 truncate">{plan.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-[10px] text-white/25">
          <span>{plan.initiatives?.length ?? 0} iniciativas</span>
          <span>{doneCount}/{allActions.length} ações</span>
        </div>
      </div>

      {/* Progress */}
      <div className="flex-shrink-0 flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs text-white/40">{avgProgress}%</p>
        </div>
        <div className="w-20 h-1.5 bg-white/8 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 rounded-full transition-all"
            style={{ width: `${avgProgress}%` }}
          />
        </div>
      </div>
    </button>
  );
}
