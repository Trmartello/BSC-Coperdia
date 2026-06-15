'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, TrendingUp, TrendingDown,
  Plus, Pencil, Check,
} from 'lucide-react';
import { indicatorsApi, actionPlansApi, settingsApi } from '../../lib/api';
import { ActionPlanDetail } from '../action-plans/ActionPlanDetail';
import { cn, formatValue } from '../../lib/utils';
import { toast } from 'sonner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmtMonth(d: Date) {
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

// Rótulo compacto para o eixo do gráfico: "Mai'26"
function fmtMonthCompact(d: Date) {
  return `${MESES[d.getUTCMonth()]}'${String(d.getUTCFullYear()).slice(2)}`;
}

// Valor curto para rótulo sobre as barras do gráfico
function fmtBar(v: number | null | undefined, unit: string): string {
  if (v == null) return '';
  if (unit === 'PERCENTAGE') return `${v % 1 === 0 ? v : v.toFixed(1)}%`;
  if (unit === 'DAYS') return `${Math.round(v)}d`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v % 1 === 0 ? v : v.toFixed(1)}`;
}

function fmtLarge(v: number | null | undefined, unit: string): string {
  if (v == null) return '—';
  if (unit === 'PERCENTAGE') return `${v.toFixed(1)}%`;
  if (unit === 'CURRENCY') {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)} M`;
    if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)} k`;
    return `R$ ${v.toFixed(2)}`;
  }
  if (unit === 'DAYS') return `${v % 1 === 0 ? v : v.toFixed(1)} d`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)} k`;
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

const UNIT_NAME: Record<string, string> = {
  CURRENCY: 'Reais (R$)', PERCENTAGE: 'Percentual (%)', DAYS: 'Dias', NUMBER: 'Número', INDEX: 'Índice',
};

// melhora segundo a polaridade: variação favorável quando o sentido bate com a direção
function isImprovement(pct: number | null, direction: string): boolean | null {
  if (pct === null) return null;
  return direction === 'LOWER_IS_BETTER' ? pct <= 0 : pct >= 0;
}

// ─── History Chart (bars + YoY ghost + meta dashed + MoM dashed trend) ─────────

interface Pt { period: Date; value: number; goal?: number; prevYear?: number }

function HistoryChart({ data, direction, unit, currentGoal }: {
  data: Pt[]; direction: string; unit: string; currentGoal?: number | null;
}) {
  const [tooltip, setTooltip] = useState<{ i: number; x: number; y: number } | null>(null);

  if (!data.length) {
    return <div className="h-32 flex items-center justify-center text-white/20 text-xs">Sem dados históricos</div>;
  }

  const pts = data.slice(-15);
  const n = pts.length;
  const step = 52;
  const barW = step * 0.55;
  const chartW = n * step;
  const chartH = 140;
  const pad = 24;
  const topPad = 58; // espaço para as duas linhas YoY acima das barras

  // Para cada um dos 2 meses mais recentes, encontrar o mesmo mês do ano anterior
  interface YoyPair {
    recentIdx: number;
    prevIdx: number;
    pct: number;
    good: boolean;
    lineY: number; // offset vertical para separar as duas linhas
  }
  const yoyPairs: YoyPair[] = [];
  for (let offset = 0; offset <= 1; offset++) {
    const ri = n - 1 - offset;
    if (ri < 0) continue;
    const rp = pts[ri].period;
    const pi = pts.findIndex((p) => p.period.getUTCMonth() === rp.getUTCMonth()
      && p.period.getUTCFullYear() === rp.getUTCFullYear() - 1);
    if (pi < 0) continue;
    const pct = pts[pi].value !== 0
      ? ((pts[ri].value - pts[pi].value) / Math.abs(pts[pi].value)) * 100 : 0;
    const good = direction === 'LOWER_IS_BETTER' ? pct <= 0 : pct >= 0;
    yoyPairs.push({ recentIdx: ri, prevIdx: pi, pct, good, lineY: offset === 0 ? topPad - 16 : topPad - 32 });
  }
  const prevYearIdxSet = new Set(yoyPairs.map((p) => p.prevIdx));

  const goalLine = currentGoal ?? null;
  const allVals = pts.map((p) => p.value).filter((v) => v > 0);
  const maxVal = Math.max(...allVals, goalLine ?? 0, 1) * 1.15;

  const x = (i: number) => pad + i * step + step / 2;
  const y = (v: number) => topPad + (chartH - (v / maxVal) * chartH);
  const baseY = topPad + chartH;
  const fullW = chartW + pad * 2;

  // cor de cada barra: todas coloridas por status vs meta do período ou meta atual
  const barStatus = (p: Pt, i: number): boolean | null => {
    const g = p.goal ?? (goalLine ?? null);
    if (g == null) return null;
    return direction === 'LOWER_IS_BETTER' ? p.value <= g : p.value >= g;
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg width="100%" height={baseY + 46} viewBox={`0 0 ${fullW} ${baseY + 46}`} preserveAspectRatio="xMidYMid meet">

        {/* duas linhas YoY tracejadas com hastes e label central */}
        {yoyPairs.map((pair, pi) => {
          const lx1 = x(pair.prevIdx);
          const lx2 = x(pair.recentIdx);
          const ly = pair.lineY;
          const midX = (lx1 + lx2) / 2;
          const color = pair.good ? 'rgba(52,211,153,0.7)' : 'rgba(248,113,113,0.7)';
          const labelColor = pair.good ? '#34d399' : '#f87171';
          const label = `${pair.pct > 0 ? '+' : ''}${pair.pct.toFixed(1)}% YoY`;
          const labelW = label.length * 6.2 + 10;
          return (
            <g key={`yoy-${pi}`}>
              <line x1={lx1} x2={lx2} y1={ly} y2={ly} stroke={color} strokeWidth={1} strokeDasharray="4 3" />
              <line x1={lx1} x2={lx1} y1={ly - 5} y2={ly + 5} stroke={color} strokeWidth={1.5} />
              <line x1={lx2} x2={lx2} y1={ly - 5} y2={ly + 5} stroke={color} strokeWidth={1.5} />
              <rect x={midX - labelW / 2} y={ly - 10} width={labelW} height={14} rx={3} fill="#161b27" />
              <text x={midX} y={ly + 1} textAnchor="middle" fontSize="10" fontWeight="700" fill={labelColor}>
                {label}
              </text>
            </g>
          );
        })}

        {/* linha de meta tracejada + rótulo */}
        {goalLine != null && (
          <g>
            <line x1={pad} x2={fullW - pad} y1={y(goalLine)} y2={y(goalLine)}
              stroke="rgba(255,255,255,0.20)" strokeWidth={1} strokeDasharray="4 4" />
            <text x={fullW - pad - 2} y={y(goalLine) - 3} textAnchor="end" fontSize="7" fill="rgba(255,255,255,0.28)">
              meta {fmtBar(goalLine, unit)}
            </text>
          </g>
        )}

        {/* barras — todas coloridas por status vs meta */}
        {pts.map((p, i) => {
          const isPrevYear = prevYearIdxSet.has(i);
          const isRecent = i >= n - 2;
          const good = isPrevYear ? null : barStatus(p, i);

          let barColor: string;
          let labelColor: string;
          if (isPrevYear) {
            barColor = 'rgba(129,140,248,0.75)';
            labelColor = 'rgba(165,180,252,0.95)';
          } else if (good === null) {
            barColor = 'rgba(255,255,255,0.08)';
            labelColor = 'rgba(255,255,255,0.4)';
          } else if (good) {
            barColor = isRecent ? 'rgba(16,185,129,0.90)' : 'rgba(16,185,129,0.45)';
            labelColor = 'rgba(52,211,153,0.95)';
          } else {
            barColor = isRecent ? 'rgba(239,68,68,0.90)' : 'rgba(239,68,68,0.45)';
            labelColor = 'rgba(248,113,113,0.95)';
          }

          const showLabel = isRecent || isPrevYear;
          return (
            <g key={`b-${i}`}
              onMouseEnter={() => setTooltip({ i, x: x(i), y: y(p.value) })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'crosshair' }}
            >
              {/* área de hover maior que a barra */}
              <rect x={x(i) - barW / 2 - 4} width={barW + 8} y={topPad} height={baseY - topPad} rx={0} fill="transparent" />
              <rect x={x(i) - barW / 2} width={barW} y={y(p.value)} height={baseY - y(p.value)} rx={3} fill={barColor} />
              {showLabel && (
                <text x={x(i)} y={y(p.value) - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill={labelColor}>
                  {fmtBar(p.value, unit)}
                </text>
              )}
            </g>
          );
        })}

        {/* labels de período — todos visíveis, rotacionados -45° para não colidir */}
        {pts.map((p, i) => {
          const highlight = i >= n - 2 || prevYearIdxSet.has(i);
          return (
            <text
              key={`t-${i}`}
              x={x(i)} y={baseY + 6}
              textAnchor="end"
              fontSize="9" fontWeight={highlight ? 700 : 400}
              fill={highlight ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.32)'}
              transform={`rotate(-45,${x(i)},${baseY + 6})`}
            >
              {fmtMonthCompact(p.period)}
            </text>
          );
        })}

        {/* tooltip ao passar o mouse */}
        {tooltip != null && (() => {
          const p = pts[tooltip.i];
          const label = `${fmtMonthCompact(p.period)}: ${fmtBar(p.value, unit)}`;
          const tw = label.length * 6.5 + 16;
          const tx = Math.min(Math.max(tooltip.x - tw / 2, pad), fullW - tw - pad);
          const ty = Math.max(tooltip.y - 34, 4);
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty} width={tw} height={20} rx={4} fill="rgba(30,37,60,0.97)" stroke="rgba(255,255,255,0.15)" strokeWidth={0.8} />
              <text x={tx + tw / 2} y={ty + 13} textAnchor="middle" fontSize="11" fontWeight="600" fill="rgba(255,255,255,0.92)">
                {label}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ─── Linha de histórico unificado (Realizado + Meta + Estimativa) ─────────────

function PeriodRow({
  period, realized, goal, estimate, unit, indicatorId, isCalculated, onSaved,
}: {
  period: string; // ISO date string
  realized?: any; goal?: any; estimate?: any;
  unit: string; indicatorId: string; isCalculated: boolean; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState({
    realizado: realized ? String(parseFloat(realized.value)) : '',
    meta: goal ? String(parseFloat(goal.value)) : '',
    estimativa: estimate ? String(parseFloat(estimate?.value ?? '')) : '',
  });
  const [saving, setSaving] = useState(false);
  const periodDate = new Date(period);
  const periodLabel = periodDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });

  async function save() {
    setSaving(true);
    try {
      const periodKey = period.slice(0, 10);
      const promises: Promise<any>[] = [];

      // Realizado — só para INPUT
      if (!isCalculated && vals.realizado.trim() !== '') {
        const v = parseFloat(vals.realizado.replace(',', '.'));
        if (!Number.isNaN(v)) promises.push(indicatorsApi.setRealized(indicatorId, { period: periodKey, value: v }));
      }

      // Meta — sempre disponível
      if (vals.meta.trim() !== '') {
        const v = parseFloat(vals.meta.replace(',', '.'));
        if (!Number.isNaN(v)) promises.push(indicatorsApi.setGoal(indicatorId, { period: periodKey, value: v }));
      }

      // Estimativa — se vazia, usa Realizado (regra: Estimativa = Realizado)
      let estVal = vals.estimativa.trim() !== '' ? parseFloat(vals.estimativa.replace(',', '.')) : null;
      if (estVal === null && !isCalculated && vals.realizado.trim() !== '') {
        estVal = parseFloat(vals.realizado.replace(',', '.'));
      }
      if (estVal !== null && !Number.isNaN(estVal)) {
        promises.push(indicatorsApi.setEstimate(indicatorId, { period: periodKey, value: estVal }));
      }

      await Promise.all(promises);
      toast.success('Valores salvos. Recalculando...');
      setEditing(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  const fv = (v: any) => v != null ? formatValue(parseFloat(v.value), unit as any) : '—';

  if (editing) {
    return (
      <div className="py-3 border-b border-white/5 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-white/60">{periodLabel}</span>
          <div className="flex gap-1.5">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 transition-colors">
              <Check size={11} />{saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={() => setEditing(false)}
              className="text-[10px] px-2.5 py-1 rounded-lg border border-white/10 text-white/40 hover:bg-white/5 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'realizado', label: 'Realizado', disabled: isCalculated, hint: isCalculated ? 'Calculado' : undefined },
            { key: 'meta', label: 'Meta', disabled: false },
            { key: 'estimativa', label: 'Estimativa', disabled: false, hint: 'Vazio = usa Realizado' },
          ].map(({ key, label, disabled, hint }) => (
            <div key={key}>
              <label className="text-[9px] text-white/30 uppercase tracking-wider block mb-0.5">{label}</label>
              {hint && <p className="text-[8px] text-white/20 mb-0.5">{hint}</p>}
              <input
                type="number"
                value={vals[key as keyof typeof vals]}
                onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
                disabled={disabled}
                placeholder={disabled ? '—' : '0'}
                className="w-full bg-white/5 border border-white/15 focus:border-purple-500 rounded-lg text-xs text-white px-2 py-1.5 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/[0.02] rounded transition-colors">
      <span className="text-[11px] text-white/40 w-14 flex-shrink-0">{periodLabel}</span>
      <div className="flex-1 grid grid-cols-3 gap-2 text-right">
        <div>
          <p className="text-[8px] text-white/25 uppercase tracking-wider">Realizado</p>
          <p className="text-xs font-medium text-white/80">{fv(realized)}</p>
        </div>
        <div>
          <p className="text-[8px] text-white/25 uppercase tracking-wider">Meta</p>
          <p className="text-xs font-medium text-white/60">{fv(goal)}</p>
        </div>
        <div>
          <p className="text-[8px] text-white/25 uppercase tracking-wider">Estimativa</p>
          <p className="text-xs font-medium text-white/60">{fv(estimate)}</p>
        </div>
      </div>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-purple-400 p-1 transition-all flex-shrink-0"
        title="Editar período"
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}

// ─── Novo lançamento manual ──────────────────────────────────────────────────

function NewEntryForm({ indicatorId, defaultPeriod, isCalculated, onSaved }: {
  indicatorId: string; defaultPeriod: string; isCalculated: boolean; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(defaultPeriod.slice(0, 7));
  const [vals, setVals] = useState({ realizado: '', meta: '', estimativa: '' });
  const [saving, setSaving] = useState(false);

  async function save() {
    const hasAny = Object.values(vals).some((v) => v.trim() !== '');
    if (!hasAny) { toast.error('Informe pelo menos um valor'); return; }
    setSaving(true);
    try {
      const periodKey = `${month}-01`;
      const promises: Promise<any>[] = [];

      if (!isCalculated && vals.realizado.trim() !== '') {
        const v = parseFloat(vals.realizado.replace(',', '.'));
        if (!Number.isNaN(v)) promises.push(indicatorsApi.setRealized(indicatorId, { period: periodKey, value: v }));
      }
      if (vals.meta.trim() !== '') {
        const v = parseFloat(vals.meta.replace(',', '.'));
        if (!Number.isNaN(v)) promises.push(indicatorsApi.setGoal(indicatorId, { period: periodKey, value: v }));
      }
      // Estimativa: vazia → usa Realizado
      let estVal = vals.estimativa.trim() !== '' ? parseFloat(vals.estimativa.replace(',', '.')) : null;
      if (estVal === null && !isCalculated && vals.realizado.trim() !== '') {
        estVal = parseFloat(vals.realizado.replace(',', '.'));
      }
      if (estVal !== null && !Number.isNaN(estVal)) {
        promises.push(indicatorsApi.setEstimate(indicatorId, { period: periodKey, value: estVal }));
      }

      await Promise.all(promises);
      toast.success('Lançamento salvo. Recalculando...');
      setOpen(false);
      setVals({ realizado: '', meta: '', estimativa: '' });
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-1.5 mb-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-200 text-xs hover:bg-purple-600/30 transition-colors"
      >
        <Plus size={13} /> Novo lançamento
      </button>
    );
  }

  return (
    <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
      <div>
        <label className="text-[9px] text-white/30 uppercase tracking-wider">Período</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="w-full bg-white/5 border border-white/20 rounded text-xs text-white px-2 py-1.5 mt-0.5 focus:outline-none focus:border-purple-500" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: 'realizado', label: 'Realizado', disabled: isCalculated, hint: isCalculated ? 'Calculado automaticamente' : undefined },
          { key: 'meta', label: 'Meta' },
          { key: 'estimativa', label: 'Estimativa', hint: 'Vazio = usa Realizado' },
        ].map(({ key, label, disabled, hint }) => (
          <div key={key}>
            <label className="text-[9px] text-white/30 uppercase tracking-wider block mb-0.5">{label}</label>
            {hint && <p className="text-[8px] text-white/20 mb-0.5">{hint}</p>}
            <input
              type="number"
              value={vals[key as keyof typeof vals]}
              onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
              disabled={!!disabled}
              placeholder={disabled ? '—' : '0'}
              className="w-full bg-white/5 border border-white/15 focus:border-purple-500 rounded-lg text-xs text-white px-2 py-1.5 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            />
          </div>
        ))}
      </div>
      <p className="text-[9px] text-white/25">
        Campos em branco são ignorados · Se Estimativa vazia, assume o valor do Realizado
      </p>
      <div className="flex gap-2">
        <button onClick={() => { setOpen(false); setVals({ realizado: '', meta: '', estimativa: '' }); }}
          className="flex-1 py-1.5 rounded-lg border border-white/10 text-xs text-white/40 hover:bg-white/5 transition-colors">
          Cancelar
        </button>
        <button onClick={save} disabled={saving}
          className="flex-1 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-xs text-white disabled:opacity-50 transition-colors">
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Detail Panel ──────────────────────────────────────────────────────────

type Tab = 'overview' | 'realized';

interface Props {
  indicatorId: string;
  period: string;
  scenarioId?: string;
  onClose: () => void;
}

export function IndicatorDetailPanel({ indicatorId, period, scenarioId, onClose }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  // Plano vinculado ao indicador: o problema é implícito (o próprio indicador),
  // então o fluxo começa direto em Iniciativas → Ações.
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);
  const [autoNewInitiative, setAutoNewInitiative] = useState(false);

  const { data: indicator, isLoading, refetch } = useQuery({
    queryKey: ['indicator-detail', indicatorId, period],
    queryFn: () => indicatorsApi.get(indicatorId).then((r) => r.data),
  });

  const { data: flags } = useQuery({
    queryKey: ['settings-flags'],
    queryFn: () => settingsApi.getFlags().then((r) => r.data),
  });
  const showEstimate = flags?.showEstimate ?? true;

  const { data: plans = [] } = useQuery({
    queryKey: ['action-plans', { indicatorId }],
    queryFn: () => actionPlansApi.list({ indicatorId }).then((r) => r.data),
  });

  // Plano canônico do indicador (mais antigo) ou o recém-criado
  const canonicalPlanId: string | null = createdPlanId
    ?? ([...(plans as any[])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )[0]?.id ?? null);

  // Cria o plano implícito (problema = indicador) e já abre "Nova Iniciativa"
  const ensurePlanMutation = useMutation({
    mutationFn: () => actionPlansApi.ensureForIndicator(indicatorId).then((r) => r.data),
    onSuccess: (plan: any) => {
      setCreatedPlanId(plan.id);
      setAutoNewInitiative(true);
      qc.invalidateQueries({ queryKey: ['action-plans', { indicatorId }] });
      qc.invalidateQueries({ queryKey: ['action-plans'] });
    },
    onError: () => toast.error('Erro ao iniciar plano de ação'),
  });

  const ind = indicator as any;
  const direction = ind?.direction ?? 'HIGHER_IS_BETTER';
  const unit = ind?.unit ?? 'NUMBER';

  // ── Período de referência selecionado (mês de análise) ──────────────────────
  const refDate = new Date(period);
  const refYear = refDate.getUTCFullYear();
  const refMonth = refDate.getUTCMonth();
  const sameYM = (d: Date, y: number, m: number) => d.getUTCMonth() === m && d.getUTCFullYear() === y;

  // Série realizada ordenada ascendente
  const realizedAsc = [...(ind?.realizedValues ?? [])]
    .map((rv: any) => ({ period: new Date(rv.period), value: parseFloat(rv.value) }))
    .sort((a, b) => a.period.getTime() - b.period.getTime());

  // Ponto do mês de referência (e comparativos: mês anterior e ano anterior)
  const curPoint = realizedAsc.find((p) => sameYM(p.period, refYear, refMonth));
  const prevD = new Date(Date.UTC(refYear, refMonth - 1, 1));
  const prevPoint = realizedAsc.find((p) => sameYM(p.period, prevD.getUTCFullYear(), prevD.getUTCMonth()));
  const yoyPoint = realizedAsc.find((p) => sameYM(p.period, refYear - 1, refMonth));

  // Meta e estimativa vigentes no período de referência (carry-forward: último <= período)
  const goalRec = [...(ind?.goals ?? [])]
    .map((g: any) => ({ d: new Date(g.period), v: parseFloat(g.value) }))
    .filter((g) => g.d.getTime() <= refDate.getTime())
    .sort((a, b) => b.d.getTime() - a.d.getTime())[0];
  const estRec = [...(ind?.forecastValues ?? [])]
    .map((f: any) => ({ d: new Date(f.period), v: parseFloat(f.value) }))
    .filter((f) => f.d.getTime() <= refDate.getTime())
    .sort((a, b) => b.d.getTime() - a.d.getTime())[0];

  // Valores do período de referência
  const realized = curPoint ? curPoint.value : null;
  const goal = goalRec ? goalRec.v : null;
  const estimate = estRec ? estRec.v : null;
  const effective = (showEstimate ? estimate : null) ?? realized;

  // VS META
  const vsGoal = goal && effective != null && goal !== 0 ? ((effective - goal) / Math.abs(goal)) * 100 : null;
  const goodVsGoal = isImprovement(vsGoal, direction);
  // VS MÊS ANTERIOR (MoM)
  const mom = curPoint && prevPoint && prevPoint.value !== 0 ? ((curPoint.value - prevPoint.value) / Math.abs(prevPoint.value)) * 100 : null;
  const goodMom = isImprovement(mom, direction);
  // VS ANO ANTERIOR (YoY)
  const yoy = curPoint && yoyPoint && yoyPoint.value !== 0 ? ((curPoint.value - yoyPoint.value) / Math.abs(yoyPoint.value)) * 100 : null;
  const goodYoy = isImprovement(yoy, direction);
  // Diferença absoluta vs meta (para "X acima/abaixo")
  const goalDiff = (effective != null && goal != null) ? Math.abs(effective - goal) : null;

  // Dados do gráfico — janela de até 15 períodos terminando no mês selecionado
  const chartData: Pt[] = realizedAsc
    .filter((p) => p.period.getTime() <= refDate.getTime())
    .slice(-15)
    .map((p) => {
      const goalForPeriod = (ind?.goals ?? []).find((g: any) =>
        new Date(g.period).getUTCMonth() === p.period.getUTCMonth() &&
        new Date(g.period).getUTCFullYear() === p.period.getUTCFullYear());
      const prevYear = realizedAsc.find((q) => q.period.getUTCMonth() === p.period.getUTCMonth()
        && q.period.getUTCFullYear() === p.period.getUTCFullYear() - 1);
      return {
        period: p.period,
        value: p.value,
        goal: goalForPeriod ? parseFloat(goalForPeriod.value) : undefined,
        prevYear: prevYear?.value,
      };
    });

  const STATUS_BADGE = goodVsGoal === null
    ? { label: 'SEM META', dot: 'bg-white/30', color: 'text-white/40' }
    : goodVsGoal
    ? { label: 'NO ALVO', dot: 'bg-emerald-400', color: 'text-emerald-400' }
    : { label: 'FORA DO ALVO', dot: 'bg-red-400', color: 'text-red-400' };

  const realizedHistory = [...(ind?.realizedValues ?? [])].sort(
    (a: any, b: any) => new Date(b.period).getTime() - new Date(a.period).getTime());

  // Histórico unificado: merge de realizados + metas + estimativas por período
  const goalsByPeriod = new Map((ind?.goals ?? []).map((g: any) => [g.period.slice(0, 10), g]));
  const estimatesByPeriod = new Map((ind?.forecastValues ?? []).map((f: any) => [f.period.slice(0, 10), f]));
  const allPeriods = Array.from(new Set([
    ...(ind?.realizedValues ?? []).map((r: any) => r.period.slice(0, 10)),
    ...(ind?.goals ?? []).map((g: any) => g.period.slice(0, 10)),
    ...(ind?.forecastValues ?? []).map((f: any) => f.period.slice(0, 10)),
  ])).sort((a, b) => b.localeCompare(a));
  const realizedByPeriod = new Map(realizedHistory.map((r: any) => [r.period.slice(0, 10), r]));

  const dirLabel = direction === 'LOWER_IS_BETTER' ? 'Quanto menor, melhor' : 'Quanto maior, melhor';

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="w-[50vw] min-w-[460px] max-w-[800px] h-full bg-[#161b27] border-l border-white/10 flex flex-col overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 text-[10px]">
              <span className={cn('flex items-center gap-1.5 font-semibold uppercase tracking-wider', STATUS_BADGE.color)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_BADGE.dot)} />
                {STATUS_BADGE.label}
              </span>
              {!isLoading && (
                <span className="text-white/30">
                  {ind?.code} · {String(ind?.category ?? '').toUpperCase()} · {period.slice(0, 7)}
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors"><X size={16} /></button>
          </div>

          {isLoading ? (
            <div className="h-6 w-56 bg-white/5 rounded animate-pulse mt-2" />
          ) : (
            <p className="text-lg font-bold text-white leading-snug mt-1.5">{ind?.name}</p>
          )}

          {/* Polaridade + unidade */}
          {!isLoading && (
            <div className="flex items-center gap-2 mt-2">
              <span className="flex items-center gap-1.5 text-[10px] text-white/40">
                <span className={cn('w-2 h-2 rounded-sm', direction === 'LOWER_IS_BETTER' ? 'bg-blue-500' : 'bg-emerald-500')} />
                {dirLabel}
              </span>
              <span className="text-white/10">·</span>
              <span className="text-[10px] text-white/40">Medido em {UNIT_NAME[unit] ?? unit}</span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {[{ id: 'overview', label: 'Visão Geral' }, { id: 'realized', label: 'Lançamentos' }].map((t) => (
              <button
                key={t.id} onClick={() => setTab(t.id as Tab)}
                className={cn('text-xs px-3 py-1.5 rounded-lg transition-colors',
                  tab === t.id ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-white/40 hover:text-white/70')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'overview' && (
            <>
              {/* Métricas principais (3 colunas — Realizado / VS Ano Anterior / VS Meta)
                  separadas por divisórias verticais (sem caixas estilo KPI) */}
              <div className="px-5 py-4 border-b border-white/5 space-y-3">
                <div className="grid grid-cols-3">
                  {/* REALIZADO */}
                  <div className="flex flex-col pr-3">
                    <p className="text-[8px] font-semibold text-white/30 uppercase tracking-widest">Realizado</p>
                    <p className="text-[9px] text-white/35 mt-1">{fmtMonth(refDate)}</p>
                    <p className={cn('text-[26px] font-black mt-1 leading-none', goodVsGoal == null ? 'text-white' : goodVsGoal ? 'text-emerald-400' : 'text-red-400')}>
                      {fmtLarge(effective, unit)}
                    </p>
                  </div>

                  {/* VS ANO ANTERIOR — mostra o valor absoluto do ano anterior */}
                  <div className="flex flex-col px-3 border-l border-blue-500/40">
                    <p className="text-[8px] font-semibold text-white/30 uppercase tracking-widest">VS Ano Anterior</p>
                    <p className="text-[9px] text-white/35 mt-1">
                      {yoyPoint ? fmtMonth(yoyPoint.period) : 'Sem histórico'}
                    </p>
                    <p className={cn('text-[26px] font-black mt-1 leading-none', goodYoy == null ? 'text-white/40' : goodYoy ? 'text-emerald-400' : 'text-red-400')}>
                      {yoyPoint ? fmtLarge(yoyPoint.value, unit) : '—'}
                    </p>
                    {yoy != null && (
                      <div className={cn('flex items-center gap-1 mt-1.5 text-[9px]', goodYoy ? 'text-emerald-400/70' : 'text-red-400/70')}>
                        {goodYoy ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                        <span className="leading-tight">{yoy > 0 ? '+' : ''}{yoy.toFixed(0)}% {goodYoy ? 'Melhorou' : 'Piorou'}</span>
                      </div>
                    )}
                  </div>

                  {/* VS META — mostra diferença absoluta em unidade */}
                  <div className="flex flex-col pl-3 border-l border-blue-500/40">
                    <p className="text-[8px] font-semibold text-white/30 uppercase tracking-widest">VS Meta</p>
                    <p className="text-[9px] text-white/35 mt-1">
                      {goal != null ? `Meta: ${fmtLarge(goal, unit)}` : 'Sem meta definida'}
                    </p>
                    {(() => {
                      const diff = effective != null && goal != null ? effective - goal : null;
                      const sign = diff != null ? (diff >= 0 ? '+' : '') : '';
                      return (
                        <>
                          <p className={cn('text-[26px] font-black mt-1 leading-none', goodVsGoal == null ? 'text-white/40' : goodVsGoal ? 'text-emerald-400' : 'text-red-400')}>
                            {diff != null ? `${sign}${fmtLarge(diff, unit)}` : '—'}
                          </p>
                          {vsGoal != null && (
                            <div className={cn('flex items-center gap-1 mt-1.5 text-[9px]', goodVsGoal ? 'text-emerald-400/70' : 'text-red-400/70')}>
                              {goodVsGoal ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                              <span className="leading-tight">{Math.abs(vsGoal).toFixed(0)}% {goodVsGoal ? 'melhor que a meta' : 'pior que a meta'}</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Strip compacto removido — info movida para o header do Histórico */}
              </div>

              {/* Gráfico histórico */}
              <div className="px-5 py-4 border-b border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Histórico — {chartData.length} períodos</p>
                  <div className="flex items-center gap-1 text-[12px] font-semibold text-white/55">
                    <span>Mês anterior:</span>
                    <span className="text-white/85">{prevPoint ? fmtLarge(prevPoint.value, unit) : '—'}</span>
                    {mom != null && (
                      <span className={cn('font-bold', goodMom ? 'text-emerald-400' : 'text-red-400')}>
                        ({mom > 0 ? '+' : ''}{mom.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
                <HistoryChart data={chartData} direction={direction} unit={unit} currentGoal={goal} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <Legend swatch="bg-emerald-500/70" label="Atual + penúltimo (cor do status)" />
                  <Legend swatch="bg-indigo-400/50" label="Mesmo período ano anterior" />
                  <Legend line="border-white/40" label="Meta do período atual" />
                </div>
              </div>

              {/* Plano de Ação — vinculado ao indicador: problema implícito.
                  Fluxo: Indicador → Iniciativas → Ações (sem campo "Problema"). */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Plano de Ação</p>
                  {!canonicalPlanId && (
                    <button
                      onClick={() => ensurePlanMutation.mutate()}
                      disabled={ensurePlanMutation.isPending}
                      className="flex items-center gap-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Plus size={11} /> Nova Iniciativa
                    </button>
                  )}
                </div>

                {canonicalPlanId ? (
                  <ActionPlanDetail
                    planId={canonicalPlanId}
                    embedded
                    autoNewInitiative={autoNewInitiative}
                  />
                ) : (
                  <p className="text-xs text-white/20 text-center py-4">
                    Nenhuma iniciativa ainda. Clique em <span className="text-white/40">Nova Iniciativa</span> para começar.
                  </p>
                )}
              </div>
            </>
          )}

          {tab === 'realized' && (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Lançamentos</p>
                <span className="text-[10px] text-white/30">{allPeriods.length} registros</span>
              </div>

              {ind?.type === 'CALCULATED' && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300">
                  Indicador calculado — Realizado gerado automaticamente pela fórmula. Meta e Estimativa podem ser informadas manualmente.
                </div>
              )}

              <NewEntryForm
                indicatorId={indicatorId}
                defaultPeriod={period}
                isCalculated={ind?.type === 'CALCULATED'}
                onSaved={() => refetch()}
              />

              {/* Cabeçalho das colunas */}
              {allPeriods.length > 0 && (
                <div className="grid grid-cols-3 gap-2 text-right mb-1 px-1 pr-8">
                  <div />
                  {['Realizado', 'Meta', 'Estimativa'].map((h) => (
                    <p key={h} className="text-[8px] text-white/25 uppercase tracking-wider col-span-1">{h}</p>
                  ))}
                </div>
              )}

              {allPeriods.length === 0 ? (
                <p className="text-xs text-white/20 text-center py-8">Nenhum valor lançado.</p>
              ) : (
                <div>
                  {allPeriods.map((p) => (
                    <PeriodRow
                      key={p}
                      period={p}
                      realized={realizedByPeriod.get(p)}
                      goal={goalsByPeriod.get(p)}
                      estimate={estimatesByPeriod.get(p)}
                      unit={unit}
                      indicatorId={indicatorId}
                      isCalculated={ind?.type === 'CALCULATED'}
                      onSaved={() => refetch()}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ swatch, line, label }: { swatch?: string; line?: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {swatch && <div className={cn('w-2 h-2 rounded-sm', swatch)} />}
      {line && <div className={cn('w-4 border-t border-dashed', line)} />}
      <span className="text-[9px] text-white/30">{label}</span>
    </div>
  );
}
