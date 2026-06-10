'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown, ChevronRight, Plus, X,
  Calendar, User, CheckSquare,
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
import { NewInitiativeModal } from './NewInitiativeModal';
import { NewActionItemModal } from './NewActionItemModal';
import { ActionItemDetailModal } from './ActionItemDetailModal';

interface Props {
  planId: string;
  onClose?: () => void;
  asPanel?: boolean; // true = painel lateral, false = página cheia
}

export function ActionPlanDetail({ planId, onClose, asPanel }: Props) {
  const [expandedInits, setExpandedInits] = useState<Set<string>>(new Set());
  const [showNewInit, setShowNewInit] = useState(false);
  const [newActionFor, setNewActionFor] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionItem | null>(null);

  const { data: plan, isLoading } = useQuery<ActionPlan>({
    queryKey: ['action-plan', planId],
    queryFn: () => actionPlansApi.get(planId).then((r) => r.data),
  });

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
      <div className={cn('flex flex-col', asPanel ? 'h-full' : 'min-h-screen')}>
        {/* ── Plan Header ── */}
        <div className={cn('px-6 pt-5 pb-4', asPanel && 'border-b border-white/5')}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-semibold text-base leading-snug">{plan.problem}</h2>
              {plan.description && (
                <p className="text-sm text-white/40 mt-0.5">{plan.description}</p>
              )}
            </div>
            {onClose && (
              <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0">
                <X size={18} />
              </button>
            )}
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

        {/* ── Initiatives ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {(plan.initiatives ?? []).map((initiative) => {
            const isOpen = expandedInits.has(initiative.id);
            const actions = initiative.actions ?? [];
            const doneActs = actions.filter((a) => a.status === 'DONE').length;

            return (
              <div key={initiative.id} className="rounded-2xl border border-white/8 bg-white/2 overflow-hidden">
                {/* Initiative header */}
                <button
                  onClick={() => toggleInit(initiative.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left"
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

                {/* Action items */}
                {isOpen && (
                  <div className="border-t border-white/5">
                    {actions.map((item) => (
                      <ActionRow
                        key={item.id}
                        item={item}
                        onClick={() => setSelectedAction(item)}
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
    </>
  );
}

// ─── Action Row ────────────────────────────────────────────────────────────────

function ActionRow({ item, onClick }: { item: ActionItem; onClick: () => void }) {
  const priorityColor = PRIORITY_COLOR[item.priority as ActionItemPriority] ?? 'text-white/50';
  const statusStyle = ACTION_STATUS_COLOR[item.status as ActionItemStatus] ?? '';

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors border-t border-white/3 text-left group"
    >
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
  );
}
