'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, LayoutGrid, TrendingUp, AlertTriangle, CheckCircle2,
  X, ChevronDown, ChevronRight, Search, Check, Trash2, Calendar, CheckSquare,
} from 'lucide-react';
import { actionPlansApi, usersApi, mapsApi } from '../../../lib/api';
import {
  ActionPlan, Initiative, ActionItem,
  PLAN_STATUS_LABEL, PLAN_STATUS_COLOR,
  INITIATIVE_STATUS_LABEL,
  ACTION_STATUS_LABEL, ACTION_STATUS_COLOR,
  PRIORITY_LABEL, PRIORITY_COLOR,
  ActionItemPriority, ActionItemStatus, PlanDashboard,
} from '../../../types/action-plan';
import { cn } from '../../../lib/utils';
import { useAuthStore } from '../../../store/auth.store';
import { useActionPlanIntent } from '../../../store/action-plan-intent.store';
import { NewActionPlanModal } from '../../../components/action-plans/NewActionPlanModal';
import { NewInitiativeModal } from '../../../components/action-plans/NewInitiativeModal';
import { NewActionItemModal } from '../../../components/action-plans/NewActionItemModal';
import { ActionItemDetailModal } from '../../../components/action-plans/ActionItemDetailModal';
import { ActionPlanDetail } from '../../../components/action-plans/ActionPlanDetail';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { format } from 'date-fns';
import { toast } from 'sonner';

// ─── Active filter context passed into expandable rows ────────────────────────

interface ActionFilters {
  statuses: Set<string>;
  priorities: Set<string>;
  userIds: Set<string>;
}

/** Returns true if the action matches all active action-level filters */
function matchAction(action: ActionItem, filters: ActionFilters): boolean {
  if (filters.statuses.size > 0 && !filters.statuses.has(action.status)) return false;
  if (filters.priorities.size > 0 && !filters.priorities.has(action.priority)) return false;
  if (filters.userIds.size > 0) {
    // Usuário envolvido = responsável (ownerId) OU criador (userId) da ação
    const matchesUser =
      (action.ownerId != null && filters.userIds.has(action.ownerId)) ||
      (action.userId != null && filters.userIds.has(action.userId));
    if (!matchesUser) return false;
  }
  return true;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActionPlansPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  // Alvos abertos a partir dos alertas do sino (via store reativo)
  const { offTrackIndicatorId, editActionItemId, clear: clearIntent } = useActionPlanIntent();
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [deepAction, setDeepAction] = useState<{ plan: ActionPlan; action: ActionItem } | null>(null);

  // All filters are multi-select Sets (empty = "all")
  const [statuses, setStatuses] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Set<string>>(new Set());
  const [priorities, setPriorities] = useState<Set<string>>(new Set());
  const [mapIds, setMapIds] = useState<Set<string>>(new Set());
  const [userIds, setUserIds] = useState<Set<string>>(() => {
    const u = useAuthStore.getState().user;
    return new Set(u ? [u.id] : []);
  });

  // Filtros de ação são enviados ao servidor para filtragem no banco de dados.
  // O queryKey inclui os filtros para re-fetch automático quando mudam.
  const actionFilterParams = {
    priorities: statuses.size > 0 || priorities.size > 0 || userIds.size > 0
      ? (priorities.size > 0 ? [...priorities] : undefined)
      : undefined,
    statuses: statuses.size > 0 ? [...statuses] : undefined,
    ownerOrCreatorIds: userIds.size > 0 ? [...userIds] : undefined,
  };

  const { data: plans = [], refetch } = useQuery<ActionPlan[]>({
    queryKey: ['action-plans', actionFilterParams],
    queryFn: () => actionPlansApi.list({
      priorities: actionFilterParams.priorities,
      statuses: actionFilterParams.statuses,
      ownerOrCreatorIds: actionFilterParams.ownerOrCreatorIds,
    }).then((r) => r.data),
  });

  // Total sem filtros (para exibir "X de Y planos")
  const { data: allPlans = [] } = useQuery<ActionPlan[]>({
    queryKey: ['action-plans', {}],
    queryFn: () => actionPlansApi.list().then((r) => r.data),
    staleTime: 30_000,
  });

  // OFF_TRACK (sino): garante o plano do indicador (existente ou um em branco)
  // e abre o editor do plano.
  const ensurePlan = useMutation({
    mutationFn: (indicatorId: string) => actionPlansApi.ensureForIndicator(indicatorId).then((r) => r.data),
    onSuccess: (plan: any) => {
      setEditPlanId(plan.id);
      qc.invalidateQueries({ queryKey: ['action-plans'], exact: false });
    },
    onError: () => toast.error('Não foi possível abrir o plano de ação'),
  });

  useEffect(() => {
    if (!offTrackIndicatorId) return;
    const id = offTrackIndicatorId;
    clearIntent();
    ensurePlan.mutate(id);
  }, [offTrackIndicatorId]);

  // OVERDUE (sino): abre o formulário de edição da ação localizando-a nos dados.
  useEffect(() => {
    if (!editActionItemId) return;
    if (allPlans.length === 0) return; // aguarda o carregamento dos planos
    const wanted = editActionItemId;
    for (const p of allPlans) {
      for (const init of p.initiatives ?? []) {
        const act = (init.actions ?? []).find((a) => a.id === wanted);
        if (act) {
          setDeepAction({ plan: p, action: act });
          clearIntent();
          return;
        }
      }
    }
    clearIntent(); // ação não encontrada (ex.: filtro) — evita loop
  }, [editActionItemId, allPlans]);

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

  // Union of indicatorIds for selected maps
  const selectedMapIndicators = React.useMemo(() => {
    if (mapIds.size === 0) return null;
    const set = new Set<string>();
    for (const m of maps) {
      if (mapIds.has(m.id)) for (const e of m.entries ?? []) set.add(e.indicatorId);
    }
    return set;
  }, [mapIds, maps]);

  const actionFilters: ActionFilters = { statuses, priorities, userIds };

  // Filtros de ação (prioridade, status, usuário) já foram aplicados no servidor.
  // Aqui só aplicamos filtros de nível de plano: origem e mapa.
  const filtered = plans.filter((p) => {
    if (sources.size > 0) {
      const isStandalone = p.indicatorId === null;
      const ok = (sources.has('STANDALONE') && isStandalone) || (sources.has('CARD') && !isStandalone);
      if (!ok) return false;
    }
    if (selectedMapIndicators && (!p.indicatorId || !selectedMapIndicators.has(p.indicatorId))) return false;
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

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white font-semibold text-lg">Plano de Ação</h1>
          <p className="text-white/40 text-sm">
            {hasActiveFilters
              ? `${filtered.length} de ${allPlans.length} planos`
              : `${allPlans.length} planos cadastrados`}
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
          <DashCard icon={<LayoutGrid size={16} className="text-blue-400" />} label="Em aberto" value={dash.open} color="text-blue-400" />
          <DashCard icon={<CheckCircle2 size={16} className="text-emerald-400" />} label="Concluídas" value={dash.done} color="text-emerald-400" />
          <DashCard icon={<AlertTriangle size={16} className="text-red-400" />} label="Atrasadas" value={dash.overdue} color="text-red-400" />
          <DashCard icon={<TrendingUp size={16} className="text-purple-400" />} label="Progresso médio" value={`${dash.avgProgress}%`} color="text-purple-400" />
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <MultiFilter
          label="Status"
          allLabel="Todos"
          selected={statuses}
          onToggle={(v) => setStatuses((p) => toggleSet(p, v))}
          onClear={() => setStatuses(new Set())}
          options={[
            { value: 'PENDING',     label: 'Pendente',       dot: 'bg-slate-400',   valueClass: 'text-slate-300' },
            { value: 'IN_PROGRESS', label: 'Em andamento',   dot: 'bg-amber-400',   valueClass: 'text-amber-300' },
            { value: 'DONE',        label: 'Concluída',      dot: 'bg-emerald-400', valueClass: 'text-emerald-300' },
            { value: 'OVERDUE',     label: 'Atrasada',       dot: 'bg-red-400',     valueClass: 'text-red-300' },
            { value: 'CANCELLED',   label: 'Cancelada',      dot: 'bg-slate-600',   valueClass: 'text-slate-500' },
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
            { value: 'CARD',       label: 'Planos de cards' },
          ]}
        />

        <MultiFilter
          label="Prioridade"
          allLabel="Todas"
          selected={priorities}
          onToggle={(v) => setPriorities((p) => toggleSet(p, v))}
          onClear={() => setPriorities(new Set())}
          options={[
            { value: 'HIGH',   label: 'Alta',  dot: 'bg-red-400',   valueClass: 'text-red-400' },
            { value: 'MEDIUM', label: 'Média', dot: 'bg-amber-400', valueClass: 'text-amber-400' },
            { value: 'LOW',    label: 'Baixa', dot: 'bg-blue-400',  valueClass: 'text-blue-400' },
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

      {/* ── Plans accordion list ── */}
      <div className="space-y-2">
        {filtered.map((plan) => (
          <ExpandablePlanRow
            key={plan.id}
            plan={plan}
            actionFilters={actionFilters}
            hasActionFilters={statuses.size > 0 || priorities.size > 0 || userIds.size > 0}
            onUpdated={refetch}
          />
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
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['action-plans'], exact: false });
            qc.invalidateQueries({ queryKey: ['action-plans-dashboard'] });
          }}
        />
      )}

      {/* Editor de plano aberto a partir de um alerta "Fora da meta" */}
      {editPlanId && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setEditPlanId(null)} />
          <div className="w-[480px] max-w-full bg-[#1a1f2e] border-l border-white/10 shadow-2xl overflow-y-auto">
            <ActionPlanDetail
              planId={editPlanId}
              asPanel
              onClose={() => {
                setEditPlanId(null);
                qc.invalidateQueries({ queryKey: ['action-plans'], exact: false });
                qc.invalidateQueries({ queryKey: ['action-plans-dashboard'] });
              }}
            />
          </div>
        </div>
      )}

      {deepAction && (
        <ActionItemDetailModal
          plan={deepAction.plan}
          action={deepAction.action}
          onClose={() => {
            setDeepAction(null);
            qc.invalidateQueries({ queryKey: ['action-plans'], exact: false });
            qc.invalidateQueries({ queryKey: ['action-plans-dashboard'] });
          }}
        />
      )}
    </div>
  );
}

// ─── Expandable plan row ───────────────────────────────────────────────────────

function ExpandablePlanRow({
  plan,
  actionFilters,
  hasActionFilters,
  onUpdated,
}: {
  plan: ActionPlan;
  actionFilters: ActionFilters;
  hasActionFilters: boolean;
  onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [expandedInits, setExpandedInits] = useState<Set<string>>(new Set());
  const [showNewInit, setShowNewInit] = useState(false);
  const [newActionFor, setNewActionFor] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<{ action: ActionItem } | null>(null);
  const [confirm, setConfirm] = useState<null | { message: string; confirmLabel: string; onConfirm: () => void }>(null);

  const invalidateAll = () => {
    // Invalida todas as variantes do cache de planos (com e sem filtros)
    qc.invalidateQueries({ queryKey: ['action-plans'], exact: false });
    qc.invalidateQueries({ queryKey: ['action-plans-dashboard'] });
    qc.invalidateQueries({ queryKey: ['map'] });
    onUpdated();
  };

  const deleteActionMut = useMutation({
    mutationFn: (id: string) => actionPlansApi.deleteAction(id),
    onSuccess: () => { invalidateAll(); setConfirm(null); toast.success('Ação excluída'); },
    onError: () => toast.error('Erro ao excluir ação'),
  });
  const deleteInitMut = useMutation({
    mutationFn: (id: string) => actionPlansApi.deleteInitiative(id),
    onSuccess: () => { invalidateAll(); setConfirm(null); toast.success('Iniciativa excluída'); },
    onError: () => toast.error('Erro ao excluir iniciativa'),
  });
  const deletePlanMut = useMutation({
    mutationFn: () => actionPlansApi.delete(plan.id),
    onSuccess: () => { invalidateAll(); setConfirm(null); toast.success('Plano excluído'); },
    onError: () => toast.error('Erro ao excluir plano'),
  });

  function confirmDeleteAction(a: ActionItem) {
    setConfirm({
      message: 'Tem certeza que deseja excluir esta ação? Esta operação não poderá ser desfeita.',
      confirmLabel: 'Excluir',
      onConfirm: () => deleteActionMut.mutate(a.id),
    });
  }
  function confirmDeleteInitiative(ini: Initiative) {
    const n = ini.actions?.length ?? 0;
    setConfirm(n > 0
      ? { message: 'Esta iniciativa possui ações vinculadas. Ao excluir, todas as ações também serão removidas.', confirmLabel: 'Excluir tudo', onConfirm: () => deleteInitMut.mutate(ini.id) }
      : { message: 'Tem certeza que deseja excluir esta iniciativa?', confirmLabel: 'Excluir', onConfirm: () => deleteInitMut.mutate(ini.id) });
  }
  function confirmDeletePlan() {
    const hasInit = (plan.initiatives?.length ?? 0) > 0;
    setConfirm(hasInit
      ? { message: 'Este plano possui iniciativas e ações vinculadas. Ao excluir, tudo será removido permanentemente.', confirmLabel: 'Excluir tudo', onConfirm: () => deletePlanMut.mutate() }
      : { message: 'Tem certeza que deseja excluir este plano?', confirmLabel: 'Excluir', onConfirm: () => deletePlanMut.mutate() });
  }

  function toggleInit(id: string) {
    setExpandedInits((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // When expanding, auto-open all initiatives
  function handleToggleExpand() {
    if (!expanded && plan.initiatives) {
      setExpandedInits(new Set(plan.initiatives.map((i) => i.id)));
    }
    setExpanded((v) => !v);
  }

  const allActions = plan.initiatives?.flatMap((i) => i.actions ?? []) ?? [];
  const doneCount = allActions.filter((a) => a.status === 'DONE').length;
  const avgProgress = allActions.length
    ? Math.round(allActions.reduce((s, a) => s + (a.progress ?? 0), 0) / allActions.length)
    : 0;

  // Filter initiatives and actions — apply action-level filters only when active
  const visibleInitiatives = (plan.initiatives ?? []).filter((ini) => {
    if (!hasActionFilters) return true;
    return (ini.actions ?? []).some((a) => matchAction(a, actionFilters));
  });

  return (
    <>
      <div className="rounded-2xl border border-white/8 bg-[#1a1f2e] overflow-hidden">
        {/* Plan header row */}
        <div className="group/plan flex items-center hover:bg-white/2 transition-colors">
          <button
            onClick={handleToggleExpand}
            className="flex-1 min-w-0 flex items-center gap-3 px-4 py-4 text-left"
          >
            <div className="text-white/40 flex-shrink-0">
              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
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
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/25">
                <span>{plan.initiatives?.length ?? 0} iniciativas</span>
                <span>{doneCount}/{allActions.length} ações</span>
              </div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-3">
              <span className="text-xs text-white/40">{avgProgress}%</span>
              <div className="w-20 h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${avgProgress}%` }} />
              </div>
            </div>
          </button>
          <button
            onClick={confirmDeletePlan}
            title="Excluir plano"
            className="px-3 self-stretch text-white/25 hover:text-red-400 opacity-0 group-hover/plan:opacity-100 transition-all flex-shrink-0"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Expanded content: initiatives → actions */}
        {expanded && (
          <div className="border-t border-white/5 px-4 py-3 space-y-2">
            {visibleInitiatives.map((initiative) => {
              const isOpen = expandedInits.has(initiative.id);
              const allInitActions = initiative.actions ?? [];
              const visibleActions = hasActionFilters
                ? allInitActions.filter((a) => matchAction(a, actionFilters))
                : allInitActions;
              const doneActs = allInitActions.filter((a) => a.status === 'DONE').length;

              return (
                <div key={initiative.id} className="rounded-xl border border-white/6 bg-white/[0.015] overflow-hidden">
                  {/* Initiative header */}
                  <div className="group/ini flex items-center hover:bg-white/3 transition-colors">
                    <button
                      onClick={() => toggleInit(initiative.id)}
                      className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <div className="text-white/35 flex-shrink-0">
                        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white/75">{initiative.title}</p>
                        {initiative.description && (
                          <p className="text-[11px] text-white/30 mt-0.5 truncate">{initiative.description}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-white/25 flex-shrink-0">
                        {hasActionFilters ? `${visibleActions.length} de ${allInitActions.length}` : `${doneActs}/${allInitActions.length}`} ações
                      </span>
                      <span className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0',
                        initiative.status === 'DONE' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                        : initiative.status === 'IN_PROGRESS' ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                        : 'bg-blue-500/15 text-blue-400 border-blue-500/25',
                      )}>
                        {INITIATIVE_STATUS_LABEL[initiative.status]}
                      </span>
                    </button>
                    <button
                      onClick={() => confirmDeleteInitiative(initiative)}
                      title="Excluir iniciativa"
                      className="px-2.5 self-stretch text-white/20 hover:text-red-400 opacity-0 group-hover/ini:opacity-100 transition-all flex-shrink-0"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Filtered actions */}
                  {isOpen && (
                    <div className="border-t border-white/4">
                      {visibleActions.map((item) => (
                        <ActionRow
                          key={item.id}
                          item={item}
                          onClick={() => setSelectedAction({ action: item })}
                          onDelete={() => confirmDeleteAction(item)}
                        />
                      ))}
                      {visibleActions.length === 0 && (
                        <p className="px-4 py-3 text-[11px] text-white/25">Nenhuma ação atende aos filtros.</p>
                      )}
                      <button
                        onClick={() => setNewActionFor(initiative.id)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-white/30 hover:text-white/60 hover:bg-white/3 transition-colors"
                      >
                        <Plus size={12} /> Adicionar ação
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {visibleInitiatives.length === 0 && (plan.initiatives?.length ?? 0) > 0 && (
              <p className="text-[11px] text-white/25 py-1">Nenhuma iniciativa atende aos filtros ativos.</p>
            )}

            {/* New initiative button */}
            <button
              onClick={() => setShowNewInit(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/10 hover:border-white/25 text-xs text-white/35 hover:text-white/65 transition-all"
            >
              <Plus size={12} /> Nova Iniciativa
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewInit && (
        <NewInitiativeModal planId={plan.id} onClose={() => { setShowNewInit(false); invalidateAll(); }} />
      )}
      {newActionFor && (
        <NewActionItemModal
          initiativeId={newActionFor}
          planId={plan.id}
          onClose={() => { setNewActionFor(null); invalidateAll(); }}
        />
      )}
      {selectedAction && (
        <ActionItemDetailModal
          plan={plan}
          action={selectedAction.action}
          onClose={() => { setSelectedAction(null); invalidateAll(); }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          loading={deleteActionMut.isPending || deleteInitMut.isPending || deletePlanMut.isPending}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

// ─── Action row ───────────────────────────────────────────────────────────────

function ActionRow({ item, onClick, onDelete }: { item: ActionItem; onClick: () => void; onDelete: () => void }) {
  const priorityColor = PRIORITY_COLOR[item.priority as ActionItemPriority] ?? 'text-white/50';
  const statusStyle = ACTION_STATUS_COLOR[item.status as ActionItemStatus] ?? '';

  return (
    <div className="group/act flex items-center border-t border-white/3 hover:bg-white/3 transition-colors">
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-2.5 text-left">
        {/* Checkbox visual */}
        <div className={cn(
          'w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center',
          item.status === 'DONE' ? 'bg-emerald-500 border-emerald-500' : 'border-white/20',
        )}>
          {item.status === 'DONE' && <CheckSquare size={9} className="text-white" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn('text-xs font-medium', item.status === 'DONE' ? 'line-through text-white/30' : 'text-white/75')}>
            {item.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-[10px] font-bold', priorityColor)}>
              {PRIORITY_LABEL[item.priority as ActionItemPriority]}
            </span>
            {item.ownerName && (
              <span className="text-[10px] text-white/30 truncate max-w-[120px]">{item.ownerName}</span>
            )}
            {item.dueDate && (
              <span className="flex items-center gap-0.5 text-[10px] text-white/25">
                <Calendar size={8} />
                {format(new Date(item.dueDate), 'dd/MM/yy')}
              </span>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-16 h-1 bg-white/8 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full', item.progress === 100 ? 'bg-emerald-500' : 'bg-purple-500')}
              style={{ width: `${item.progress}%` }}
            />
          </div>
          <span className="text-[10px] text-white/25 w-6 text-right">{item.progress}%</span>
        </div>

        {/* Status badge */}
        <span className={cn('text-[10px] px-2 py-0.5 rounded-lg border font-medium flex-shrink-0', statusStyle)}>
          {ACTION_STATUS_LABEL[item.status as ActionItemStatus]}
        </span>
      </button>

      <button
        onClick={onDelete}
        title="Excluir ação"
        className="px-2.5 self-stretch text-white/20 hover:text-red-400 opacity-0 group-hover/act:opacity-100 transition-all flex-shrink-0"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toggleSet(prev: Set<string>, v: string): Set<string> {
  const next = new Set(prev);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
}

function DashCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="card-dark p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-white/40">{label}</span></div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
    </div>
  );
}

// ─── MultiFilter ──────────────────────────────────────────────────────────────

interface MultiOption {
  value: string;
  label: string;
  sublabel?: string;
  dot?: string;
  valueClass?: string;
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
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        onClick={() => { setOpen((s) => !s); setSearch(''); }}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm border transition-colors',
          active
            ? 'bg-white/10 border-white/15 text-white'
            : 'bg-white/5 border-transparent text-white/60 hover:text-white/85 hover:bg-white/8',
          active ? 'rounded-l-lg rounded-r-none border-r-0' : 'rounded-lg',
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
      {active && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(); setOpen(false); }}
          className="flex items-center justify-center h-full px-1.5 py-1.5 bg-white/10 border border-white/15 rounded-r-lg text-white/40 hover:text-white hover:bg-white/15 transition-colors"
        >
          <X size={11} />
        </button>
      )}

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
          <div className="overflow-y-auto max-h-52">
            {visible.map((opt) => {
              const checked = selected.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onToggle(opt.value)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/5',
                    checked ? 'bg-white/5' : '',
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                    checked ? 'bg-purple-600 border-purple-600' : 'border-white/20',
                  )}>
                    {checked && <Check size={10} className="text-white" />}
                  </div>
                  {opt.dot && (
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', opt.dot)} />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className={cn('text-sm', opt.valueClass ?? 'text-white/75')}>{opt.label}</span>
                    {opt.sublabel && <p className="text-[10px] text-white/30 truncate">{opt.sublabel}</p>}
                  </div>
                </button>
              );
            })}
            {visible.length === 0 && (
              <p className="px-3 py-3 text-xs text-white/30 text-center">Nenhum resultado</p>
            )}
          </div>
          {active && (
            <div className="border-t border-white/5 px-3 py-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false); }}
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
