import { create } from 'zustand';

// Intenção de abrir algo na página de Planos de Ação, disparada de fora dela
// (ex.: ao clicar num alerta do sino). Usar um store reativo garante que a ação
// aconteça mesmo quando o usuário já está na página (router.push não remonta).
interface ActionPlanIntentStore {
  offTrackIndicatorId?: string; // abrir/editar plano do indicador fora da meta
  editActionItemId?: string;    // abrir form de edição de uma ação (em atraso)
  requestPlanForIndicator: (indicatorId: string) => void;
  requestEditAction: (actionItemId: string) => void;
  clear: () => void;
}

export const useActionPlanIntent = create<ActionPlanIntentStore>((set) => ({
  offTrackIndicatorId: undefined,
  editActionItemId: undefined,
  requestPlanForIndicator: (id) => set({ offTrackIndicatorId: id, editActionItemId: undefined }),
  requestEditAction: (id) => set({ editActionItemId: id, offTrackIndicatorId: undefined }),
  clear: () => set({ offTrackIndicatorId: undefined, editActionItemId: undefined }),
}));
