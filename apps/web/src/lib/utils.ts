import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MeasureUnit, IndicatorStatus } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatValue(value: number | null, unit: MeasureUnit): string {
  if (value === null || value === undefined) return '—';

  switch (unit) {
    case 'CURRENCY':
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(value);
    case 'PERCENTAGE':
      return `${value.toFixed(2)}%`;
    case 'DAYS':
      return `${value.toFixed(0)} dias`;
    case 'INDEX':
      return value.toFixed(2);
    default:
      return new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(value);
  }
}

export function statusColor(status: IndicatorStatus): string {
  const map: Record<IndicatorStatus, string> = {
    ON_TRACK: 'text-emerald-500',
    AT_RISK: 'text-amber-500',
    OFF_TRACK: 'text-red-500',
    NO_DATA: 'text-slate-400',
  };
  return map[status];
}

export function statusBg(status: IndicatorStatus): string {
  const map: Record<IndicatorStatus, string> = {
    ON_TRACK: 'bg-emerald-500/10 border-emerald-500/30',
    AT_RISK: 'bg-amber-500/10 border-amber-500/30',
    OFF_TRACK: 'bg-red-500/10 border-red-500/30',
    NO_DATA: 'bg-slate-500/10 border-slate-500/30',
  };
  return map[status];
}

export function deltaArrow(delta: number): string {
  if (delta > 0) return '▲';
  if (delta < 0) return '▼';
  return '—';
}
