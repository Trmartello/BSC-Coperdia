'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { actionPlansApi } from '../../lib/api';
import { PLAN_STATUS_LABEL, PlanStatus } from '../../types/action-plan';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useEscClose } from '../../lib/useEscClose';

interface Props {
  indicatorId?: string;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

const STATUSES: PlanStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE'];

export function NewActionPlanModal({ indicatorId, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  useEscClose(onClose); // ESC fecha esta camada (a mais recente da pilha)
  const [form, setForm] = useState({ problem: '', description: '', status: 'OPEN' as PlanStatus });

  const mutation = useMutation({
    mutationFn: () =>
      actionPlansApi.create({ ...form, indicatorId }).then((r) => r.data),
    onSuccess: (plan) => {
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      toast.success('Plano de ação criado');
      onCreated?.(plan.id);
      onClose();
    },
    onError: () => toast.error('Erro ao criar plano'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/5">
          <h2 className="text-white font-semibold">Novo Plano de Ação</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Problema */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">
              Problema a resolver <span className="text-red-400">*</span>
            </label>
            <input
              value={form.problem}
              onChange={(e) => setForm((f) => ({ ...f, problem: e.target.value }))}
              placeholder="Problema a ser resolvido"
              className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none transition-colors"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Descrição <span className="text-white/25">(opcional)</span></label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="descrição do problema a ser resolvido"
              rows={3}
              className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none resize-none transition-colors"
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Status</label>
            <div className="relative">
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PlanStatus }))}
                className="w-full appearance-none bg-[#0d0f17] border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-colors cursor-pointer"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{PLAN_STATUS_LABEL[s]}</option>
                ))}
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none">▾</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.problem.trim() || mutation.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            <span>✓</span>
            {mutation.isPending ? 'Criando...' : 'Criar Plano'}
          </button>
        </div>
      </div>
    </div>
  );
}
