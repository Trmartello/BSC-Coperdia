'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, TrendingUp, TrendingDown, ClipboardList,
  Plus, ChevronRight, ChevronLeft, Pencil, Check,
} from 'lucide-react';
import { indicatorsApi, actionPlansApi, settingsApi } from '../../lib/api';
import { ActionPlanDetail } from '../action-plans/ActionPlanDetail';
import { cn, formatValue } from '../../lib/utils';
import { toast } from 'sonner';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function fmtMonth(d: Date) {
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

// Rótulo compacto para o eixo do gráfico: "Mai'26"
function fmtMonthCompact(d: Date) {
  return `${MESES[d.getMonth()]}'${String(d.getFullYear()).slice(2)}`;
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
  if (!data.length) {
    return <div className="h-32 flex items-center justify-center text-white/20 text-xs">Sem dados históricos</div>;
  }

  const pts = data.slice(-15);
  const n = pts.length;
  const step = 38;
  const barW = 16;
  const chartW = n * step;
  const chartH = 110;
  const pad = 16;
  const topPad = 16; // espaço para os rótulos de valor acima das barras

  const allVals = pts.flatMap((p) => [p.value, p.goal ?? 0, p.prevYear ?? 0]).filter((v) => v > 0);
  const maxVal = Math.max(...allVals, 1);

  const x = (i: number) => pad + i * step + step / 2;
  const y = (v: number) => topPad + (chartH - (v / maxVal) * chartH);

  // polyline MoM (evolução mês a mês) através dos topos das barras
  const momPath = pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  // polyline YoY (mesmo período do ano anterior) onde houver dado
  const yoyPts = pts.map((p, i) => (p.prevYear ? `${x(i)},${y(p.prevYear)}` : null)).filter(Boolean) as string[];

  // status por barra: usa a meta do período; nas duas barras mais recentes,
  // recorre à meta atual como referência (legenda "atual + penúltimo — cor do status")
  const statusOf = (p: Pt, i: number): boolean | null => {
    const isRecent = i >= n - 2;
    const g = p.goal ?? (isRecent ? currentGoal ?? undefined : undefined);
    if (g == null) return null;
    return direction === 'LOWER_IS_BETTER' ? p.value <= g : p.value >= g;
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg width="100%" height={topPad + chartH + 26} viewBox={`0 0 ${chartW + pad * 2} ${topPad + chartH + 26}`} preserveAspectRatio="xMidYMid meet">
        {/* meta — segmentos pontilhados horizontais por período */}
        {pts.map((p, i) => {
          const isRecent = i >= n - 2;
          const g = p.goal ?? (isRecent ? currentGoal ?? undefined : undefined);
          return g != null ? (
            <line
              key={`g-${i}`}
              x1={x(i) - barW} x2={x(i) + barW}
              y1={y(g)} y2={y(g)}
              stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeDasharray="3 2"
            />
          ) : null;
        })}

        {/* barras: fantasma (ano anterior) + atual (cor do status) */}
        {pts.map((p, i) => {
          const good = statusOf(p, i);
          const barColor = good === null ? 'rgba(255,255,255,0.25)' : good ? 'rgba(16,185,129,0.85)' : 'rgba(239,68,68,0.85)';
          const labelColor = good === null ? 'rgba(255,255,255,0.45)' : good ? 'rgba(52,211,153,0.95)' : 'rgba(248,113,113,0.95)';
          return (
            <g key={`b-${i}`}>
              {p.prevYear != null && (
                <rect
                  x={x(i) - barW / 2 - 3} width={barW * 0.55}
                  y={y(p.prevYear)} height={topPad + chartH - y(p.prevYear)}
                  rx={2} fill="rgba(129,140,248,0.45)"
                />
              )}
              <rect
                x={x(i) - barW / 2 + (p.prevYear != null ? 3 : 0)} width={barW * (p.prevYear != null ? 0.7 : 1)}
                y={y(p.value)} height={topPad + chartH - y(p.value)}
                rx={2} fill={barColor}
              />
              {/* rótulo de valor acima da barra */}
              <text x={x(i)} y={y(p.value) - 4} textAnchor="middle" fontSize="7.5" fontWeight="600" fill={labelColor}>
                {fmtBar(p.value, unit)}
              </text>
            </g>
          );
        })}

        {/* linha pontilhada — evolução mês a mês (MoM) */}
        <polyline points={momPath} fill="none" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="5 3" />
        {pts.map((p, i) => (
          <circle key={`mc-${i}`} cx={x(i)} cy={y(p.value)} r={2} fill="#a78bfa" />
        ))}

        {/* linha pontilhada — mesmo período ano anterior (YoY) */}
        {yoyPts.length > 1 && (
          <polyline points={yoyPts.join(' ')} fill="none" stroke="rgba(129,140,248,0.7)" strokeWidth={1.2} strokeDasharray="2 3" />
        )}

        {/* labels de período (mostra alguns para não poluir) */}
        {pts.map((p, i) =>
          (i === 0 || i === n - 1 || i % 3 === 0) ? (
            <text key={`t-${i}`} x={x(i)} y={topPad + chartH + 16} textAnchor="middle" fontSize="7.5" fill="rgba(255,255,255,0.35)">
              {fmtMonthCompact(p.period)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

// ─── Realized Value Row (edição inline) ────────────────────────────────────────

function RealizedRow({ rv, unit, indicatorId, onSaved }: {
  rv: any; unit: any; indicatorId: string; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(parseFloat(rv.value)));
  const [saving, setSaving] = useState(false);
  const period = new Date(rv.period).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

  async function save() {
    setSaving(true);
    try {
      await indicatorsApi.setRealized(indicatorId, { period: rv.period.slice(0, 10), value: parseFloat(val) });
      toast.success('Valor corrigido');
      setEditing(false);
      onSaved();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <span className="text-[11px] text-white/40 w-16 flex-shrink-0">{period}</span>
      {editing ? (
        <div className="flex items-center gap-1 flex-1">
          <input
            type="number" value={val} onChange={(e) => setVal(e.target.value)} autoFocus
            className="flex-1 bg-white/5 border border-white/20 rounded text-xs text-white px-2 py-0.5 focus:outline-none focus:border-purple-500 min-w-0"
          />
          <button onClick={save} disabled={saving} className="text-emerald-400 hover:text-emerald-300 p-1 disabled:opacity-50"><Check size={12} /></button>
          <button onClick={() => { setEditing(false); setVal(String(parseFloat(rv.value))); }} className="text-white/30 hover:text-white/60 p-1"><X size={12} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-1 justify-end">
          <span className="text-xs font-medium text-white/80">{formatValue(parseFloat(rv.value), unit)}</span>
          <button onClick={() => setEditing(true)} className="text-white/20 hover:text-white/60 p-1 transition-colors"><Pencil size={11} /></button>
        </div>
      )}
    </div>
  );
}

// ─── Novo lançamento manual (apenas indicadores de entrada) ─────────────────────

function NewRealizedForm({ indicatorId, defaultPeriod, onSaved }: {
  indicatorId: string; defaultPeriod: string; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(defaultPeriod.slice(0, 7));
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const v = parseFloat(value.replace(',', '.'));
    if (Number.isNaN(v)) { toast.error('Informe um valor numérico'); return; }
    setSaving(true);
    try {
      await indicatorsApi.setRealized(indicatorId, { period: `${month}-01`, value: v });
      toast.success('Lançamento salvo. Recalculando fórmulas...');
      setOpen(false); setValue('');
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao salvar lançamento');
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
    <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[9px] text-white/30 uppercase tracking-wider">Período</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="w-full bg-white/5 border border-white/20 rounded text-xs text-white px-2 py-1.5 mt-0.5 focus:outline-none focus:border-purple-500" />
        </div>
        <div className="flex-1">
          <label className="text-[9px] text-white/30 uppercase tracking-wider">Valor</label>
          <input type="number" value={value} onChange={(e) => setValue(e.target.value)} autoFocus placeholder="0"
            className="w-full bg-white/5 border border-white/20 rounded text-xs text-white px-2 py-1.5 mt-0.5 focus:outline-none focus:border-purple-500" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => { setOpen(false); setValue(''); }} className="flex-1 py-1.5 rounded-lg border border-white/10 text-xs text-white/40 hover:bg-white/5">Cancelar</button>
        <button onClick={save} disabled={saving} className="flex-1 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-xs text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
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
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newProblem, setNewProblem] = useState('');
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

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

  const createPlanMutation = useMutation({
    mutationFn: () => actionPlansApi.create({ problem: newProblem, indicatorId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['action-plans', { indicatorId }] });
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      toast.success('Plano de ação criado');
      setShowNewPlan(false);
      setNewProblem('');
      setOpenPlanId(res.data.id);
    },
  });

  const ind = indicator as any;

  // Valores do período atual
  const realized = ind?.realizedValues?.[0]?.value ? parseFloat(ind.realizedValues[0].value) : null;
  const goal = ind?.goals?.[0]?.value ? parseFloat(ind.goals[0].value) : null;
  const estimate = ind?.forecastValues?.[0]?.value ? parseFloat(ind.forecastValues[0].value) : null;
  const effective = (showEstimate ? estimate : null) ?? realized;
  const direction = ind?.direction ?? 'HIGHER_IS_BETTER';
  const unit = ind?.unit ?? 'NUMBER';

  // Série realizada ordenada ascendente
  const realizedAsc = [...(ind?.realizedValues ?? [])]
    .map((rv: any) => ({ period: new Date(rv.period), value: parseFloat(rv.value) }))
    .sort((a, b) => a.period.getTime() - b.period.getTime());

  const curPoint = realizedAsc[realizedAsc.length - 1];
  const prevPoint = realizedAsc[realizedAsc.length - 2];
  const yoyPoint = curPoint
    ? realizedAsc.find((p) => p.period.getMonth() === curPoint.period.getMonth()
        && p.period.getFullYear() === curPoint.period.getFullYear() - 1)
    : undefined;

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

  // Dados do gráfico
  const chartData: Pt[] = realizedAsc.slice(-15).map((p) => {
    const goalForPeriod = (ind?.goals ?? []).find((g: any) =>
      new Date(g.period).getMonth() === p.period.getMonth() &&
      new Date(g.period).getFullYear() === p.period.getFullYear());
    const prevYear = realizedAsc.find((q) => q.period.getMonth() === p.period.getMonth()
      && q.period.getFullYear() === p.period.getFullYear() - 1);
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

  const dirLabel = direction === 'LOWER_IS_BETTER' ? 'Quanto menor, melhor' : 'Quanto maior, melhor';

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="w-[420px] h-full bg-[#161b27] border-l border-white/10 flex flex-col overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Guided action plan overlay */}
        {openPlanId && (
          <div className="absolute inset-0 z-10 bg-[#161b27] flex flex-col overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-white/5 flex items-center gap-2 flex-shrink-0">
              <button onClick={() => setOpenPlanId(null)} className="text-white/40 hover:text-white/70 transition-colors flex items-center gap-1 text-xs">
                <ChevronLeft size={14} /> Voltar
              </button>
              <span className="text-xs text-white/30">Plano de Ação</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ActionPlanDetail planId={openPlanId} asPanel />
            </div>
          </div>
        )}
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
                    <p className="text-[9px] text-white/35 mt-1">{curPoint ? fmtMonth(curPoint.period) : '—'}</p>
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

                {/* Strip compacto: mês anterior + estimativa */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-white/35 border-t border-white/5 pt-2">
                  <span>
                    Mês anterior:{' '}
                    <span className="text-white/60">{prevPoint ? fmtLarge(prevPoint.value, unit) : '—'}</span>
                    {mom != null && (
                      <span className={cn('ml-1', goodMom ? 'text-emerald-400/80' : 'text-red-400/80')}>
                        ({mom > 0 ? '+' : ''}{mom.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                  {showEstimate && (
                    <span>
                      Estimativa: <span className="text-white/60">{fmtLarge(estimate, unit)}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Gráfico histórico */}
              <div className="px-5 py-4 border-b border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Histórico — {chartData.length} períodos</p>
                  {yoy != null && (
                    <span className={cn('text-[10px] font-semibold', goodYoy ? 'text-emerald-400' : 'text-red-400')}>
                      {yoy > 0 ? '+' : ''}{yoy.toFixed(1)}% YoY
                    </span>
                  )}
                </div>
                <HistoryChart data={chartData} direction={direction} unit={unit} currentGoal={goal} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <Legend swatch="bg-emerald-500/70" label="Atual + penúltimo (cor do status)" />
                  <Legend swatch="bg-indigo-400/50" label="Mesmo período ano anterior" />
                  <Legend line="border-white/40" label="Meta do período atual" />
                </div>
              </div>

              {/* Planos de ação */}
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Plano de Ação</p>
                  <button onClick={() => setShowNewPlan(true)} className="flex items-center gap-1 text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg transition-colors">
                    <Plus size={11} /> Nova Ação
                  </button>
                </div>

                {showNewPlan && (
                  <div className="mb-3 space-y-2">
                    <textarea value={newProblem} onChange={(e) => setNewProblem(e.target.value)}
                      placeholder="Descreva o problema a resolver..." rows={2} className="input-dark resize-none text-xs" />
                    <div className="flex gap-2">
                      <button onClick={() => setShowNewPlan(false)} className="flex-1 py-1.5 rounded-xl border border-white/10 text-xs text-white/40 hover:bg-white/5">Cancelar</button>
                      <button onClick={() => createPlanMutation.mutate()} disabled={!newProblem.trim() || createPlanMutation.isPending}
                        className="flex-1 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-xs text-white disabled:opacity-50">Criar plano</button>
                    </div>
                  </div>
                )}

                {(plans as any[]).length === 0 && !showNewPlan ? (
                  <p className="text-xs text-white/20 text-center py-4">Nenhum plano vinculado.</p>
                ) : (
                  <div className="space-y-2">
                    {(plans as any[]).map((plan: any) => {
                      const totalActions = plan.initiatives?.reduce((acc: number, ini: any) => acc + (ini.actions?.length ?? 0), 0) ?? 0;
                      const doneActions = plan.initiatives?.reduce((acc: number, ini: any) => acc + (ini.actions?.filter((a: any) => a.status === 'DONE').length ?? 0), 0) ?? 0;
                      return (
                        <div key={plan.id} className="bg-white/[0.03] rounded-xl p-3 hover:bg-white/[0.05] transition-colors cursor-pointer" onClick={() => setOpenPlanId(plan.id)}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-white/70 leading-snug flex-1">{plan.problem}</p>
                            <ChevronRight size={12} className="text-white/20 flex-shrink-0 mt-0.5" />
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border',
                              plan.status === 'DONE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : plan.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : 'bg-white/5 text-white/30 border-white/10')}>
                              {plan.status === 'DONE' ? 'Concluído' : plan.status === 'IN_PROGRESS' ? 'Em andamento' : 'Aberto'}
                            </span>
                            {totalActions > 0 && <span className="text-[10px] text-white/30">{doneActions}/{totalActions} ações</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'realized' && (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Lançamentos Realizados</p>
                <span className="text-[10px] text-white/30">{realizedHistory.length} registros</span>
              </div>
              {ind?.type === 'CALCULATED' ? (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300">
                  Indicador calculado. Valores gerados automaticamente pela fórmula.
                </div>
              ) : (
                <NewRealizedForm indicatorId={indicatorId} defaultPeriod={period} onSaved={() => refetch()} />
              )}
              {realizedHistory.length === 0 ? (
                <p className="text-xs text-white/20 text-center py-8">Nenhum valor lançado.</p>
              ) : (
                <div>
                  {realizedHistory.map((rv: any) => (
                    <RealizedRow key={rv.id} rv={rv} unit={unit} indicatorId={indicatorId} onSaved={() => refetch()} />
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
