import { create } from 'zustand';
import { Scenario } from '../types';

interface ScenarioStore {
  activeScenario: Scenario | null;
  activePeriod: string;
  setActiveScenario: (s: Scenario | null) => void;
  setActivePeriod: (p: string) => void;
}

export const useScenarioStore = create<ScenarioStore>((set) => ({
  activeScenario: null,
  activePeriod: new Date().toISOString().slice(0, 7) + '-01',
  setActiveScenario: (s) => set({ activeScenario: s }),
  setActivePeriod: (p) => set({ activePeriod: p }),
}));
