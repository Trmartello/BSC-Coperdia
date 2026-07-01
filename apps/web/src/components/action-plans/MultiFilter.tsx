'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Search, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

// ─── MultiFilter ──────────────────────────────────────────────────────────────
// Dropdown de seleção múltipla com checkboxes (Status, Prioridade, etc.).
// Extraído da página de Planos de Ação para ser reutilizado no painel lateral
// do indicador (IndicatorDetailPanel → ActionPlanDetail).

export interface MultiOption {
  value: string;
  label: string;
  sublabel?: string;
  dot?: string;
  valueClass?: string;
}

/** Alterna a presença de um valor em um Set imutável (retorna novo Set). */
export function toggleSet(prev: Set<string>, v: string): Set<string> {
  const next = new Set(prev);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
}

export function MultiFilter({
  label,
  options,
  selected,
  onToggle,
  onClear,
  searchable = false,
  minWidth = 'min-w-[170px]',
  allLabel = 'Todas',
}: {
  label: string;
  options: MultiOption[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
  searchable?: boolean;
  minWidth?: string;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const active = selected.size > 0;
  const selectedOpts = options.filter((o) => selected.has(o.value));
  const visible = searchable
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          (o.sublabel ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : options;

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        onClick={() => { setOpen((s) => !s); setSearch(''); }}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-sm border transition-colors',
          active
            ? 'bg-white/10 border-white/15 text-white'
            : 'bg-white/5 border-transparent text-white/60 hover:text-white/85 hover:bg-white/8',
          active ? 'rounded-l-lg rounded-r-none border-r-0' : 'rounded-lg',
        )}
      >
        <span className="text-white/35 text-xs">{label}:</span>
        {selected.size === 0 && <span className="font-medium text-white/60">{allLabel}</span>}
        {selected.size === 1 && (
          <span className="flex items-center gap-1.5 font-medium max-w-[160px] truncate">
            {selectedOpts[0]?.dot && (
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', selectedOpts[0].dot)} />
            )}
            <span className={cn('truncate', selectedOpts[0]?.valueClass)}>{selectedOpts[0]?.label}</span>
          </span>
        )}
        {selected.size > 1 && <span className="font-medium text-white">{selected.size} selecionados</span>}
        <ChevronDown size={12} className="text-white/30 flex-shrink-0" />
      </button>
      {active && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClear(); setOpen(false); }}
          className="flex items-center justify-center h-full px-1.5 py-1.5 bg-white/10 border border-white/15 rounded-r-lg text-white/40 hover:text-white hover:bg-white/15 transition-colors"
        >
          <X size={11} />
        </button>
      )}

      {open && (
        <div className={cn('absolute z-50 left-0 top-full mt-1 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col', minWidth)}>
          {searchable && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 flex-shrink-0">
              <Search size={13} className="text-white/30 flex-shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none"
              />
            </div>
          )}
          <div className="overflow-y-auto max-h-52">
            {visible.map((opt) => {
              const checked = selected.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onToggle(opt.value)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/5',
                    checked ? 'bg-white/5' : '',
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                    checked ? 'bg-purple-600 border-purple-600' : 'border-white/20',
                  )}>
                    {checked && <Check size={10} className="text-white" />}
                  </div>
                  {opt.dot && (
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', opt.dot)} />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className={cn('text-sm', opt.valueClass ?? 'text-white/75')}>{opt.label}</span>
                    {opt.sublabel && <p className="text-[10px] text-white/30 truncate">{opt.sublabel}</p>}
                  </div>
                </button>
              );
            })}
            {visible.length === 0 && (
              <p className="px-3 py-3 text-xs text-white/30 text-center">Nenhum resultado</p>
            )}
          </div>
          {active && (
            <div className="border-t border-white/5 px-3 py-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false); }}
                className="text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
