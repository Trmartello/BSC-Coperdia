'use client';

import { useEffect, useRef } from 'react';

// ─── Pilha global de modais para fechamento via ESC ───────────────────────────
// Cada modal/camada registra seu onClose ao montar (useEscClose). Um único
// listener de keydown fecha SEMPRE o último registrado (LIFO): com vários
// modais abertos, ESC fecha do mais recente ao mais antigo, um por tecla.

type Entry = { close: () => void };

const stack: Entry[] = [];
let listening = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.stopPropagation();
  stack[stack.length - 1].close();
}

function ensureListener() {
  if (!listening && stack.length > 0) {
    window.addEventListener('keydown', onKeyDown);
    listening = true;
  } else if (listening && stack.length === 0) {
    window.removeEventListener('keydown', onKeyDown);
    listening = false;
  }
}

/**
 * Registra o modal na pilha de ESC enquanto `active` for true.
 * O onClose mais recente da pilha é o chamado no próximo ESC.
 */
export function useEscClose(onClose: () => void, active: boolean = true) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const entry: Entry = { close: () => closeRef.current() };
    stack.push(entry);
    ensureListener();
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      ensureListener();
    };
  }, [active]);
}
