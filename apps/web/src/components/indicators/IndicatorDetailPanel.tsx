'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, TrendingUp, TrendingDown,
  Plus, Pencil, Check, ArrowUp, ArrowDown, ClipboardList,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { indicatorsApi, actionPlansApi, settingsApi } from '../../lib/api';
import { ActionPlanDetail } from '../action-plans/ActionPlanDetail';
import { cn, formatValue, humanizeExpression } from '../../lib/utils';
import { useEscClose } from '../../lib/useEscClose';
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

// Valor curto para rótulo sobre as barras do gráfico. `decimals` = casas
// configuradas no indicador (aplicado nos valores não abreviados; M/k mantêm 1).
function fmtBar(v: number | null | undefined, unit: string, decimals = 2): string {
  if (v == null) return '';
  if (unit === 'PERCENTAGE') return `${v.toFixed(decimals)}%`;
  if (unit === 'DAYS') return `${v.toFixed(decimals)}`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v.toFixed(decimals)}`;
}

function fmtLarge(v: number | null | undefined, unit: string, decimals = 2): string {
  if (v == null) return '—';
  if (unit === 'PERCENTAGE') return `${v.toFixed(decimals)}%`;
  if (unit === 'CURRENCY') {
    if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)} M`;
    if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toFixed(1)} k`;
    return `R$ ${v.toFixed(decimals)}`;
  }
  if (unit === 'DAYS') return `${v.toFixed(decimals)} d`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)} k`;
  return v.toFixed(decimals);
}


// melhora segundo a polaridade: variação favorável quando o sentido bate com a direção
function isImprovement(pct: number | null, direction: string): boolean | null {
  if (pct === null) return null;
  return direction === 'LOWER_IS_BETTER' ? pct <= 0 : pct >= 0;
}

// ─── History Chart (bars + YoY ghost + meta dashed + MoM dashed trend) ─────────

interface Pt { period: Date; value: number; goal?: number; prevYear?: number }

function HistoryChart({ data, direction, unit, currentGoal, decimals = 2 }: {
  data: Pt[]; direction: string; unit: string; currentGoal?: number | null; decimals?: number;
}) {
  const [tooltip, setTooltip] = useState<{ i: number; x: number; y: number } | null>(null);

  if (!data.length) {
    return <div className="h-32 flex items-center justify-center text-white/20 text-xs">Sem dados históricos</div>;
  }

  const pts = data.slice(-15);
  const n = pts.length;
  const step = 50;
  const barW = step * 0.88; // barras largas, separação mínima entre elas
  const chartW = n * step;
  const chartH = 172; // gráfico com mais altura (elemento de destaque)
  const pad = 8; // margem lateral mínima — barras quase encostam nas bordas do modal
  const topPad = 62; // espaço para as duas linhas YoY acima das barras

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
    yoyPairs.push({ recentIdx: ri, prevIdx: pi, pct, good, lineY: offset === 0 ? topPad - 16 : topPad - 38 });
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
          const monthName = MESES[pts[pair.recentIdx].period.getUTCMonth()];
          const label = `${monthName} ${pair.pct > 0 ? '+' : ''}${pair.pct.toFixed(1)}% YoY`;
          const labelW = label.length * 7.4 + 14;
          return (
            <g key={`yoy-${pi}`}>
              <line x1={lx1} x2={lx2} y1={ly} y2={ly} stroke={color} strokeWidth={1} strokeDasharray="4 3" />
              <line x1={lx1} x2={lx1} y1={ly - 5} y2={ly + 5} stroke={color} strokeWidth={1.5} />
              <line x1={lx2} x2={lx2} y1={ly - 5} y2={ly + 5} stroke={color} strokeWidth={1.5} />
              <rect x={midX - labelW / 2} y={ly - 11} width={labelW} height={18} rx={4} fill="#161b27" />
              <text x={midX} y={ly + 2} textAnchor="middle" fontSize="13" fontWeight="800" fill={labelColor}>
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
            <text x={fullW - pad - 2} y={y(goalLine) - 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.35)">
              meta {fmtBar(goalLine, unit, decimals)}
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

          const isComparison = isRecent || isPrevYear;
          const hovered = tooltip?.i === i;
          const labelSize = hovered ? 20 : (isComparison ? 13 : 12);
          return (
            <g key={`b-${i}`}
              onMouseEnter={() => setTooltip({ i, x: x(i), y: y(p.value) })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'crosshair' }}
            >
              {/* área de hover maior que a barra */}
              <rect x={x(i) - barW / 2 - 4} width={barW + 8} y={topPad} height={baseY - topPad} rx={0} fill="transparent" />
              {(() => {
                const bw = hovered ? barW + 4 : barW;
                return (
                  <rect
                    x={x(i) - bw / 2} width={bw} y={y(p.value)} height={baseY - y(p.value)} rx={3}
                    fill={barColor}
                    stroke={hovered ? 'rgba(255,255,255,0.55)' : 'none'}
                    strokeWidth={hovered ? 1.5 : 0}
                    opacity={hovered ? 1 : 0.9}
                    style={{ transition: 'all 0.12s ease-out', filter: hovered ? 'drop-shadow(0 0 6px rgba(255,255,255,0.25))' : 'none' }}
                  />
                );
              })()}
              {p.value != null && (
                <text
                  x={x(i)}
                  y={y(p.value) - (hovered ? 13 : isComparison ? 8 : 7)}
                  textAnchor="middle"
                  fontSize={labelSize}
                  fontWeight={hovered ? 800 : isComparison ? 700 : 600}
                  fill={hovered ? '#ffffff' : isComparison ? labelColor : 'rgba(255,255,255,0.55)'}
                  style={{ transition: 'font-size 0.12s ease-out' }}
                >
                  {fmtBar(p.value, unit, decimals)}
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
              fontSize="11" fontWeight={highlight ? 700 : 400}
              fill={highlight ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)'}
              transform={`rotate(-45,${x(i)},${baseY + 6})`}
            >
              {fmtMonthCompact(p.period)}
            </text>
          );
        })}

      </svg>
    </div>
  );
}

// ─── Linha de histórico unificado (Realizado + Meta + Estimativa) ─────────────

function PeriodRow({
  period, realized, goal, estimate, unit, indicatorId, isCalculated, onSaved, decimals = 2,
}: {
  period: string; // ISO date string
  realized?: any; goal?: any; estimate?: any;
  unit: string; indicatorId: string; isCalculated: boolean; onSaved: () => void; decimals?: number;
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

  const fv = (v: any) => v != null ? formatValue(parseFloat(v.value), unit as any, decimals) : '—';

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
  // Painel lateral do Plano de Ação (abre à direita, empurra o gráfico p/ a esquerda)
  const [showActionPlan, setShowActionPlan] = useState(false);
  // Plano vinculado ao indicador: o problema é implícito (o próprio indicador),
  // então o fluxo começa direto em Iniciativas → Ações.
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);
  const [autoNewInitiative, setAutoNewInitiative] = useState(false);
  // Rodapé expansível com as frentes de trabalho (monitoringPoints) — fechado por padrão.
  const [showFrentes, setShowFrentes] = useState(false);
  // Rodapé expansível com a composição (fórmula + leitura) — só p/ CALCULATED.
  const [showComposicao, setShowComposicao] = useState(false);

  // ESC via pilha global (useEscClose): fecha sempre a camada mais recente.
  // O modal do gráfico registra primeiro; o painel do Plano de Ação registra
  // por cima quando aberto — então ESC fecha 1º o plano, depois o gráfico.
  useEscClose(onClose);
  useEscClose(() => setShowActionPlan(false), showActionPlan);

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
  const dp = ind?.decimalPlaces ?? 2; // casas decimais configuradas no indicador
  const monitoringPoints: string[] = ind?.monitoringPoints ?? []; // frentes de trabalho cadastradas

  // ── Composição do indicador (fórmula + leitura amigável) ────────────────────
  const formulaExpr: string | null = ind?.formula?.expression ?? null;
  const { data: allInds = [] } = useQuery({
    queryKey: ['indicators'],
    queryFn: () => indicatorsApi.list().then((r) => r.data),
    enabled: !!formulaExpr, // só busca quando há fórmula para humanizar
  });
  const formulaReading = (() => {
    const variables: Record<string, string> = ind?.formula?.variables ?? {};
    if (!formulaExpr || Object.keys(variables).length === 0) return '';
    const byId = new Map((allInds as any[]).map((i) => [i.id, i.name]));
    const tokenToName: Record<string, string> = {};
    for (const [alias, indId] of Object.entries(variables)) {
      tokenToName[alias] = byId.get(indId as string) ?? alias;
    }
    return humanizeExpression(formulaExpr, tokenToName);
  })();

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


  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex h-full">
      {/* Painel principal (gráfico) — fica à esquerda quando o Plano de Ação abre */}
      <div
        className="w-[48vw] min-w-[440px] max-w-[820px] h-full bg-[#161b27] border-l border-white/10 flex flex-col overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/5">
          <div className="flex items-start justify-end">
            <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors"><X size={16} /></button>
          </div>

          {isLoading ? (
            <div className="h-6 w-56 bg-white/5 rounded animate-pulse mt-2" />
          ) : (
            <div className="flex items-center gap-2 mt-1.5">
              {/* Seta de direção (igual aos cards): ↑ verde = maior melhor; ↓ azul = menor melhor */}
              {direction === 'LOWER_IS_BETTER'
                ? <ArrowDown size={18} strokeWidth={3} className="flex-shrink-0 text-blue-500" />
                : <ArrowUp size={18} strokeWidth={3} className="flex-shrink-0 text-green-500" />}
              <p className="text-lg font-bold text-white leading-snug">{ind?.name}</p>
            </div>
          )}

          {/* Descrição / conceito do indicador (só se houver) */}
          {!isLoading && ind?.description && (
            <p className="text-[13px] text-white/50 leading-relaxed mt-2 max-w-prose whitespace-pre-line">
              {ind.description}
            </p>
          )}

          {/* Tabs + botão Plano de Ação (abre painel lateral) */}
          <div className="flex items-center gap-1 mt-4">
            {[{ id: 'overview', label: 'Visão Geral' }, { id: 'realized', label: 'Lançamentos' }].map((t) => (
              <button
                key={t.id} onClick={() => setTab(t.id as Tab)}
                className={cn('text-xs px-3 py-1.5 rounded-lg transition-colors',
                  tab === t.id ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-white/40 hover:text-white/70')}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => setShowActionPlan((s) => !s)}
              className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ml-1',
                showActionPlan ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'text-white/40 hover:text-white/70 border border-transparent')}
            >
              <ClipboardList size={13} /> Plano de Ação
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'overview' && (
            <>
              {/* Métricas principais (3 colunas — Realizado / VS Ano Anterior / VS Meta)
                  separadas por divisórias verticais (sem caixas estilo KPI) */}
              {/* Métricas principais — versão compacta (label+data numa linha, valor menor, Δ inline) */}
              <div className="px-5 py-3 border-b border-white/5">
                <div className="grid grid-cols-3 gap-2">
                  {/* REALIZADO */}
                  <div className="pr-3 min-w-0">
                    <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider truncate">
                      Realizado · {fmtMonth(refDate)}
                    </p>
                    <p className={cn('text-lg font-bold leading-tight mt-0.5', goodVsGoal == null ? 'text-white' : goodVsGoal ? 'text-emerald-400' : 'text-red-400')}>
                      {fmtLarge(effective, unit, dp)}
                    </p>
                  </div>

                  {/* VS ANO ANTERIOR */}
                  <div className="px-3 border-l border-white/10 min-w-0">
                    <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider truncate">
                      Ano anterior{yoyPoint ? ` · ${fmtMonth(yoyPoint.period)}` : ''}
                    </p>
                    <p className={cn('text-lg font-bold leading-tight mt-0.5', goodYoy == null ? 'text-white/40' : goodYoy ? 'text-emerald-400' : 'text-red-400')}>
                      {yoyPoint ? fmtLarge(yoyPoint.value, unit, dp) : '—'}
                    </p>
                    {yoy != null && (
                      <span className={cn('inline-flex items-center gap-0.5 text-[9px] mt-0.5', goodYoy ? 'text-emerald-400/70' : 'text-red-400/70')}>
                        {goodYoy ? <TrendingUp size={9} /> : <TrendingDown size={9} />}{yoy > 0 ? '+' : ''}{yoy.toFixed(0)}%
                      </span>
                    )}
                  </div>

                  {/* VS META */}
                  <div className="pl-3 border-l border-white/10 min-w-0">
                    <p className="text-[9px] font-semibold text-white/30 uppercase tracking-wider truncate">
                      Meta{goal != null ? ` · ${fmtLarge(goal, unit, dp)}` : ''}
                    </p>
                    {(() => {
                      const diff = effective != null && goal != null ? effective - goal : null;
                      const sign = diff != null ? (diff >= 0 ? '+' : '') : '';
                      return (
                        <>
                          <p className={cn('text-lg font-bold leading-tight mt-0.5', goodVsGoal == null ? 'text-white/40' : goodVsGoal ? 'text-emerald-400' : 'text-red-400')}>
                            {diff != null ? `${sign}${fmtLarge(diff, unit, dp)}` : (goal == null ? 'Sem meta' : '—')}
                          </p>
                          {vsGoal != null && (
                            <span className={cn('inline-flex items-center gap-0.5 text-[9px] mt-0.5', goodVsGoal ? 'text-emerald-400/70' : 'text-red-400/70')}>
                              {goodVsGoal ? <TrendingUp size={9} /> : <TrendingDown size={9} />}{Math.abs(vsGoal).toFixed(0)}%
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Gráfico histórico */}
              <div className="px-5 py-4 border-b border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Histórico — {chartData.length} períodos</p>
                  <div className="flex items-center gap-1 text-[12px] font-semibold text-white/55">
                    <span>Mês anterior:</span>
                    <span className="text-white/85">{prevPoint ? fmtLarge(prevPoint.value, unit, dp) : '—'}</span>
                    {mom != null && (
                      <span className={cn('font-bold', goodMom ? 'text-emerald-400' : 'text-red-400')}>
                        ({mom > 0 ? '+' : ''}{mom.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
                {/* -mx-4 faz o gráfico "sangrar" para fora do padding, aproximando as barras das bordas do modal */}
                <div className="-mx-4">
                  <HistoryChart data={chartData} direction={direction} unit={unit} currentGoal={goal} decimals={dp} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <Legend swatch="bg-emerald-500/70" label="Atual + penúltimo (cor do status)" />
                  <Legend swatch="bg-indigo-400/50" label="Mesmo período ano anterior" />
                  <Legend line="border-white/40" label="Meta do período atual" />
                </div>

                {/* Rodapé: composição do indicador (fórmula + leitura) — sempre antes das frentes */}
                {formulaExpr && (
                  <div className="mt-3 border-t border-white/5 pt-2.5">
                    <button
                      onClick={() => setShowComposicao((s) => !s)}
                      className="w-full flex items-center gap-1.5 text-[11px] font-semibold text-white/45 hover:text-white/75 uppercase tracking-wider transition-colors"
                    >
                      {showComposicao ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      Composição do indicador
                    </button>
                    {showComposicao && (
                      <div className="mt-2.5 pl-1 space-y-2">
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
                          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Fórmula</p>
                          <code className="text-[13px] text-purple-200 font-mono">{formulaExpr}</code>
                        </div>
                        {formulaReading && (
                          <div className="p-3 rounded-xl bg-purple-500/[0.06] border border-purple-500/15">
                            <p className="text-[10px] text-purple-300/70 uppercase tracking-wider mb-1">Leitura</p>
                            <p className="text-[13px] text-white/80 leading-snug">{formulaReading}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Rodapé: frentes de trabalho (expander fechado por padrão) */}
                <div className="mt-3 border-t border-white/5 pt-2.5">
                  <button
                    onClick={() => setShowFrentes((s) => !s)}
                    className="w-full flex items-center gap-1.5 text-[11px] font-semibold text-white/45 hover:text-white/75 uppercase tracking-wider transition-colors"
                  >
                    {showFrentes ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    Frentes de trabalho
                    {monitoringPoints.length > 0 && (
                      <span className="text-white/25 normal-case tracking-normal">({monitoringPoints.length})</span>
                    )}
                  </button>
                  {showFrentes && (
                    <div className="mt-2.5 pl-1">
                      {monitoringPoints.length > 0 ? (
                        <ul className="space-y-2">
                          {monitoringPoints.map((point, i) => (
                            <li key={i} className="flex items-start gap-2.5 text-[13px] text-white/75">
                              <span className="text-purple-400 mt-1.5 text-[8px] flex-shrink-0">●</span>
                              <span className="leading-snug whitespace-pre-line">{point}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-white/25 py-1">
                          Nenhuma frente de trabalho cadastrada para este indicador.
                        </p>
                      )}
                    </div>
                  )}
                </div>
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
                      decimals={ind?.decimalPlaces ?? 2}
                      onSaved={() => refetch()}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Painel do Plano de Ação — largura anima (0 → 40vw); o gráfico à esquerda continua visível */}
      <div
        className={cn('h-full bg-[#141926] overflow-hidden shadow-2xl transition-all duration-300 ease-out',
          showActionPlan ? 'w-[40vw] min-w-[360px] max-w-[600px] border-l border-white/10' : 'w-0')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-[40vw] min-w-[360px] max-w-[600px] h-full flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ClipboardList size={16} className="text-blue-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-white leading-tight">Plano de Ação</p>
                <p className="text-[10px] text-white/40 truncate">{ind?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!canonicalPlanId && (
                <button
                  onClick={() => ensurePlanMutation.mutate()}
                  disabled={ensurePlanMutation.isPending}
                  className="flex items-center gap-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Plus size={11} /> Nova Iniciativa
                </button>
              )}
              <button onClick={() => setShowActionPlan(false)} className="text-white/30 hover:text-white/60 transition-colors"><X size={16} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {canonicalPlanId ? (
              <ActionPlanDetail planId={canonicalPlanId} embedded showFilters autoNewInitiative={autoNewInitiative} />
            ) : (
              <p className="text-xs text-white/20 text-center py-8">
                Nenhuma iniciativa ainda. Clique em <span className="text-white/40">Nova Iniciativa</span> para começar.
              </p>
            )}
          </div>
        </div>
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
