'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/auth.store';
import {
  ClipboardList,
  Users,
  ChevronRight,
  Network,
  LayoutDashboard,
  Layers,
} from 'lucide-react';

const NAV = [
  {
    section: 'Visão Geral',
    items: [
      { label: 'Dashboard', href: '/dashboard/executive', icon: LayoutDashboard },
      { label: 'Mapa Estratégico', href: '/dashboard/maps', icon: Network },
    ],
  },
  {
    section: 'Análise',
    items: [
      { label: 'Cenários', href: '/dashboard/scenarios', icon: Layers },
    ],
  },
  {
    section: 'Execução',
    items: [
      { label: 'Plano de Ação', href: '/dashboard/action-plans', icon: ClipboardList },
    ],
  },
  {
    section: 'Administração',
    items: [
      { label: 'Usuários', href: '/dashboard/users', icon: Users },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'DR';

  return (
    <aside className="fixed left-0 top-0 h-full w-[200px] bg-[#0d0f17] border-r border-white/5 flex flex-col z-30">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2 mb-1">
          {/* Copérdia stylized logo mark */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-black text-sm">
            C
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">COPÉRDIA</p>
            <p className="text-white/40 text-[10px]">BSC – Copérdia</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="text-white/30 text-[9px] uppercase tracking-widest px-2 mb-2">{group.section}:</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all',
                      active
                        ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                        : 'text-white/60 hover:text-white hover:bg-white/5',
                    )}
                  >
                    <item.icon size={15} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-white/5">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-all group"
        >
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-white/80 text-xs font-medium truncate">{user?.name ?? 'Diretoria Copérdia'}</p>
            <p className="text-white/30 text-[10px] truncate">{user?.role ?? 'Direção'}</p>
          </div>
          <ChevronRight size={12} className="text-white/30 group-hover:text-white/60" />
        </button>
      </div>
    </aside>
  );
}
