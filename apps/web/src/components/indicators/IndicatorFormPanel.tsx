'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, formulasApi, indicatorsApi, mapsApi } from '../../lib/api';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { X, Trash2 } from 'lucide-react';

const UNITS = [
  { v: 'CURRENCY', l: 'Reais (R$)' },
  { v: 'PERCENTAGE', l: 'Percentual (%)' },
  { v: 'DAYS', l: 'Dias' },
  { v: 'NUMBER', l: 'Número' },
  { v: 'INDEX', l: 'Índice' },
];

interface Props {
  mapId?: string; // se vier, adiciona o indicador ao mapa ao criar
  editIndicatorId?: string | null; // se vier, modo edição
  onClose: () => void;
  onSaved: (savedId?: string, level?: number) => void;
}

export function IndicatorFormPanel({ mapId, editIndicatorId, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  const isEdit = !!editIndicatorId;
  const period = new Date().toISOString().slice(0, 7) + '-01';

  const { data: allInds = [] } = useQuery({
    queryKey: ['indicators'],
    queryFn: () => indicatorsApi.list().then((r) => r.data),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['map-categories'],
    queryFn: () => mapsApi.getCategories().then((r) => r.data),
  });

  const [form, setForm] = useState({
    name: '',
    category: '',
    type: 'INPUT',
    unit: 'CURRENCY',
    direction: 'HIGHER_IS_BETTER',
    responsible: '',
    goal: '',
    expression: '',
    vars: [] as string[],
    monitoring: '',
    mapLevel: 1,
  });

  const { data: editData } = useQuery({
    queryKey: ['indicator', editIndicatorId],
    queryFn: () => indicatorsApi.get(editIndicatorId!).then((r) => r.data),
    enabled: isEdit,
  });

  useEffect(() => {
    if (editData) {
      setForm((f) => ({
        ...f,
        name: editData.name ?? '',
        category: editData.category ?? '',
        type: editData.type ?? 'INPUT',
        unit: editData.unit ?? 'CURRENCY',
        direction: editData.direction ?? 'HIGHER_IS_BETTER',
        responsible: editData.responsible ?? '',
        goal: editData.goals?.[0]?.value != null ? String(editData.goals[0].value) : '',
        expression: editData.formula?.expression ?? '',
        vars: editData.formula?.variables ? (Object.values(editData.formula.variables) as string[]) : [],
        monitoring: (editData.monitoringPoints ?? []).join('\n'),
      }));
    }
  }, [editData]);

  const indList = allInds as any[];

  const saveMut = useMutation({
    mutationFn: async () => {
      const variables: Record<string, string> = {};
      for (const id of form.vars) {
        const ind = indList.find((i) => i.id === id);
        if (ind) variables[ind.code] = id;
      }

      let indicatorId = editIndicatorId as string;
      const payload: any = {
        name: form.name,
        category: form.category || 'Geral',
        type: form.type,
        unit: form.unit,
        direction: form.direction,
        periodicity: 'MONTHLY',
        responsible: form.responsible || null,
        monitoringPoints: form.monitoring
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      };

      if (isEdit) {
        await settingsApi.updateIndicator(indicatorId, payload);
      } else {
        const r = await settingsApi.createIndicator(payload);
        indicatorId = r.data.id;
      }

      if (form.type === 'CALCULATED' && form.expression.trim()) {
        await formulasApi.create({
          indicatorId,
          expression: form.expression.trim(),
          variables,
          description: `${form.name} = ${form.expression.trim()}`,
        });
      }

      if (form.goal !== '') {
        await indicatorsApi.setGoal(indicatorId, { period, value: parseFloat(form.goal) });
      }

      if (!isEdit && mapId) {
        await mapsApi.addIndicator(mapId, indicatorId);
      }
      return indicatorId;
    },
    onSuccess: (savedId) => {
      toast.success(isEdit ? 'Indicador atualizado' : 'Indicador criado');
      qc.invalidateQueries({ queryKey: ['indicators'] });
      if (mapId) qc.invalidateQueries({ queryKey: ['map', mapId] });
      onSaved(savedId, form.mapLevel);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || 'Erro ao salvar (verifique sua permissão)'),
  });

  const deleteMut = useMutation({
    mutationFn: () => settingsApi.deleteIndicator(editIndicatorId as string),
    onSuccess: () => {
      toast.success('Indicador excluído');
      qc.invalidateQueries({ queryKey: ['indicators'] });
      if (mapId) qc.invalidateQueries({ queryKey: ['map', mapId] });
      onSaved();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || 'Erro ao excluir (verifique sua permissão)'),
  });

  function handleDelete() {
    if (typeof window !== 'undefined' &&
        !window.confirm(`Excluir o indicador "${form.name}" definitivamente? Esta ação não pode ser desfeita.`)) return;
    deleteMut.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-[420px] h-full bg-[#0d0f17] border-l border-white/10 p-5 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">
            {isEdit ? 'Editar Indicador' : 'Novo Indicador'}
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Nome do indicador">
            <input
              className="input-dark w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Margem Bruta"
            />
          </Field>

          <Field label="Tipo de alimentação">
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: 'INPUT', l: 'Carga de dados' },
                { v: 'CALCULATED', l: 'Calculado (fórmula)' },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setForm({ ...form, type: o.v })}
                  className={cn(
                    'text-xs py-2 rounded-xl border transition-colors',
                    form.type === o.v
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : 'border-white/10 text-white/60 hover:text-white',
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </Field>

          {form.type === 'CALCULATED' && (
            <>
              <Field label="Indicadores usados na fórmula (variáveis)">
                <div className="max-h-32 overflow-y-auto border border-white/10 rounded-xl p-2 space-y-1">
                  {indList
                    .filter((i) => i.id !== editIndicatorId)
                    .map((i) => (
                      <label
                        key={i.id}
                        className="flex items-center gap-2 text-xs text-white/70 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.vars.includes(i.id)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              vars: e.target.checked
                                ? [...form.vars, i.id]
                                : form.vars.filter((v) => v !== i.id),
                            })
                          }
                        />
                        <span className="font-mono text-white/40">{i.code}</span> {i.name}
                      </label>
                    ))}
                </div>
              </Field>
              <Field label="Fórmula (use os códigos das variáveis)">
                <input
                  className="input-dark w-full font-mono"
                  value={form.expression}
                  onChange={(e) => setForm({ ...form, expression: e.target.value })}
                  placeholder="Ex: RECEITA - CUSTOS - DESPESAS"
                />
                <p className="text-[10px] text-white/30 mt-1">
                  Variáveis:{' '}
                  {form.vars
                    .map((id) => indList.find((i) => i.id === id)?.code)
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Unidade">
              <select
                className="input-dark w-full"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                {UNITS.map((u) => (
                  <option key={u.v} value={u.v}>
                    {u.l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Polaridade">
              <select
                className="input-dark w-full"
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value })}
              >
                <option value="HIGHER_IS_BETTER">Maior é melhor</option>
                <option value="LOWER_IS_BETTER">Menor é melhor</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Mapa / Categoria">
              <input
                list="cats-dl"
                className="input-dark w-full"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Ex: Financeiro"
              />
              <datalist id="cats-dl">
                {(categories as any[]).map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Meta padrão">
              <input
                type="number"
                className="input-dark w-full"
                value={form.goal}
                onChange={(e) => setForm({ ...form, goal: e.target.value })}
                placeholder="Ex: 30"
              />
            </Field>
          </div>

          <Field label="Responsável">
            <input
              className="input-dark w-full"
              value={form.responsible}
              onChange={(e) => setForm({ ...form, responsible: e.target.value })}
              placeholder="Ex: Controladoria"
            />
          </Field>

          {!isEdit && mapId && (
            <Field label="Nível de abertura no mapa">
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3, 4, 5].map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setForm({ ...form, mapLevel: l })}
                    className={cn(
                      'w-9 h-9 rounded-xl text-sm font-bold border transition-colors',
                      form.mapLevel === l
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-white/10 text-white/50 hover:text-white hover:border-white/30',
                    )}
                  >
                    {l}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  value={form.mapLevel > 5 ? form.mapLevel : ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!Number.isNaN(v) && v >= 1) setForm({ ...form, mapLevel: v });
                  }}
                  placeholder="outro"
                  className="input-dark w-20 text-sm"
                />
              </div>
              <p className="text-[10px] text-white/30 mt-1">
                Define em qual nível de expansão do mapa este indicador estará visível.
              </p>
            </Field>
          )}

          <Field label="Pontos de monitoria (uma frente de trabalho por linha)">
            <textarea
              className="input-dark w-full resize-none"
              rows={4}
              value={form.monitoring}
              onChange={(e) => setForm({ ...form, monitoring: e.target.value })}
              placeholder={'Ex:\nAging de recebíveis\nInadimplência e provisão\nPolítica de crédito'}
            />
            <p className="text-[10px] text-white/30 mt-1">
              Aparecem como guia de possibilidades de trabalho no modal de informações.
            </p>
          </Field>

          <button
            onClick={() => saveMut.mutate()}
            disabled={!form.name || saveMut.isPending}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm py-2.5 rounded-xl disabled:opacity-50"
          >
            {saveMut.isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar indicador'}
          </button>

          {isEdit && (
            <button
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              className="w-full mt-1 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm py-2.5 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Trash2 size={14} />
              {deleteMut.isPending ? 'Excluindo...' : 'Excluir indicador'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-white/50 block mb-1">{label}</label>
      {children}
    </div>
  );
}
