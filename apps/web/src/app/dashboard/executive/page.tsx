'use client';

import React from 'react';
import { ExecutiveDashboard } from '../../../components/dashboard/ExecutiveDashboard';
import { useScenarioStore } from '../../../store/scenario.store';

export default function ExecutivePage() {
  const { activePeriod, accumulate } = useScenarioStore();
  const periodLabel = (() => {
    try {
      const d = new Date(activePeriod + 'T12:00:00Z');
      const long = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      if (!accumulate) return long;
      const month = d.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
      const year = d.toLocaleDateString('pt-BR', { year: 'numeric', timeZone: 'UTC' });
      return `acumulado de janeiro a ${month} de ${year}`;
    } catch {
      return activePeriod;
    }
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard Executivo</h1>
        <p className="text-sm text-white/40 mt-0.5">Visão consolidada dos indicadores estratégicos · {periodLabel}</p>
      </div>
      <ExecutiveDashboard />
    </div>
  );
}
