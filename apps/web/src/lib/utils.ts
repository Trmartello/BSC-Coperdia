import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MeasureUnit, IndicatorStatus } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Casas decimais padrão quando o indicador não define (indicadores antigos).
export const DEFAULT_DECIMALS = 2;

function clampDecimals(d: number): number {
  const n = Math.trunc(Number(d));
  if (!Number.isFinite(n)) return DEFAULT_DECIMALS;
  return Math.min(Math.max(n, 0), 6);
}

// Números "puros" (%/Dias/Índice) até 1000 saem com toFixed; acima disso usam a
// notação compacta pt-BR (mil/mi/bi) para não estourar a largura de cards e KPIs.
function compactIfLarge(value: number, d: number): string {
  if (Math.abs(value) < 1000) return value.toFixed(d);
  return new Intl.NumberFormat('pt-BR', { notation: 'compact', minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
}

export function formatValue(value: number | null, unit: MeasureUnit, decimals: number = DEFAULT_DECIMALS): string {
  if (value === null || value === undefined) return '—';
  const d = clampDecimals(decimals);

  switch (unit) {
    case 'CURRENCY':
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
    case 'PERCENTAGE':
      return `${compactIfLarge(value, d)}%`;
    case 'DAYS':
      return `${compactIfLarge(value, d)} dias`;
    case 'INDEX':
      return compactIfLarge(value, d);
    default:
      return new Intl.NumberFormat('pt-BR', { notation: 'compact', minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
  }
}

/** Formata o número para exibição em cards. Inclui a escala (mil/mi/bi) mas omite o símbolo da unidade — o badge no header já indica R$, Dias, etc. */
export function formatNumber(value: number | null, unit: MeasureUnit, decimals: number = DEFAULT_DECIMALS): string {
  const { num, scale } = formatNumberParts(value, unit, decimals);
  return scale ? `${num} ${scale}` : num;
}

/**
 * Formats a number and separates the scale suffix (mil, mi, bi) from the digit string.
 * Intl compact notation uses a non-breaking space ( ) between number and suffix,
 * so we split on any whitespace.
 */
export function formatNumberParts(value: number | null, unit: MeasureUnit, decimals: number = DEFAULT_DECIMALS): { num: string; scale: string } {
  if (value === null || value === undefined) return { num: '—', scale: '' };
  const d = clampDecimals(decimals);

  switch (unit) {
    case 'PERCENTAGE':
    case 'DAYS':
    case 'INDEX': {
      // Valores pequenos: número puro. Valores grandes (ex.: % distorcida por
      // insumo ainda sem lançamento) ganham a mesma escala compacta dos demais
      // cards (142731.43 → "142,73 mil") para não estourar a largura do card.
      if (Math.abs(value) < 1000) return { num: value.toFixed(d), scale: '' };
      const formatted = new Intl.NumberFormat('pt-BR', { notation: 'compact', minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
      const parts = formatted.split(/\s+/);
      const last = parts[parts.length - 1];
      if (parts.length > 1 && /^[a-zà-ÿ]+$/i.test(last)) {
        return { num: parts.slice(0, -1).join(''), scale: last };
      }
      return { num: formatted, scale: '' };
    }
    default: {
      const formatted = new Intl.NumberFormat('pt-BR', { notation: 'compact', minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
      // Split on any whitespace (including   used by Intl)
      const parts = formatted.split(/\s+/);
      const last = parts[parts.length - 1];
      if (parts.length > 1 && /^[a-zà-ÿ]+$/i.test(last)) {
        return { num: parts.slice(0, -1).join(''), scale: last };
      }
      return { num: formatted, scale: '' };
    }
  }
}

// Escalas de abreviação (apenas para CURRENCY/NUMBER).
const SCALE_STEPS: { limit: number; div: number; label: string }[] = [
  { limit: 1e9, div: 1e9, label: 'bi' },
  { limit: 1e6, div: 1e6, label: 'mi' },
  { limit: 1e3, div: 1e3, label: 'mil' },
];

/**
 * Escolhe UMA escala comum para o card, baseada no maior valor absoluto entre
 * as colunas (Realizado/Meta/Estimativa). Mantém as três colunas na mesma
 * unidade — facilita a leitura e garante que o badge reflita a escala exibida.
 * Unidades não-monetárias (%, dias, índice) nunca abreviam → escala vazia.
 */
export function pickScale(values: (number | null | undefined)[], unit: MeasureUnit): { div: number; scale: string } {
  if (unit === 'PERCENTAGE' || unit === 'DAYS' || unit === 'INDEX') return { div: 1, scale: '' };
  const nums = values.filter((v): v is number => v !== null && v !== undefined);
  if (nums.length === 0) return { div: 1, scale: '' };
  const max = Math.max(...nums.map((v) => Math.abs(v)));
  for (const s of SCALE_STEPS) if (max >= s.limit) return { div: s.div, scale: s.label };
  return { div: 1, scale: '' };
}

/** Formata um valor já dividido pela escala comum do card (ver pickScale). */
export function formatToScale(value: number | null | undefined, unit: MeasureUnit, div: number): string {
  if (value === null || value === undefined) return '—';
  switch (unit) {
    case 'PERCENTAGE':
      return value.toFixed(2);
    case 'DAYS':
      return value.toFixed(0);
    case 'INDEX':
      return value.toFixed(2);
    default:
      return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value / div);
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

// ─── Fórmulas: nomes de variáveis amigáveis ──────────────────────────────────

/**
 * Converte um código de indicador em um nome de variável válido para a fórmula
 * (mathjs): mantém letras/dígitos/underscore, troca o resto por "_" e evita
 * começar com dígito. Ex.: "GER-046" → "GER_046".
 */
export function toVarName(code: string): string {
  let v = (code ?? '').trim().replace(/[^A-Za-z0-9_]/g, '_');
  if (/^[0-9]/.test(v)) v = '_' + v;
  return v || 'VAR';
}

/** Escapa um texto para uso literal dentro de uma RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Substitui, com fronteira de palavra, uma variável por outra dentro de uma
 * expressão — usado ao renomear o alias de uma variável já digitada na fórmula.
 */
export function replaceVarToken(expression: string, from: string, to: string): string {
  if (!from || from === to) return expression;
  return expression.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, 'g'), to);
}

/**
 * Expande uma fórmula trocando cada token de variável pelo nome amigável do
 * indicador, para o usuário conferir a composição do cálculo. Tokens não
 * mapeados permanecem como estão (sinalizando algo fora do lugar).
 * `tokenToName` = { NOME_VARIAVEL: "Nome do Indicador" }.
 */
export function humanizeExpression(expression: string, tokenToName: Record<string, string>): string {
  if (!expression) return '';
  // Substitui tokens do mais longo p/ o mais curto, evitando trocas parciais.
  const tokens = Object.keys(tokenToName).sort((a, b) => b.length - a.length);
  let out = expression;
  for (const tok of tokens) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(tok)}\\b`, 'g'), tokenToName[tok]);
  }
  return out;
}
