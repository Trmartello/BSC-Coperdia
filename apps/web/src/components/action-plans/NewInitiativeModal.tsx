'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { actionPlansApi } from '../../lib/api';
import { toast } from 'sonner';

interface Props {
  planId: string;
  onClose: () => void;
}

export function NewInitiativeModal({ planId, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: '', description: '' });

  const mutation = useMutation({
    mutationFn: () => actionPlansApi.createInitiative(planId, form).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plan', planId] });
      toast.success('Iniciativa criada');
      onClose();
    },
    onError: () => toast.error('Erro ao criar iniciativa'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/5">
          <h2 className="text-white font-semibold">Nova Iniciativa</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">
              Título da Iniciativa <span className="text-red-400">*</span>
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Iniciativa 01 para resolver o problema"
              autoFocus
              className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">Descrição <span className="text-white/25">(opcional)</span></label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descrição da iniciativa 01 para resolver o problema"
              rows={3}
              className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none resize-none transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-between px-6 pb-5">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.title.trim() || mutation.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            <span>✓</span>
            {mutation.isPending ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  );
}
