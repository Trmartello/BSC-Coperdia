'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Search, Shield, UserCheck, UserX, Pencil, Trash2 } from 'lucide-react';
import { usersApi } from '../../../lib/api';
import { cn } from '../../../lib/utils';
import { UserFormModal } from '../../../components/users/UserFormModal';
import { toast } from 'sonner';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Admin',
  CONTROLADORIA: 'Controladoria',
  DIRETORIA: 'Diretoria',
  GESTOR: 'Gestor',
};

const ROLE_COLOR: Record<string, string> = {
  ADMIN: 'bg-red-500/10 text-red-400 border-red-500/20',
  CONTROLADORIA: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  DIRETORIA: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  GESTOR: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => usersApi.toggleActive(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Status atualizado'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('Usuário removido'); },
  });

  const filtered = (users as any[]).filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  const active = (users as any[]).filter((u) => u.active).length;
  const inactive = (users as any[]).length - active;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Gestão de Usuários</h1>
          <p className="text-sm text-white/40 mt-0.5">Gerencie os acessos ao sistema</p>
        </div>
        <button
          onClick={() => { setEditingUser(null); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm text-white font-medium transition-colors"
        >
          <Plus size={14} />
          Novo usuário
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: (users as any[]).length, icon: Users, color: 'text-white' },
          { label: 'Ativos', value: active, icon: UserCheck, color: 'text-emerald-400' },
          { label: 'Inativos', value: inactive, icon: UserX, color: 'text-red-400' },
        ].map((stat) => (
          <div key={stat.label} className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-4 flex items-center gap-4">
            <stat.icon size={20} className={stat.color} />
            <div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-white/40">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl overflow-hidden">
        {/* Search bar */}
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <Search size={15} className="text-white/30 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-white/30 text-sm">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-white/30 text-sm">Nenhum usuário encontrado.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['Usuário', 'E-mail', 'Perfil', 'Status', 'Planos', 'Ações'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-white/30 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((user: any) => (
                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                  {/* User */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-300 text-xs font-bold flex-shrink-0">
                        {user.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <span className="text-sm text-white/80 font-medium">{user.name}</span>
                    </div>
                  </td>
                  {/* Email */}
                  <td className="px-4 py-3 text-sm text-white/50">{user.email}</td>
                  {/* Role */}
                  <td className="px-4 py-3">
                    <span className={cn('text-[10px] px-2 py-0.5 rounded-full border font-medium', ROLE_COLOR[user.role] ?? ROLE_COLOR.GESTOR)}>
                      <Shield size={9} className="inline mr-1" />
                      {ROLE_LABEL[user.role] ?? user.role}
                    </span>
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border font-medium',
                      user.active
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-white/5 text-white/30 border-white/10',
                    )}>
                      {user.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  {/* Plans count */}
                  <td className="px-4 py-3 text-sm text-white/40">
                    {user._count?.actionPlans ?? 0}
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditingUser(user); setShowModal(true); }}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => toggleMutation.mutate(user.id)}
                        className={cn(
                          'p-1.5 rounded-lg hover:bg-white/5 transition-colors',
                          user.active ? 'text-emerald-400/50 hover:text-emerald-400' : 'text-white/30 hover:text-white/60',
                        )}
                        title={user.active ? 'Desativar' : 'Ativar'}
                      >
                        {user.active ? <UserCheck size={13} /> : <UserX size={13} />}
                      </button>
                      <button
                        onClick={() => { if (confirm('Remover usuário?')) deleteMutation.mutate(user.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-colors"
                        title="Remover"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <UserFormModal
          user={editingUser}
          onClose={() => setShowModal(false)}
          onSuccess={() => { qc.invalidateQueries({ queryKey: ['users'] }); setShowModal(false); }}
        />
      )}
    </div>
  );
}
