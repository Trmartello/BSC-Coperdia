import { create } from 'zustand';

interface ScenarioStore {
  activePeriod: string;
  setActivePeriod: (p: string) => void;
}

export const useScenarioStore = create<ScenarioStore>((set) => ({
  activePeriod: new Date().toISOString().slice(0, 7) + '-01',
  setActivePeriod: (p) => set({ activePeriod: p }),
}));
