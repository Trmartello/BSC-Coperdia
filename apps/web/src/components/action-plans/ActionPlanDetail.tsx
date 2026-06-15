'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown, ChevronRight, Plus, X,
  Calendar, User, CheckSquare, Trash2,
} from 'lucide-react';
import { actionPlansApi } from '../../lib/api';
import {
  ActionPlan, Initiative, ActionItem,
  PLAN_STATUS_LABEL, PLAN_STATUS_COLOR,
  INITIATIVE_STATUS_LABEL,
  ACTION_STATUS_LABEL, ACTION_STATUS_COLOR,
  PRIORITY_LABEL, PRIORITY_COLOR,
  ActionItemPriority, ActionItemStatus, PlanStatus,
} from '../../types/action-plan';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { NewInitiativeModal } from './NewInitiativeModal';
import { NewActionItemModal } from './NewActionItemModal';
import { ActionItemDetailModal } from './ActionItemDetailModal';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface Props {
  planId: string;
  onClose?: () => void;
  asPanel?: boolean; // true = painel lateral, false = página cheia
  embedded?: boolean; // true = sem cabeçalho do problema, fluindo no container pai (uso dentro de indicador)
  autoNewInitiative?: boolean; // abre o modal de nova iniciativa ao montar
}

export function ActionPlanDetail({ planId, onClose, asPanel, embedded, autoNewInitiative }: Props) {
  const qc = useQueryClient();
  const [expandedInits, setExpandedInits] = useState<Set<string>>(new Set());
  const [showNewInit, setShowNewInit] = useState(false);
  const [newActionFor, setNewActionFor] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);
  // Confirmação de exclusão (ação / iniciativa / plano)
  const [confirm, setConfirm] = useState<null | { message: string; confirmLabel: string; onConfirm: () => void }>(null);

  const { data: plan, isLoading } = useQuery<ActionPlan>({
    queryKey: ['action-plan', planId],
    queryFn: () => actionPlansApi.get(planId).then((r) => r.data),
  });

  // Atualiza todas as views afetadas (painel, listas, dashboard e cards do mapa)
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['action-plan', planId] });
    qc.invalidateQueries({ queryKey: ['action-plans'] });
    qc.invalidateQueries({ queryKey: ['action-plans-dashboard'] });
    qc.invalidateQueries({ queryKey: ['map'] });
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
    mutationFn: () => actionPlansApi.delete(planId),
    onSuccess: () => { invalidateAll(); setConfirm(null); toast.success('Plano excluído'); onClose?.(); },
    onError: () => toast.error('Erro ao excluir plano'),
  });

  // ── Aberturas de confirmação (mensagens cientes da cascata) ─────────────────
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
      ? {
          message: 'Esta iniciativa possui ações vinculadas. Ao excluir esta iniciativa, todas as ações relacionadas também serão permanentemente removidas. Deseja continuar?',
          confirmLabel: 'Excluir tudo',
          onConfirm: () => deleteInitMut.mutate(ini.id),
        }
      : {
          message: 'Tem certeza que deseja excluir esta iniciativa?',
          confirmLabel: 'Excluir',
          onConfirm: () => deleteInitMut.mutate(ini.id),
        });
  }
  function confirmDeletePlan() {
    const hasInit = (plan?.initiatives?.length ?? 0) > 0;
    setConfirm(hasInit
      ? {
          message: 'Este plano possui iniciativas e ações vinculadas. Ao excluir este plano, todas as iniciativas e todas as ações relacionadas serão permanentemente removidas. Deseja continuar?',
          confirmLabel: 'Excluir tudo',
          onConfirm: () => deletePlanMut.mutate(),
        }
      : {
          message: 'Tem certeza que deseja excluir este plano?',
          confirmLabel: 'Excluir',
          onConfirm: () => deletePlanMut.mutate(),
        });
  }

  // Abre automaticamente "Nova Iniciativa" quando solicitado (ex.: plano recém-criado)
  React.useEffect(() => {
    if (autoNewInitiative) setShowNewInit(true);
  }, [autoNewInitiative]);

  function toggleInit(id: string) {
    setExpandedInits((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Auto-expand all on first load
  React.useEffect(() => {
    if (plan?.initiatives) {
      setExpandedInits(new Set(plan.initiatives.map((i) => i.id)));
    }
  }, [plan?.id]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (!plan) return null;

  const statusStyle = PLAN_STATUS_COLOR[plan.status];
  const allActions = plan.initiatives?.flatMap((i) => i.actions ?? []) ?? [];
  const doneCount = allActions.filter((a) => a.status === 'DONE').length;

  return (
    <>
      <div className={cn('flex flex-col', embedded ? '' : asPanel ? 'h-full' : 'min-h-screen')}>
        {/* ── Plan Header (oculto no modo embutido — problema implícito do indicador) ── */}
        {!embedded && (
          <div className={cn('px-6 pt-5 pb-4', asPanel && 'border-b border-white/5')}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-white font-semibold text-base leading-snug">{plan.problem}</h2>
                {plan.description && (
                  <p className="text-sm text-white/40 mt-0.5">{plan.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={confirmDeletePlan}
                  title="Excluir plano"
                  className="text-white/30 hover:text-red-400 transition-colors p-1"
                >
                  <Trash2 size={16} />
                </button>
                {onClose && (
                  <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-3">
              <span className={cn('text-xs px-3 py-1 rounded-full border font-medium flex items-center gap-1.5', statusStyle)}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {PLAN_STATUS_LABEL[plan.status]}
              </span>
              {plan.indicator && (
                <span className="text-xs text-white/30 font-mono">
                  {plan.indicator.code} · {plan.indicator.name}
                </span>
              )}
              {allActions.length > 0 && (
                <span className="text-xs text-white/30 ml-auto">
                  {doneCount}/{allActions.length} concluídas
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Initiatives ── */}
        <div className={cn('space-y-3', embedded ? '' : 'flex-1 overflow-y-auto px-6 py-4')}>
          {(plan.initiatives ?? []).map((initiative) => {
            const isOpen = expandedInits.has(initiative.id);
            const actions = initiative.actions ?? [];
            const doneActs = actions.filter((a) => a.status === 'DONE').length;

            return (
              <div key={initiative.id} className="rounded-2xl border border-white/8 bg-white/2 overflow-hidden">
                {/* Initiative header */}
                <div className="group/ini flex items-center hover:bg-white/3 transition-colors">
                  <button
                    onClick={() => toggleInit(initiative.id)}
                    className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <div className="text-white/40 flex-shrink-0">
                      {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white/85">{initiative.title}</p>
                      {initiative.description && (
                        <p className="text-xs text-white/35 mt-0.5 truncate">{initiative.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-white/30 flex-shrink-0">{doneActs}/{actions.length} ações</span>
                    <span className={cn(
                      'text-[10px] px-2.5 py-1 rounded-full border font-medium flex-shrink-0',
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
                    className="px-3 self-stretch text-white/25 hover:text-red-400 opacity-0 group-hover/ini:opacity-100 transition-all flex-shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Action items */}
                {isOpen && (
                  <div className="border-t border-white/5">
                    {actions.map((item) => (
                      <ActionRow
                        key={item.id}
                        item={item}
                        onClick={() => setSelectedAction(item)}
                        onDelete={() => confirmDeleteAction(item)}
                      />
                    ))}

                    {/* Add action button */}
                    <button
                      onClick={() => setNewActionFor(initiative.id)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/30 hover:text-white/60 hover:bg-white/3 transition-colors"
                    >
                      <Plus size={13} />
                      Adicionar ação
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* New Initiative button */}
          <button
            onClick={() => setShowNewInit(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-white/15 hover:border-white/30 text-sm text-white/40 hover:text-white/70 transition-all"
          >
            <Plus size={14} />
            Nova Iniciativa
          </button>
        </div>
      </div>

      {/* Modals */}
      {showNewInit && (
        <NewInitiativeModal planId={planId} onClose={() => setShowNewInit(false)} />
      )}
      {newActionFor && (
        <NewActionItemModal
          initiativeId={newActionFor}
          planId={planId}
          onClose={() => setNewActionFor(null)}
        />
      )}
      {selectedAction && plan && (
        <ActionItemDetailModal
          plan={plan}
          action={selectedAction}
          onClose={() => setSelectedAction(null)}
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

// ─── Action Row ────────────────────────────────────────────────────────────────

function ActionRow({ item, onClick, onDelete }: { item: ActionItem; onClick: () => void; onDelete: () => void }) {
  const priorityColor = PRIORITY_COLOR[item.priority as ActionItemPriority] ?? 'text-white/50';
  const statusStyle = ACTION_STATUS_COLOR[item.status as ActionItemStatus] ?? '';

  return (
    <div className="group/act flex items-center border-t border-white/3 hover:bg-white/3 transition-colors">
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left">
        {/* Checkbox visual */}
        <div className={cn(
          'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center',
          item.status === 'DONE' ? 'bg-emerald-500 border-emerald-500' : 'border-white/20',
        )}>
          {item.status === 'DONE' && <CheckSquare size={10} className="text-white" />}
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', item.status === 'DONE' ? 'line-through text-white/30' : 'text-white/80')}>
            {item.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn('text-[10px] font-bold', priorityColor)}>
              {PRIORITY_LABEL[item.priority as ActionItemPriority]}
            </span>
            {item.dueDate && (
              <span className="flex items-center gap-0.5 text-[10px] text-white/30">
                <Calendar size={9} />
                {format(new Date(item.dueDate), 'dd/MM/yyyy')}
              </span>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-24 h-1.5 bg-white/8 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full', item.progress === 100 ? 'bg-emerald-500' : 'bg-purple-500')}
              style={{ width: `${item.progress}%` }}
            />
          </div>
          <span className="text-[10px] text-white/30 w-6 text-right">{item.progress}%</span>
        </div>

        {/* Status badge */}
        <span className={cn('text-[10px] px-2.5 py-1 rounded-lg border font-medium flex-shrink-0', statusStyle)}>
          {ACTION_STATUS_LABEL[item.status as ActionItemStatus]}
        </span>
      </button>

      {/* Delete action */}
      <button
        onClick={onDelete}
        title="Excluir ação"
        className="px-3 self-stretch text-white/25 hover:text-red-400 opacity-0 group-hover/act:opacity-100 transition-all flex-shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
