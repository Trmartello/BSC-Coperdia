'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '../../../lib/api';
import { useAuthStore } from '../../../store/auth.store';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [form, setForm] = useState({ email: '', password: '' });

  const mutation = useMutation({
    mutationFn: () => authApi.login(form.email, form.password),
    onSuccess: ({ data }) => {
      login(data.user, data.accessToken);
      router.push('/dashboard/maps');
    },
    onError: () => toast.error('E-mail ou senha inválidos'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="min-h-screen bg-[#0d0f17] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-black text-base">
            C
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">COPÉRDIA</p>
            <p className="text-white/40 text-[11px]">BSC – Gestão de Indicadores</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-6 shadow-2xl">
          <h1 className="text-white font-semibold text-lg mb-1">Entrar</h1>
          <p className="text-white/40 text-sm mb-6">Acesse o painel de gestão</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@coperdia.com.br"
                autoFocus
                required
                className="input-dark"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-white/40 uppercase tracking-wider mb-1.5">
                Senha
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
                required
                className="input-dark"
              />
            </div>

            <button
              type="submit"
              disabled={mutation.isPending || !form.email || !form.password}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm text-white font-medium disabled:opacity-50 transition-colors mt-2"
            >
              {mutation.isPending ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        {/* Hint */}
        <p className="text-center text-[11px] text-white/20 mt-4">
          admin@coperdia.com.br · admin123
        </p>
      </div>
    </div>
  );
}
