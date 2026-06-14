'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { useScenarioStore } from '../../store/scenario.store';
import { scenariosApi, indicatorsApi } from '../../lib/api';
import { Scenario } from '../../types';
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Topbar() {
  const { user } = useAuthStore();
  const { activeScenario, setActiveScenario, activePeriod, setActivePeriod } = useScenarioStore();
  const [open, setOpen] = useState(false);

  const { data: scenarios = [] } = useQuery({
    queryKey: ['scenarios'],
    queryFn: () => scenariosApi.list().then((r) => r.data as Scenario[]),
  });

  const { data: periods = [] } = useQuery({
    queryKey: ['indicator-periods'],
    queryFn: () => indicatorsApi.periods().then((r) => r.data),
  });

  // Auto-seleciona o cenário baseline (ou o primeiro) quando nenhum está ativo
  useEffect(() => {
    if (!activeScenario && scenarios.length > 0) {
      const baseline = scenarios.find((s) => s.isBaseline) ?? scenarios[0];
      setActiveScenario(baseline);
    }
  }, [scenarios, activeScenario, setActiveScenario]);

  // Auto-seleciona o período mais recente se o período ativo não existir nos dados
  useEffect(() => {
    if (periods.length === 0) return;
    if (!periods.includes(activePeriod)) {
      setActivePeriod(periods[periods.length - 1]);
    }
  }, [periods, activePeriod, setActivePeriod]);

  const periodIdx = periods.indexOf(activePeriod);
  const prevPeriod = () => { if (periodIdx > 0) setActivePeriod(periods[periodIdx - 1]); };
  const nextPeriod = () => { if (periodIdx < periods.length - 1) setActivePeriod(periods[periodIdx + 1]); };

  const displayPeriod = activePeriod
    ? new Date(activePeriod + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
        .replace('.', '').replace(/^\w/, (c) => c.toUpperCase())
    : '—';

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

      {/* Period selector */}
      <div className="flex items-center gap-1 bg-purple-600/15 border border-purple-500/25 rounded-xl px-2 py-1.5">
        <span className="text-[10px] text-white/40 mr-1">Período:</span>
        <button onClick={prevPeriod} disabled={periodIdx <= 0} className="text-white/40 hover:text-white/80 disabled:opacity-20 px-0.5"><ChevronLeft size={13} /></button>
        <span className="text-xs font-semibold text-purple-200 min-w-[60px] text-center">{displayPeriod}</span>
        <button onClick={nextPeriod} disabled={periodIdx >= periods.length - 1} className="text-white/40 hover:text-white/80 disabled:opacity-20 px-0.5"><ChevronRight size={13} /></button>
      </div>

      {/* Scenario selector */}
      <div className="relative">
        <button
          onClick={() => setOpen((s) => !s)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/70 transition-colors"
        >
          <Layers size={13} className="text-purple-400" />
          <span className="max-w-[160px] truncate">{activeScenario?.name ?? 'Selecionar cenário'}</span>
          {activeScenario?.isBaseline && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25">base</span>
          )}
          <ChevronDown size={12} className="text-white/30" />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-10 z-30 w-60 bg-[#1a1f2e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <p className="px-3 py-2 text-[10px] uppercase tracking-widest text-white/30 border-b border-white/5">Cenários</p>
              <div className="max-h-64 overflow-y-auto py-1">
                {scenarios.length === 0 && (
                  <p className="px-3 py-3 text-xs text-white/30">Nenhum cenário disponível.</p>
                )}
                {scenarios.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setActiveScenario(s); setOpen(false); }}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors',
                      activeScenario?.id === s.id ? 'text-purple-300' : 'text-white/70',
                    )}
                  >
                    <span className="truncate">{s.name}</span>
                    {s.isBaseline && <span className="text-[9px] text-white/30">base</span>}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

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
