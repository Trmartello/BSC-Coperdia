'use client';

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useEscClose } from '../../lib/useEscClose';

interface Props {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Modal de confirmação reutilizável para exclusões (sempre destaca que é permanente).
export function ConfirmDialog({
  title = 'Confirmar exclusão',
  message,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  loading,
  onConfirm,
  onCancel,
}: Props) {
  useEscClose(onCancel); // ESC cancela a confirmação (camada mais recente da pilha)
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pt-5 pb-2">
          <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-400" />
          </div>
          <h3 className="text-white font-semibold text-sm flex-1 mt-1.5">{title}</h3>
          <button onClick={onCancel} className="text-white/30 hover:text-white/70 transition-colors">
            <X size={16} />
          </button>
        </div>

        <p className="px-6 pb-2 pl-[4.5rem] text-sm text-white/65 leading-relaxed">{message}</p>
        <p className="px-6 pb-4 pl-[4.5rem] text-[11px] font-medium text-red-400/80">
          Esta exclusão é permanente e não pode ser desfeita.
        </p>

        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm text-white/60 border border-white/10 hover:bg-white/5 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? 'Excluindo...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
