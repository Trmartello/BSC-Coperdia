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

function fmtMonth(d: Date) {
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
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

function HistoryChart({ data, direction }: { data: Pt[]; direction: string }) {
  if (!data.length) {
    return <div className="h-32 flex items-center justify-center text-white/20 text-xs">Sem dados históricos</div>;
  }

  const pts = data.slice(-15);
  const n = pts.length;
  const step = 30;
  const barW = 14;
  const chartW = n * step;
  const chartH = 110;
  const pad = 14;

  const allVals = pts.flatMap((p) => [p.value, p.goal ?? 0, p.prevYear ?? 0]).filter((v) => v > 0);
  const maxVal = Math.max(...allVals, 1);

  const x = (i: number) => pad + i * step + step / 2;
  const y = (v: number) => chartH - (v / maxVal) * chartH;

  // polyline MoM (evolução mês a mês) através dos topos das barras
  const momPath = pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  // polyline YoY (mesmo período do ano anterior) onde houver dado
  const yoyPts = pts.map((p, i) => (p.prevYear ? `${x(i)},${y(p.prevYear)}` : null)).filter(Boolean) as string[];

  return (
    <div className="w-full overflow-x-auto">
      <svg width="100%" height={chartH + 26} viewBox={`0 0 ${chartW + pad * 2} ${chartH + 26}`} preserveAspectRatio="xMidYMid meet">
        {/* meta — segmentos pontilhados horizontais por período */}
        {pts.map((p, i) =>
          p.goal != null ? (
            <line
              key={`g-${i}`}
              x1={x(i) - barW} x2={x(i) + barW}
              y1={y(p.goal)} y2={y(p.goal)}
              stroke="rgba(255,255,255,0.35)" strokeWidth={1} strokeDasharray="3 2"
            />
          ) : null,
        )}

        {/* barras: fantasma (ano anterior) + atual (cor do status) */}
        {pts.map((p, i) => {
          const good = p.goal != null
            ? (direction === 'LOWER_IS_BETTER' ? p.value <= p.goal : p.value >= p.goal)
            : null;
          const barColor = good === null ? 'rgba(255,255,255,0.25)' : good ? 'rgba(16,185,129,0.75)' : 'rgba(239,68,68,0.75)';
          return (
            <g key={`b-${i}`}>
              {p.prevYear != null && (
                <rect
                  x={x(i) - barW / 2 - 3} width={barW * 0.55}
                  y={y(p.prevYear)} height={chartH - y(p.prevYear)}
                  rx={2} fill="rgba(129,140,248,0.45)"
                />
              )}
              <rect
                x={x(i) - barW / 2 + (p.prevYear != null ? 3 : 0)} width={barW * (p.prevYear != null ? 0.7 : 1)}
                y={y(p.value)} height={chartH - y(p.value)}
                rx={2} fill={barColor}
              />
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
            <text key={`t-${i}`} x={x(i)} y={chartH + 16} textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.3)">
              {fmtMonth(p.period)}
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

// ─── Metric Tile ───────────────────────────────────────────────────────────────

function MetricTile({ label, sub, value, hint, good }: {
  label: string; sub?: string; value: string; hint?: string; good?: boolean | null;
}) {
  const color = good == null ? 'text-white' : good ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="bg-white/[0.03] rounded-xl p-3">
      <p className="text-[9px] text-white/30 uppercase tracking-wider">{label}</p>
      {sub && <p className="text-[9px] text-white/25 mt-0.5">{sub}</p>}
      <p className={cn('text-xl font-black mt-1 flex items-center gap-1', color)}>
        {good != null && (good ? <TrendingUp size={13} /> : <TrendingDown size={13} />)}
        {value}
      </p>
      {hint && <p className={cn('text-[9px] mt-0.5', good == null ? 'text-white/30' : good ? 'text-emerald-400/70' : 'text-red-400/70')}>{hint}</p>}
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
              {/* Métricas principais */}
              <div className="px-5 py-4 border-b border-white/5 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <MetricTile
                    label="Realizado" sub={curPoint ? fmtMonth(curPoint.period) : undefined}
                    value={formatValue(effective, unit)}
                  />
                  <MetricTile
                    label="VS Ano Anterior"
                    sub={yoyPoint ? `${fmtMonth(yoyPoint.period)} · ${formatValue(yoyPoint.value, unit)}` : '—'}
                    value={yoy != null ? `${yoy > 0 ? '+' : ''}${yoy.toFixed(1)}%` : '—'}
                    good={goodYoy}
                    hint={goodYoy == null ? undefined : goodYoy ? 'Melhorou vs ano anterior' : 'Piorou vs ano anterior'}
                  />
                  <MetricTile
                    label="VS Meta"
                    sub={goal != null ? `Meta: ${formatValue(goal, unit)}` : '—'}
                    value={vsGoal != null ? `${vsGoal > 0 ? '+' : ''}${vsGoal.toFixed(1)}%` : '—'}
                    good={goodVsGoal}
                    hint={goodVsGoal == null ? undefined : goodVsGoal ? 'Dentro da meta' : 'Fora da meta'}
                  />
                </div>

                {/* Linha secundária: VS mês anterior + meta + estimativa (condicional) */}
                <div className={cn('grid gap-2', showEstimate ? 'grid-cols-3' : 'grid-cols-2')}>
                  <MetricTile
                    label="VS Mês Anterior"
                    sub={prevPoint ? `${fmtMonth(prevPoint.period)} · ${formatValue(prevPoint.value, unit)}` : '—'}
                    value={mom != null ? `${mom > 0 ? '+' : ''}${mom.toFixed(1)}%` : '—'}
                    good={goodMom}
                    hint={goodMom == null ? undefined : goodMom ? 'Melhorando' : 'Piorando'}
                  />
                  <MetricTile label="Meta" value={formatValue(goal, unit)} />
                  {showEstimate && <MetricTile label="Estimativa" value={formatValue(estimate, unit)} />}
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
                <HistoryChart data={chartData} direction={direction} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <Legend swatch="bg-emerald-500/70" label="Atual (cor do status)" />
                  <Legend swatch="bg-indigo-400/50" label="Mesmo período ano anterior" />
                  <Legend line="border-purple-400" label="Evolução mês a mês" />
                  <Legend line="border-white/40" label="Meta do período" />
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
              {ind?.type === 'CALCULATED' && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300">
                  Indicador calculado. Valores gerados automaticamente pela fórmula.
                </div>
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
