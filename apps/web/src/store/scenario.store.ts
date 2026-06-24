import { create } from 'zustand';

interface ScenarioStore {
  activePeriod: string;
  // Modo "Acumular" (YTD): consolida indicadores de jan→período selecionado.
  accumulate: boolean;
  setActivePeriod: (p: string) => void;
  setAccumulate: (v: boolean) => void;
  toggleAccumulate: () => void;
}

export const useScenarioStore = create<ScenarioStore>((set) => ({
  activePeriod: new Date().toISOString().slice(0, 7) + '-01',
  accumulate: false,
  setActivePeriod: (p) => set({ activePeriod: p }),
  setAccumulate: (v) => set({ accumulate: v }),
  toggleAccumulate: () => set((s) => ({ accumulate: !s.accumulate })),
}));
