'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, CheckCircle2, Circle, Clock, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';

interface ActionPlan {
  id: string;
  title: string;
  description?: string;
  responsible?: string;
  dueDate?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface Props {
  indicatorId: string;
  onClose: () => void;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Circle size={14} className="text-white/40" />,
  IN_PROGRESS: <Clock size={14} className="text-amber-400" />,
  DONE: <CheckCircle2 size={14} className="text-emerald-400" />,
  CANCELLED: <X size={14} className="text-red-400" />,
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-slate-400 bg-slate-400/10',
  MEDIUM: 'text-blue-400 bg-blue-400/10',
  HIGH: 'text-amber-400 bg-amber-400/10',
  CRITICAL: 'text-red-400 bg-red-400/10',
};

export function ActionPlanModal({ indicatorId, onClose }: Props) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', responsible: '', dueDate: '', priority: 'MEDIUM' });

  const { data: plans = [], isLoading } = useQuery<ActionPlan[]>({
    queryKey: ['action-plans', indicatorId],
    queryFn: () => api.get(`/action-plans?indicatorId=${indicatorId}`).then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/action-plans', { ...data, indicatorId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plans', indicatorId] });
      setShowForm(false);
      setForm({ title: '', description: '', responsible: '', dueDate: '', priority: 'MEDIUM' });
      toast.success('Ação criada com sucesso');
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/action-plans/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action-plans', indicatorId] }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="text-white font-semibold">Plano de Ação</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
            </div>
          )}

          {!isLoading && plans.length === 0 && !showForm && (
            <div className="text-center py-12 text-white/30">
              <AlertTriangle size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Nenhuma ação cadastrada para este indicador.</p>
            </div>
          )}

          {plans.map((plan) => (
            <div key={plan.id} className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => updateStatus.mutate({ id: plan.id, status: plan.status === 'DONE' ? 'PENDING' : 'DONE' })}
                  className="mt-0.5 flex-shrink-0"
                >
                  {STATUS_ICONS[plan.status]}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`text-sm font-medium ${plan.status === 'DONE' ? 'line-through text-white/30' : 'text-white/85'}`}>
                      {plan.title}
                    </p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[plan.priority]}`}>
                      {plan.priority}
                    </span>
                  </div>
                  {plan.description && <p className="text-xs text-white/40">{plan.description}</p>}
                  <div className="flex gap-3 mt-1.5 text-[10px] text-white/30">
                    {plan.responsible && <span>👤 {plan.responsible}</span>}
                    {plan.dueDate && <span>📅 {new Date(plan.dueDate).toLocaleDateString('pt-BR')}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Create form */}
          {showForm && (
            <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/5 space-y-3">
              <input
                placeholder="Título da ação *"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500"
              />
              <textarea
                placeholder="Descrição"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500 resize-none"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  placeholder="Responsável"
                  value={form.responsible}
                  onChange={(e) => setForm((f) => ({ ...f, responsible: e.target.value }))}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500"
                />
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                />
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className="bg-[#1a1f2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowForm(false)} className="text-sm text-white/40 hover:text-white/70 px-3 py-1.5 rounded-lg border border-white/10">
                  Cancelar
                </button>
                <button
                  onClick={() => createMutation.mutate(form)}
                  disabled={!form.title || createMutation.isPending}
                  className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending ? 'Salvando...' : 'Salvar ação'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-4 border-t border-white/5">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-colors"
          >
            <Plus size={14} />
            Nova ação
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
