'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, LayoutGrid, TrendingUp, AlertTriangle, CheckCircle2, X, ChevronDown, Search } from 'lucide-react';
import { actionPlansApi, usersApi } from '../../../lib/api';
import {
  ActionPlan, PlanDashboard,
  PLAN_STATUS_LABEL, PLAN_STATUS_COLOR,
  ActionItemPriority, PRIORITY_LABEL,
} from '../../../types/action-plan';
import { cn } from '../../../lib/utils';
import { useAuthStore } from '../../../store/auth.store';
import { NewActionPlanModal } from '../../../components/action-plans/NewActionPlanModal';
import { ActionPlanDetail } from '../../../components/action-plans/ActionPlanDetail';

type StatusFilter = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'DONE';
type SourceFilter = 'ALL' | 'STANDALONE' | 'CARD';

export default function ActionPlansPage() {
  const [showNew, setShowNew] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [priorities, setPriorities] = useState<Set<ActionItemPriority>>(new Set());
  const [source, setSource] = useState<SourceFilter>('ALL');

  // Filtro de usuário — por padrão, já vem filtrado pelo usuário logado
  const [userFilter, setUserFilter] = useState<{ id: string; name: string } | null>(
    () => {
      const u = useAuthStore.getState().user;
      return u ? { id: u.id, name: u.name } : null;
    },
  );

  const { data: plans = [], refetch } = useQuery<ActionPlan[]>({
    queryKey: ['action-plans'],
    queryFn: () => actionPlansApi.list().then((r) => r.data),
  });

  const { data: dash } = useQuery<PlanDashboard>({
    queryKey: ['action-plans-dashboard'],
    queryFn: () => actionPlansApi.dashboard().then((r) => r.data),
  });

  function togglePriority(p: ActionItemPriority) {
    setPriorities((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }

  const filtered = plans.filter((p) => {
    if (filter !== 'ALL' && p.status !== filter) return false;
    if (source === 'STANDALONE' && p.indicatorId !== null) return false;
    if (source === 'CARD' && p.indicatorId === null) return false;

    const actions = p.initiatives?.flatMap((i) => i.actions ?? []) ?? [];
    if (priorities.size > 0 && !actions.some((a) => priorities.has(a.priority))) return false;
    if (userFilter) {
      // "Envolve o usuário": criou o plano OU é responsável por alguma ação
      const involved = p.userId === userFilter.id || actions.some((a) => a.ownerId === userFilter.id);
      if (!involved) return false;
    }
    return true;
  });

  const hasActiveFilters =
    filter !== 'ALL' || source !== 'ALL' || priorities.size > 0 || !!userFilter;

  function clearFilters() {
    setFilter('ALL');
    setSource('ALL');
    setPriorities(new Set());
    setUserFilter(null);
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

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {(['ALL', 'OPEN', 'IN_PROGRESS', 'DONE'] as const).map((s) => {
            const labels = { ALL: 'Todos', OPEN: 'Abertos', IN_PROGRESS: 'Em andamento', DONE: 'Concluídos' };
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-sm transition-all',
                  filter === s ? 'bg-white/10 text-white font-medium' : 'text-white/40 hover:text-white/70',
                )}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>

        {/* Usuário */}
        <UserFilter value={userFilter} onChange={setUserFilter} />

        {/* Prioridade (multi-seleção) */}
        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
          <span className="text-[10px] uppercase tracking-wider text-white/30 px-2">Prioridade</span>
          {(['HIGH', 'MEDIUM', 'LOW'] as ActionItemPriority[]).map((p) => {
            const active = priorities.has(p);
            const activeStyle: Record<ActionItemPriority, string> = {
              HIGH: 'bg-red-600 text-white',
              MEDIUM: 'bg-amber-500 text-white',
              LOW: 'bg-blue-600 text-white',
            };
            return (
              <button
                key={p}
                onClick={() => togglePriority(p)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                  active ? activeStyle[p] : 'text-white/40 hover:text-white/70',
                )}
              >
                {PRIORITY_LABEL[p].toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Origem (avulso / card) */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {(['ALL', 'STANDALONE', 'CARD'] as const).map((s) => {
            const labels = { ALL: 'Todos', STANDALONE: 'Planos avulsos', CARD: 'Planos de cards' };
            return (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-sm transition-all',
                  source === s ? 'bg-white/10 text-white font-medium' : 'text-white/40 hover:text-white/70',
                )}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-white/40 hover:text-white/80 border border-white/10 hover:border-white/20 transition-colors"
          >
            <X size={12} /> Limpar filtros
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

function UserFilter({ value, onChange }: {
  value: { id: string; name: string } | null;
  onChange: (u: { id: string; name: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data),
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center bg-white/5 rounded-xl">
        <button
          type="button"
          onClick={() => { setOpen((s) => !s); setSearch(''); }}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-left"
        >
          {value ? (
            <span className="text-white truncate max-w-[140px]">{value.name}</span>
          ) : (
            <span className="text-white/40">Selecionar usuário</span>
          )}
          <ChevronDown size={13} className="text-white/30 flex-shrink-0" />
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="px-2 py-1.5 text-white/30 hover:text-red-400 transition-colors"
            title="Limpar usuário"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-64 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
            <Search size={13} className="text-white/30 flex-shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar..."
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-xs text-white/30">Nenhum usuário encontrado.</p>
            )}
            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { onChange({ id: u.id, name: u.name }); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  {u.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/85 truncate">{u.name}</p>
                </div>
                {value?.id === u.id && <span className="text-purple-400 text-xs">✓</span>}
              </button>
            ))}
          </div>
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
