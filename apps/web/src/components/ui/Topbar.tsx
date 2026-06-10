'use client';

import React from 'react';
import { useAuthStore } from '../../store/auth.store';
import { Bell } from 'lucide-react';

export function Topbar() {
  const { user } = useAuthStore();
  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'DR';

  return (
    <header className="h-14 border-b border-white/5 bg-[#0d0f17] flex items-center px-6 gap-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-white/40">
        <span>Copérdia</span>
        <span>/</span>
        <span className="text-white/70">BSC Copérdia</span>
      </div>

      <div className="flex-1" />

      {/* Right: notification + user */}
      <button className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white/80 transition-colors">
        <Bell size={15} />
      </button>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-xs text-white/70 font-medium">{user?.name ?? 'Diretor'}</p>
          <p className="text-[10px] text-white/30">{user?.role ?? 'Direção'}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold">
          {initials}
        </div>
      </div>
    </header>
  );
}
