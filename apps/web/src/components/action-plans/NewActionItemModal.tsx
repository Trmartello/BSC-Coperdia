'use client';

import React, { useRef, useState } from 'react';
import { X, CalendarDays } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { actionPlansApi } from '../../lib/api';
import {
  ActionItemPriority, ActionItemStatus,
  PRIORITY_LABEL,
} from '../../types/action-plan';
import { toast } from 'sonner';
import { UserSelector } from '../ui/UserSelector';
import { useEscClose } from '../../lib/useEscClose';
import { cn } from '../../lib/utils';

interface Props {
  initiativeId: string;
  planId: string;
  onClose: () => void;
  // Camada lateral direita (contexto do indicador): sobrepõe o painel de Plano
  // de Ação SEM backdrop — o gráfico à esquerda continua visível.
  asRightPanel?: boolean;
}

const PRIORITIES: ActionItemPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
// "No prazo"/"Atrasada" são automáticos pela data-limite: não são selecionáveis.
// No create a ação nasce PENDING (automático), exibido como item desabilitado.

export function NewActionItemModal({ initiativeId, planId, onClose, asRightPanel }: Props) {
  const qc = useQueryClient();
  const dateRef = useRef<HTMLInputElement>(null);
  useEscClose(onClose); // ESC fecha esta camada (a mais recente da pilha)
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'HIGH' as ActionItemPriority,
    status: 'PENDING' as ActionItemStatus,
    dueDate: '',
    ownerName: '',
    ownerId: '',
    progress: 0,
    observations: '',
  });
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      actionPlansApi.createAction(initiativeId, {
        ...form,
        ownerName: owner?.name ?? form.ownerName,
        ownerId: owner?.id ?? undefined,
      }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plan', planId] });
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      qc.invalidateQueries({ queryKey: ['action-plans-dashboard'] });
      toast.success('Ação criada');
      onClose();
    },
    onError: () => toast.error('Erro ao criar ação'),
  });

  const displayDate = form.dueDate
    ? new Date(form.dueDate + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' })
    : '';

  return (
    <div className={cn(
      asRightPanel
        // Camada 2 do lado direito: sem overlay/backdrop, gráfico visível à esquerda
        ? 'fixed inset-y-0 right-0 z-50 w-[50vw] min-w-[420px] max-w-[760px] slide-in-right'
        : 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
    )}>
      <div className={cn(
        'bg-[#1a1f2e] border-white/10 shadow-2xl flex flex-col',
        asRightPanel
          ? 'h-full w-full border-l'
          : 'border rounded-2xl w-full max-w-md mx-4 max-h-[90vh]',
      )}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/5 flex-shrink-0">
          <h2 className="text-white font-semibold">Nova Ação</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Título */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Título <span className="text-red-400">*</span></label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ação 01"
              autoFocus
              className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none transition-colors"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Descrição</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descrição da ação"
              rows={2}
              className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none resize-none transition-colors"
            />
          </div>

          {/* Prioridade + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Prioridade</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as ActionItemPriority }))}
                className="w-full appearance-none bg-[#0d0f17] border border-white/10 focus:border-purple-500 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none transition-colors"
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ActionItemStatus }))}
                className="w-full appearance-none bg-[#0d0f17] border border-white/10 focus:border-purple-500 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none transition-colors"
              >
                <option value="PENDING" disabled>No prazo (automático)</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="DONE">Concluída</option>
                <option value="CANCELLED">Cancelada</option>
                <option disabled>──────────</option>
                <option value="PAUSED">Pausada</option>
                <option value="AWAITING_VALIDATION">Aguardando validação</option>
              </select>
              <p className="text-[10px] text-white/30 mt-1">No prazo/Atrasada são definidos pela data-limite</p>
            </div>
          </div>

          {/* Prazo + Progresso */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Prazo</label>
              <div
                className="relative flex items-center bg-[#0d0f17] border border-white/10 hover:border-white/20 focus-within:border-purple-500 rounded-xl px-3 py-2.5 transition-colors cursor-pointer"
                onClick={() => dateRef.current?.showPicker?.()}
              >
                <span className="flex-1 text-sm text-white/80 select-none">
                  {displayDate || <span className="text-white/25">DD/MM/AAAA</span>}
                </span>
                <CalendarDays size={15} className="text-white/30 flex-shrink-0" />
                <input
                  ref={dateRef}
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  tabIndex={-1}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Progresso: {form.progress}%</label>
              <input
                type="range"
                min={0} max={100} step={5}
                value={form.progress}
                onChange={(e) => setForm((f) => ({ ...f, progress: Number(e.target.value) }))}
                className="w-full mt-2 accent-purple-500"
              />
            </div>
          </div>

          {/* Responsável */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Responsável</label>
            <UserSelector
              value={owner}
              onChange={setOwner}
              placeholder="Selecionar responsável"
            />
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Observações</label>
            <textarea
              value={form.observations}
              onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
              placeholder="Observação para executar a ação"
              rows={2}
              className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none resize-none transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-between px-6 pb-5 border-t border-white/5 pt-4 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.title.trim() || mutation.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            <span>✓</span>
            {mutation.isPending ? 'Criando...' : 'Criar Ação'}
          </button>
        </div>
      </div>
    </div>
  );
}
