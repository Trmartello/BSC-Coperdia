'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../lib/api';
import { UserPlus, ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserFormModal } from '../users/UserFormModal';

interface SelectedUser {
  id: string;
  name: string;
}

interface Props {
  value: SelectedUser | null;
  onChange: (user: SelectedUser | null) => void;
  placeholder?: string;
}

export function UserSelector({ value, onChange, placeholder = 'Selecionar responsável' }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data),
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => { setOpen((s) => !s); setSearch(''); }}
          className="w-full flex items-center justify-between bg-white/5 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-2.5 text-sm text-left transition-colors hover:border-white/20"
        >
          {value ? (
            <span className="text-white truncate">{value.name}</span>
          ) : (
            <span className="text-white/25">{placeholder}</span>
          )}
          <ChevronDown size={14} className="text-white/30 flex-shrink-0 ml-2" />
        </button>

        {open && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
            {/* Search */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
              <Search size={13} className="text-white/30 flex-shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar usuário..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
              />
            </div>

            {/* User list */}
            <div className="max-h-48 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <p className="px-4 py-3 text-xs text-white/30">Nenhum usuário encontrado.</p>
              )}
              {filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { onChange({ id: u.id, name: u.name }); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {u.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/85 truncate">{u.name}</p>
                    <p className="text-[10px] text-white/35 truncate">{u.email}</p>
                  </div>
                  {value?.id === u.id && <Check size={13} className="text-purple-400 flex-shrink-0" />}
                </button>
              ))}
            </div>

            {/* Create new user */}
            <div className="border-t border-white/5 p-1.5">
              <button
                type="button"
                onClick={() => { setOpen(false); setShowCreate(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-purple-600/15 text-sm text-purple-300 transition-colors"
              >
                <UserPlus size={14} />
                Cadastrar novo usuário
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <UserFormModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['users'] });
            setShowCreate(false);
            // After creating, re-open selector so user can pick the new one
            setTimeout(() => setOpen(true), 100);
          }}
        />
      )}
    </>
  );
}
