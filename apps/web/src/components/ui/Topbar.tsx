'use client';

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { useScenarioStore } from '../../store/scenario.store';
import { indicatorsApi, settingsApi } from '../../lib/api';
import { Bell, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ImportDataModal } from '../indicators/ImportDataModal';

export function Topbar() {
  const { user } = useAuthStore();
  const { activePeriod, setActivePeriod } = useScenarioStore();
  const [showImport, setShowImport] = useState(false);
  const qc = useQueryClient();

  const { data: periods = [] } = useQuery({
    queryKey: ['indicator-periods'],
    queryFn: () => indicatorsApi.periods().then((r) => r.data),
  });

  // Flag "Estimativa" (exibe a coluna Estimativa nos cards e painéis)
  const { data: flags } = useQuery({
    queryKey: ['settings-flags'],
    queryFn: () => settingsApi.getFlags().then((r) => r.data),
  });
  const showEstimate = flags?.showEstimate ?? true;
  const toggleEstimate = useMutation({
    mutationFn: () => settingsApi.setFlag('showEstimate', !showEstimate),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-flags'] }),
  });

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
    <header className="h-12 border-b border-white/5 bg-[#0d0f17] flex items-center px-6 gap-3">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-white/40">
        <span>Copérdia</span>
        <span>/</span>
        <span className="text-white/70">BSC Copérdia</span>
      </div>

      <div className="flex-1" />

      {/* Import data */}
      <button
        onClick={() => setShowImport(true)}
        className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-1.5 transition-colors"
        title="Carga de dados via planilha"
      >
        <FileSpreadsheet size={13} className="text-emerald-400" />
        <span className="text-xs text-white/60">Importar</span>
      </button>

      {/* Estimativa toggle */}
      <button
        onClick={() => toggleEstimate.mutate()}
        disabled={toggleEstimate.isPending}
        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-1.5 transition-colors disabled:opacity-50"
        title="Exibir coluna Estimativa nos cards e painéis"
      >
        <span className="text-xs text-white/60">Estimativa</span>
        <span className={cn('relative w-8 h-4 rounded-full transition-colors', showEstimate ? 'bg-emerald-500' : 'bg-white/15')}>
          <span className={cn('absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform', showEstimate ? 'translate-x-4' : 'translate-x-0')} />
        </span>
      </button>

      {/* Period selector */}
      <div className="flex items-center gap-1 bg-purple-600/15 border border-purple-500/25 rounded-xl px-2 py-1.5">
        <span className="text-[10px] text-white/40 mr-1">Período:</span>
        <button onClick={prevPeriod} disabled={periodIdx <= 0} className="text-white/40 hover:text-white/80 disabled:opacity-20 px-0.5"><ChevronLeft size={13} /></button>
        <span className="text-xs font-semibold text-purple-200 min-w-[60px] text-center">{displayPeriod}</span>
        <button onClick={nextPeriod} disabled={periodIdx >= periods.length - 1} className="text-white/40 hover:text-white/80 disabled:opacity-20 px-0.5"><ChevronRight size={13} /></button>
      </div>

      {showImport && <ImportDataModal onClose={() => setShowImport(false)} />}

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
