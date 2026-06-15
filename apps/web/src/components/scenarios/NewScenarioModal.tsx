'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { scenariosApi } from '../../lib/api';
import { toast } from 'sonner';

interface Props {
  period: string;            // período de referência do cenário (mês ativo)
  onClose: () => void;
  onCreated: (scenario: any) => void;
}

// Modal de criação rápida de cenário (acionado pela barra superior).
export function NewScenarioModal({ period, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      scenariosApi
        .create({ name: name.trim(), description: description.trim() || undefined, period })
        .then((r) => r.data),
    onSuccess: (scenario) => {
      qc.invalidateQueries({ queryKey: ['scenarios'] });
      toast.success('Cenário criado');
      onCreated(scenario);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erro ao criar cenário'),
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/5">
          <h2 className="text-white font-semibold">Novo Cenário</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">
              Nome do cenário <span className="text-red-400">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) createMut.mutate(); }}
              autoFocus
              placeholder="Ex: Cenário Otimista 2026"
              className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1.5 block">
              Descrição <span className="text-white/25">(opcional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Premissas do cenário..."
              className="w-full bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none resize-none transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-white/60 border border-white/10 hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => createMut.mutate()}
            disabled={!name.trim() || createMut.isPending}
            className="px-5 py-2 rounded-xl text-sm bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            {createMut.isPending ? 'Criando...' : 'Criar Cenário'}
          </button>
        </div>
      </div>
    </div>
  );
}
