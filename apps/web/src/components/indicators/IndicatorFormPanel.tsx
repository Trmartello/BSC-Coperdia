'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, formulasApi, indicatorsApi, mapsApi } from '../../lib/api';
import { cn, toVarName, humanizeExpression, replaceVarToken } from '../../lib/utils';
import { useEscClose } from '../../lib/useEscClose';
import { toast } from 'sonner';
import { X, Trash2 } from 'lucide-react';
import { UserSelector } from '../ui/UserSelector';

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
  useEscClose(onClose); // ESC fecha esta camada (a mais recente da pilha)
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
    aliases: {} as Record<string, string>, // indicatorId → nome amigável usado na fórmula
    monitoring: '',
    mapLevel: 1,
    decimalPlaces: 2,
    description: '',
  });
  const [responsibleOwner, setResponsibleOwner] = useState<{ id: string; name: string } | null>(null);
  // Busca (typeahead) na lista de indicadores usados na fórmula — debounce 300ms.
  const [varSearch, setVarSearch] = useState('');
  const [varSearchDeb, setVarSearchDeb] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setVarSearchDeb(varSearch.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [varSearch]);

  const { data: editData } = useQuery({
    queryKey: ['indicator', editIndicatorId],
    queryFn: () => indicatorsApi.get(editIndicatorId!).then((r) => r.data),
    enabled: isEdit,
  });

  useEffect(() => {
    if (editData) {
      // formula.variables = { alias: indicatorId } → reconstruir vars + aliases
      const variables: Record<string, string> = editData.formula?.variables ?? {};
      const aliases: Record<string, string> = {};
      const vars: string[] = [];
      for (const [alias, indId] of Object.entries(variables)) {
        aliases[indId as string] = alias;
        vars.push(indId as string);
      }
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
        vars,
        aliases,
        monitoring: (editData.monitoringPoints ?? []).join('\n'),
        decimalPlaces: editData.decimalPlaces ?? 2,
        description: editData.description ?? '',
      }));
    }
  }, [editData]);

  const indList = allInds as any[];

  const saveMut = useMutation({
    mutationFn: async () => {
      // Usa o nome amigável (alias) escolhido pelo usuário como token da fórmula;
      // cai no código sanitizado quando não houver alias definido.
      const variables: Record<string, string> = {};
      for (const id of form.vars) {
        const ind = indList.find((i) => i.id === id);
        const alias = (form.aliases[id] || toVarName(ind?.code ?? '')).trim();
        if (alias) variables[alias] = id;
      }

      let indicatorId = editIndicatorId as string;
      const payload: any = {
        name: form.name,
        category: form.category || 'Geral',
        type: form.type,
        unit: form.unit,
        direction: form.direction,
        periodicity: 'MONTHLY',
        responsible: responsibleOwner?.name ?? (form.responsible || null),
        decimalPlaces: form.decimalPlaces,
        description: form.description.trim() || null,
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

  // ── Variáveis da fórmula (com nomes amigáveis) ────────────────────────────
  // Marca/desmarca um indicador como variável, atribuindo um alias único.
  function toggleVar(ind: any, checked: boolean) {
    setForm((f) => {
      if (checked) {
        const base = toVarName(ind.code);
        const taken = new Set(
          Object.entries(f.aliases).filter(([id]) => id !== ind.id).map(([, a]) => a),
        );
        let alias = base;
        let n = 2;
        while (taken.has(alias)) alias = `${base}_${n++}`;
        return { ...f, vars: [...f.vars, ind.id], aliases: { ...f.aliases, [ind.id]: alias } };
      }
      const { [ind.id]: _removed, ...restAliases } = f.aliases;
      return { ...f, vars: f.vars.filter((v) => v !== ind.id), aliases: restAliases };
    });
  }

  // Renomeia o alias e propaga a troca para a expressão já digitada.
  function setAlias(indId: string, raw: string) {
    let next = raw.replace(/[^A-Za-z0-9_]/g, '_');
    if (/^[0-9]/.test(next)) next = '_' + next;
    setForm((f) => ({
      ...f,
      aliases: { ...f.aliases, [indId]: next },
      expression: replaceVarToken(f.expression, f.aliases[indId] ?? '', next),
    }));
  }

  // Insere o alias no fim da expressão (atalho para montar a fórmula).
  function insertToken(indId: string) {
    const alias = form.aliases[indId];
    if (!alias) return;
    setForm((f) => ({ ...f, expression: f.expression ? `${f.expression} ${alias}` : alias }));
  }

  // Mapa alias → nome do indicador, para a leitura amigável da fórmula.
  const tokenToName: Record<string, string> = {};
  for (const id of form.vars) {
    const ind = indList.find((i) => i.id === id);
    const alias = form.aliases[id];
    if (alias && ind) tokenToName[alias] = ind.name;
  }
  const humanized = humanizeExpression(form.expression, tokenToName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <div
        className="w-[52vw] min-w-[520px] max-w-[780px] max-h-[92vh] bg-[#0d0f17] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header fixo */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">
            {isEdit ? 'Editar Indicador' : 'Novo Indicador'}
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Corpo rolável */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          <Section title="Informações do indicador" />
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
              <Section title="Fórmula de cálculo" />
              <Field label="Indicadores usados na fórmula (variáveis)">
                <input
                  className="input-dark w-full mb-2"
                  value={varSearch}
                  onChange={(e) => setVarSearch(e.target.value)}
                  placeholder="Pesquisar por nome, código, categoria..."
                />
                <div className="max-h-40 overflow-y-auto border border-white/10 rounded-xl p-2 space-y-1">
                  {(() => {
                    const q = varSearchDeb;
                    const matches = (i: any) => !q
                      || String(i.code ?? '').toLowerCase().includes(q)
                      || String(i.name ?? '').toLowerCase().includes(q)
                      || String(i.category ?? '').toLowerCase().includes(q)
                      || String(i.responsible ?? '').toLowerCase().includes(q);
                    // exclui o próprio; selecionados SEMPRE visíveis (primeiro),
                    // demais correspondências limitadas a 50.
                    const pool = indList.filter((i) => i.id !== editIndicatorId);
                    const selected = pool.filter((i) => form.vars.includes(i.id));
                    const rest = pool.filter((i) => !form.vars.includes(i.id) && matches(i)).slice(0, 50);
                    const list = [...selected, ...rest];
                    if (list.length === 0) {
                      return <p className="text-[11px] text-white/30 px-1 py-2">Nenhum indicador encontrado.</p>;
                    }
                    return list.map((i) => (
                      <label key={i.id} className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.vars.includes(i.id)}
                          onChange={(e) => toggleVar(i, e.target.checked)}
                        />
                        <span className="font-mono text-white/40">{i.code}</span> {i.name}
                      </label>
                    ));
                  })()}
                </div>
              </Field>

              {form.vars.length > 0 && (
                <Field label="Nomes amigáveis das variáveis">
                  <div className="space-y-1.5 border border-white/10 rounded-xl p-2">
                    {form.vars.map((id) => {
                      const ind = indList.find((i) => i.id === id);
                      if (!ind) return null;
                      return (
                        <div key={id} className="flex items-center gap-2">
                          <input
                            className="input-dark w-32 font-mono text-xs py-1.5"
                            value={form.aliases[id] ?? ''}
                            onChange={(e) => setAlias(id, e.target.value)}
                            placeholder={toVarName(ind.code)}
                          />
                          <span className="text-[11px] text-white/50 truncate flex-1" title={ind.name}>
                            = {ind.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => insertToken(id)}
                            title="Inserir na fórmula"
                            className="text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-colors flex-shrink-0"
                          >
                            inserir
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-white/30 mt-1">
                    Dê um nome curto e claro a cada variável (ex.: <span className="font-mono">Receita</span>,{' '}
                    <span className="font-mono">CustoFixo</span>) para a fórmula ficar legível.
                  </p>
                </Field>
              )}

              <Field label="Fórmula (use os nomes das variáveis)">
                <input
                  className="input-dark w-full font-mono"
                  value={form.expression}
                  onChange={(e) => setForm({ ...form, expression: e.target.value })}
                  placeholder="Ex: (PMR + PME - PMP) * Receita"
                />
                {form.expression.trim() && (
                  <div className="mt-1.5 p-2 rounded-lg bg-purple-500/5 border border-purple-500/15">
                    <p className="text-[9px] text-purple-300/70 uppercase tracking-wider mb-0.5">Leitura</p>
                    <p className="text-[11px] text-white/70 leading-snug">{humanized}</p>
                  </div>
                )}
              </Field>
            </>
          )}

          <Section title="Configuração visual" />
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

          <Field label="Casas decimais (exibição no card)">
            <select
              className="input-dark w-full"
              value={form.decimalPlaces}
              onChange={(e) => setForm({ ...form, decimalPlaces: parseInt(e.target.value, 10) })}
            >
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n} casa{n === 1 ? '' : 's'} decima{n === 1 ? 'l' : 'is'}</option>
              ))}
            </select>
          </Field>

          <Section title="Descrição" />
          <Field label="Descrição do indicador (conceito)">
            <textarea
              className="input-dark w-full resize-y min-h-[96px] max-h-[320px] leading-relaxed"
              rows={4}
              maxLength={1000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descreva o que este indicador representa, como deve ser interpretado e qual seu impacto no negócio."
            />
            <p className="text-[10px] text-white/30 mt-1">
              Aparece abaixo do título no modal de histórico. Arraste o canto inferior para ampliar. {form.description.length}/1000
            </p>
          </Field>

          <Section title="Classificação e responsáveis" />
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
            <UserSelector
              value={responsibleOwner}
              onChange={setResponsibleOwner}
              placeholder={form.responsible || 'Selecionar responsável'}
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
        </div>

        {/* Footer fixo com ações */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-white/5 flex-shrink-0">
          {isEdit && (
            <button
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              className="border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm px-4 py-2.5 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 flex-shrink-0"
            >
              <Trash2 size={14} />
              {deleteMut.isPending ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
          <button
            onClick={() => saveMut.mutate()}
            disabled={!form.name || saveMut.isPending}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm py-2.5 rounded-xl disabled:opacity-50 font-medium"
          >
            {saveMut.isPending ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar indicador'}
          </button>
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

function Section({ title }: { title: string }) {
  return (
    <p className="text-[10px] font-semibold text-white/35 uppercase tracking-widest border-b border-white/5 pb-1.5">
      {title}
    </p>
  );
}
