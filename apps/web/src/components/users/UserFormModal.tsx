'use client';

import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { usersApi } from '../../lib/api';
import { toast } from 'sonner';

const ROLES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'CONTROLADORIA', label: 'Controladoria' },
  { value: 'DIRETORIA', label: 'Diretoria' },
  { value: 'GESTOR', label: 'Gestor' },
];

interface Props {
  user?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function UserFormModal({ user, onClose, onSuccess }: Props) {
  const isEdit = !!user;

  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    role: user?.role ?? 'GESTOR',
    password: '',
    active: user?.active ?? true,
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? usersApi.update(user.id, form)
        : usersApi.create(form),
    onSuccess: () => {
      toast.success(isEdit ? 'Usuário atualizado' : 'Usuário criado');
      onSuccess();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erro ao salvar'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? 'Editar Usuário' : 'Novo Usuário'}
          </h2>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Nome */}
          <div>
            <label className="block text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5">Nome</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Nome completo"
              className="input-dark"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5">E-mail</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="email@coperdia.com.br"
              className="input-dark"
            />
          </div>

          {/* Perfil */}
          <div>
            <label className="block text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5">Perfil de acesso</label>
            <select
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              className="input-dark"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Senha */}
          <div>
            <label className="block text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5">
              {isEdit ? 'Nova senha (deixe em branco para manter)' : 'Senha inicial'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              placeholder={isEdit ? '••••••••' : 'Mínimo 8 caracteres'}
              className="input-dark"
            />
          </div>

          {/* Status */}
          {isEdit && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => set('active', !form.active)}
                className={`w-10 h-5 rounded-full transition-colors relative ${form.active ? 'bg-purple-600' : 'bg-white/10'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form.active ? 'left-5.5' : 'left-0.5'}`} style={{ left: form.active ? '22px' : '2px' }} />
              </button>
              <span className="text-sm text-white/60">{form.active ? 'Ativo' : 'Inativo'}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-white/5">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name || !form.email}
            className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm text-white font-medium disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar usuário'}
          </button>
        </div>
      </div>
    </div>
  );
}
