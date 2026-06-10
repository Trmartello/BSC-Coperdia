'use client';

import React, { useState } from 'react';
import { Trash2, Info, Maximize2, ClipboardList, Paperclip, MessageSquare } from 'lucide-react';
import { cn, formatValue } from '../../lib/utils';
import { Indicator, IndicatorStatus } from '../../types';
import { indicatorsApi } from '../../lib/api';
import { useScenarioStore } from '../../store/scenario.store';
import { toast } from 'sonner';

interface CardData {
  indicator: Indicator;
  realized: number | null;
  goal: number | null;
  estimate: number | null; // previsto (se null, usa realized)
  actionCount?: number;
  attachmentCount?: number;
  commentCount?: number;
}

interface Props {
  data: CardData;
  onDelete?: () => void;
  onOpenDetail?: () => void;
  onOpenActionPlan?: () => void;
  onUpdated?: () => void;
}

// "Estimativa efetiva": se o usuário não lançou estimativa → usa realizado (sem diferença)
function effectiveEstimate(realized: number | null, estimate: number | null): number | null {
  if (estimate !== null) return estimate;
  return realized;
}

function deviation(value: number | null, base: number | null): number | null {
  if (value === null || base === null || base === 0) return null;
  return ((value - base) / Math.abs(base)) * 100;
}

function deviationLabel(pct: number | null, direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER'): {
  label: string;
  positive: boolean;
} {
  if (pct === null) return { label: '—', positive: false };
  const isGood = direction === 'HIGHER_IS_BETTER' ? pct >= 0 : pct <= 0;
  const sign = pct > 0 ? '+' : '';
  return { label: `${sign}${pct.toFixed(1)}% vs meta`, positive: isGood };
}

export function IndicatorCard({ data, onDelete, onOpenDetail, onOpenActionPlan, onUpdated }: Props) {
  const { indicator, realized, goal, estimate, actionCount = 0, attachmentCount = 0, commentCount = 0 } = data;
  const { activeScenario, activePeriod } = useScenarioStore();

  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(estimate ?? ''));
  const [saving, setSaving] = useState(false);

  const effective = effectiveEstimate(realized, estimate);
  const devVsGoal = deviation(effective, goal);
  const devRealized = deviation(effective, realized);

  const devGoalInfo = deviationLabel(devVsGoal, indicator.direction as any);
  const devEstInfo = deviationLabel(devRealized, indicator.direction as any);

  const canEdit = indicator.type === 'INPUT' && !!activeScenario;

  async function handleSave() {
    if (!activeScenario) return;
    setSaving(true);
    try {
      await indicatorsApi.updateForecast({
        indicatorId: indicator.id,
        scenarioId: activeScenario.id,
        period: activePeriod,
        value: parseFloat(inputValue),
      });
      toast.success('Estimativa salva. Recalculando impactos...');
      setEditing(false);
      onUpdated?.();
    } catch {
      toast.error('Erro ao salvar estimativa');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card-dark w-[260px] flex flex-col gap-0 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-start justify-between px-4 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          <p className="text-white/80 text-sm font-semibold leading-tight truncate">
            {indicator.name}
          </p>
        </div>
        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
          <span className="text-[10px] text-white/50 font-medium border border-white/15 rounded px-1.5 py-0.5">
            {unitLabel(indicator.unit)}
          </span>
          <button onClick={onOpenDetail} className="text-white/30 hover:text-white/70 transition-colors">
            <Info size={13} />
          </button>
          <button onClick={onOpenDetail} className="text-white/30 hover:text-white/70 transition-colors">
            <Maximize2 size={13} />
          </button>
          <button onClick={onDelete} className="text-white/30 hover:text-red-400 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Values grid ── */}
      <div className="grid grid-cols-3 px-4 pb-1">
        <ValueCol label="Realizado" value={formatValue(realized, indicator.unit)} />
        <ValueCol label="Meta" value={formatValue(goal, indicator.unit)} bold />
        <ValueCol
          label="Estimativa"
          value={formatValue(effective, indicator.unit)}
          editable={canEdit}
          onEdit={() => { setInputValue(String(estimate ?? realized ?? '')); setEditing(true); }}
        />
      </div>

      {/* Inline edit input */}
      {editing && (
        <div className="px-4 pb-2 flex gap-1">
          <input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoFocus
            className="flex-1 bg-white/5 border border-white/20 rounded text-xs text-white px-2 py-1 focus:outline-none focus:border-purple-500"
          />
          <button onClick={handleSave} disabled={saving}
            className="text-xs bg-purple-600 text-white px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50">
            {saving ? '…' : 'OK'}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-white/40 hover:text-white/70 px-1">✕</button>
        </div>
      )}

      {/* ── Deviation rows ── */}
      <div className="px-4 pb-2 space-y-0.5">
        <DeviationRow {...devGoalInfo} />
        <DeviationRow {...devEstInfo} />
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-white/5 mx-4" />

      {/* ── Direction indicator ── */}
      <div className="px-4 py-2 flex items-center gap-1.5">
        <div className={cn(
          'w-3 h-3 rounded-sm flex-shrink-0',
          indicator.direction === 'LOWER_IS_BETTER' ? 'bg-blue-500' : 'bg-green-500',
        )} />
        <span className="text-[10px] text-white/50">
          {indicator.direction === 'LOWER_IS_BETTER' ? 'Quanto Menor Melhor' : 'Quanto Maior Melhor'}
        </span>
      </div>

      {/* ── Footer: actions / attachments / comments ── */}
      <div className="border-t border-white/5 px-4 py-2 flex items-center gap-3">
        <FooterAction icon={<ClipboardList size={11} />} count={actionCount} label="ações" onClick={onOpenActionPlan} />
        <FooterAction icon={<Paperclip size={11} />} count={attachmentCount} label="Anexos" />
        <FooterAction icon={<MessageSquare size={11} />} count={commentCount} label="Comentários" />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ValueCol({ label, value, bold, editable, onEdit }: {
  label: string; value: string; bold?: boolean; editable?: boolean; onEdit?: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-label">{label}</p>
      <button
        onClick={editable ? onEdit : undefined}
        className={cn(
          'text-left text-base font-bold leading-tight',
          bold ? 'text-white' : 'text-white/80',
          editable ? 'hover:text-purple-300 cursor-pointer' : 'cursor-default',
        )}
      >
        {value}
      </button>
    </div>
  );
}

function DeviationRow({ label, positive }: { label: string; positive: boolean }) {
  return (
    <p className={cn('text-[10px] font-medium', positive ? 'text-emerald-400' : 'text-red-400')}>
      {positive ? '▲' : '▼'} {label}
    </p>
  );
}

function FooterAction({ icon, count, label, onClick }: {
  icon: React.ReactNode; count: number; label: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-white/40 hover:text-white/70 transition-colors"
    >
      {icon}
      <span className="text-[10px]">{count} {label}</span>
    </button>
  );
}

function unitLabel(unit: string): string {
  const map: Record<string, string> = {
    CURRENCY: 'R$',
    PERCENTAGE: '%',
    NUMBER: 'Nº',
    DAYS: 'Dias',
    INDEX: 'Índice',
  };
  return map[unit] ?? unit;
}
