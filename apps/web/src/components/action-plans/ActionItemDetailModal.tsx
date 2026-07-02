'use client';

import React, { useState, useRef } from 'react';
import { X, Paperclip, Download, Trash2, Send, CalendarDays } from 'lucide-react';
import { UserSelector } from '../ui/UserSelector';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { actionPlansApi, fileUrl } from '../../lib/api';
import {
  ActionItem, ActionPlan, PlanComment,
  ACTION_STATUS_LABEL, ACTION_STATUS_COLOR,
  ActionItemPriority, ActionItemStatus,
  PRIORITY_LABEL, PLAN_STATUS_LABEL,
} from '../../types/action-plan';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useEscClose } from '../../lib/useEscClose';

type Tab = 'edit' | 'comments';

interface Props {
  plan: ActionPlan;
  action: ActionItem;
  onClose: () => void;
  // Camada lateral direita (contexto do indicador): sobrepõe o painel de Plano
  // de Ação SEM backdrop — o gráfico à esquerda continua visível.
  asRightPanel?: boolean;
}

const PRIORITIES: ActionItemPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
// "No prazo"/"Atrasada" são automáticos pela data-limite: não são selecionáveis
// (o vigente aparece como item desabilitado). "Retomar automático" envia PENDING
// e o backend converte para OVERDUE se a data estiver vencida.

const PRIORITY_BTN_STYLE: Record<ActionItemPriority, string> = {
  HIGH: 'bg-red-600 text-white border-red-600',
  MEDIUM: 'bg-transparent text-white/60 border-white/15 hover:border-white/30',
  LOW: 'bg-transparent text-white/60 border-white/15 hover:border-white/30',
};

export function ActionItemDetailModal({ plan, action: initialAction, onClose, asRightPanel }: Props) {
  const qc = useQueryClient();
  useEscClose(onClose); // ESC fecha esta camada (a mais recente da pilha)
  const [tab, setTab] = useState<Tab>('edit');
  const [action, setAction] = useState(initialAction);
  const [comment, setComment] = useState('');
  const [commentFile, setCommentFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(
    initialAction.ownerId ? { id: initialAction.ownerId, name: initialAction.ownerName ?? '' } : null
  );

  const deleteMutation = useMutation({
    mutationFn: () => actionPlansApi.deleteAction(action.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plan', plan.id] });
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      qc.invalidateQueries({ queryKey: ['action-plans-dashboard'] });
      qc.invalidateQueries({ queryKey: ['map'] });
      toast.success('Ação excluída');
      setConfirmDelete(false);
      onClose();
    },
    onError: () => toast.error('Erro ao excluir ação'),
  });

  // O modal pode ser aberto a partir da lista (que não traz comentários) ou do
  // detalhe. Buscamos o plano completo para garantir comentários sempre presentes.
  const { data: fullPlan } = useQuery<ActionPlan>({
    queryKey: ['action-plan', plan.id],
    queryFn: () => actionPlansApi.get(plan.id).then((r) => r.data),
    initialData: plan.comments ? plan : undefined,
  });
  const comments: PlanComment[] = ((fullPlan ?? plan).comments ?? []).filter(Boolean);

  // ── Update action ──────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data: Partial<ActionItem>) =>
      actionPlansApi.updateAction(action.id, data).then((r) => r.data),
    onSuccess: (updated) => {
      setAction(updated);
      qc.invalidateQueries({ queryKey: ['action-plan', plan.id] });
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      qc.invalidateQueries({ queryKey: ['action-plans-dashboard'] });
      toast.success('Ação atualizada');
    },
    onError: () => toast.error('Erro ao salvar'),
  });

  // ── Add comment (com anexo opcional) ─────────────────────────────────────────
  const commentMutation = useMutation({
    mutationFn: () =>
      actionPlansApi.addComment(plan.id, { content: comment.trim(), file: commentFile }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plan', plan.id] });
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      qc.invalidateQueries({ queryKey: ['map'] });
      setComment('');
      setCommentFile(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success('Comentário adicionado');
    },
    onError: () => toast.error('Erro ao adicionar comentário'),
  });

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo maior que 10MB'); return; }
    setCommentFile(file);
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const statusBadge = ACTION_STATUS_COLOR[action.status as ActionItemStatus] ?? '';

  return (
    <div className={cn(
      asRightPanel
        // Camada 2 do lado direito: sem overlay/backdrop, gráfico visível à esquerda
        ? 'fixed inset-y-0 right-0 z-50 w-[50vw] min-w-[420px] max-w-[760px] slide-in-right'
        : 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm',
    )}>
      <div className={cn(
        'bg-[#1a1f2e] border-white/10 shadow-2xl flex flex-col',
        asRightPanel
          ? 'h-full w-full border-l'
          : 'border rounded-2xl w-full max-w-lg mx-4 max-h-[90vh]',
      )}>

        {/* ── Modal Header ── */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
          <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1', statusBadge)}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {ACTION_STATUS_LABEL[action.status as ActionItemStatus]}
          </span>
          <span className={cn('text-xs px-2.5 py-1 rounded-full font-bold border',
            action.priority === 'HIGH' ? 'bg-red-600 text-white border-red-600'
            : action.priority === 'MEDIUM' ? 'bg-amber-500 text-white border-amber-500'
            : 'bg-blue-600 text-white border-blue-600'
          )}>
            {PRIORITY_LABEL[action.priority as ActionItemPriority]}
          </span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-white/5 px-5 flex-shrink-0">
          {(['edit', 'comments'] as Tab[]).map((t) => {
            const labels: Record<Tab, string> = {
              edit: 'Editar',
              comments: `Comentários${comments.length ? ` ${comments.length}` : ''}`,
            };
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-4 py-3 text-sm border-b-2 transition-colors',
                  tab === t ? 'text-white border-purple-500' : 'text-white/40 border-transparent hover:text-white/70',
                )}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ABA: EDITAR */}
          {tab === 'edit' && (
            <div className="px-5 py-4 space-y-4">
              <FormRow label="O QUE FAZER">
                <input
                  value={action.title}
                  onChange={(e) => setAction((a) => ({ ...a, title: e.target.value }))}
                  className="input-dark"
                  placeholder="O que será feito..."
                />
              </FormRow>

              <FormRow label="COMO FAZER">
                <textarea
                  value={action.description ?? ''}
                  onChange={(e) => setAction((a) => ({ ...a, description: e.target.value }))}
                  rows={3}
                  className="input-dark resize-none"
                  placeholder="Como será feito..."
                />
              </FormRow>

              <div className="grid grid-cols-2 gap-3">
                <FormRow label="RESPONSÁVEL">
                  <UserSelector
                    value={owner}
                    onChange={(u) => {
                      setOwner(u);
                      setAction((a) => ({ ...a, ownerName: u?.name ?? '', ownerId: u?.id ?? null }));
                    }}
                    placeholder="Selecionar"
                  />
                </FormRow>

                <FormRow label="PRIORIDADE">
                  <div className="flex gap-1.5">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p}
                        onClick={() => setAction((a) => ({ ...a, priority: p }))}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-xs font-bold border transition-all',
                          action.priority === p
                            ? p === 'HIGH' ? 'bg-red-600 text-white border-red-600'
                              : p === 'MEDIUM' ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-blue-600 text-white border-blue-600'
                            : 'bg-transparent text-white/40 border-white/10 hover:border-white/20',
                        )}
                      >
                        {PRIORITY_LABEL[p].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </FormRow>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormRow label="PRAZO">
                  <div
                    className="relative flex items-center bg-white/5 border border-white/10 hover:border-white/20 focus-within:border-purple-500 rounded-xl px-3 py-2.5 cursor-pointer transition-colors"
                    onClick={() => dateRef.current?.showPicker?.()}
                  >
                    <span className="flex-1 text-sm text-white/80 select-none">
                      {action.dueDate
                        ? new Date(action.dueDate.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                        : <span className="text-white/25">DD/MM/AAAA</span>}
                    </span>
                    <CalendarDays size={14} className="text-white/30 flex-shrink-0" />
                    <input
                      ref={dateRef}
                      type="date"
                      value={action.dueDate ? action.dueDate.slice(0, 10) : ''}
                      onChange={(e) => setAction((a) => ({ ...a, dueDate: e.target.value }))}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      tabIndex={-1}
                    />
                  </div>
                </FormRow>
                <FormRow label="STATUS">
                  <select
                    value={action.status === 'OVERDUE' ? 'PENDING' : action.status}
                    onChange={(e) => setAction((a) => ({ ...a, status: e.target.value as ActionItemStatus }))}
                    className="input-dark appearance-none"
                  >
                    {(action.status === 'PENDING' || action.status === 'OVERDUE') && (
                      <option value="PENDING" disabled>
                        {action.status === 'OVERDUE' ? 'Atrasada (automático)' : 'No prazo (automático)'}
                      </option>
                    )}
                    <option value="IN_PROGRESS">Em andamento</option>
                    <option value="DONE">Concluída</option>
                    <option value="CANCELLED">Cancelada</option>
                    <option disabled>──────────</option>
                    <option value="PAUSED">Pausada</option>
                    <option value="AWAITING_VALIDATION">Aguardando validação</option>
                    {action.status !== 'PENDING' && action.status !== 'OVERDUE' && (
                      <option value="PENDING">Retomar automático (No prazo/Atrasada)</option>
                    )}
                  </select>
                  <p className="text-[10px] text-white/30 mt-1">No prazo/Atrasada são definidos pela data-limite</p>
                </FormRow>
              </div>

              <FormRow label={`PROGRESSO   ${action.progress}%`}>
                <input
                  type="range"
                  min={0} max={100} step={5}
                  value={action.progress}
                  onChange={(e) => setAction((a) => ({ ...a, progress: Number(e.target.value) }))}
                  className="w-full accent-purple-500 mt-1"
                />
              </FormRow>

              {action.createdAt && (
                <p className="text-[10px] text-white/25">
                  Criada em {format(new Date(action.createdAt), "dd 'de' MMM. 'de' yyyy", { locale: ptBR })}
                </p>
              )}
            </div>
          )}

          {/* ABA: COMENTÁRIOS */}
          {tab === 'comments' && (
            <div className="px-5 py-4 space-y-4">
              {/* New comment (texto e/ou anexo) */}
              <div className="rounded-xl border border-white/8 bg-white/3 p-3 space-y-3">
                <p className="text-[10px] text-white/40 uppercase tracking-wider">NOVO COMENTÁRIO</p>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Descreva o andamento, bloqueios ou próximos passos..."
                  rows={3}
                  className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-purple-500 resize-none"
                />

                {/* Anexo selecionado (antes de enviar) */}
                {commentFile && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                    <Paperclip size={13} className="text-purple-400 flex-shrink-0" />
                    <span className="text-xs text-white/70 truncate flex-1">{commentFile.name}</span>
                    <span className="text-[10px] text-white/30 flex-shrink-0">{formatBytes(commentFile.size)}</span>
                    <button
                      onClick={() => { setCommentFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                      className="text-white/30 hover:text-red-400 transition-colors flex-shrink-0"
                      title="Remover anexo"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                <input ref={fileRef} type="file" className="hidden" onChange={pickFile}
                  accept=".pdf,.xlsx,.docx,.pptx,.png,.jpg,.jpeg,.csv,.xls" />

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/60 hover:text-white/80 transition-colors"
                    title="Anexar arquivo (máx. 10 MB)"
                  >
                    <Paperclip size={13} />
                    Anexar
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => commentMutation.mutate()}
                    disabled={(!comment.trim() && !commentFile) || commentMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    <Send size={12} />
                    {commentMutation.isPending ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </div>

              {/* Comment list */}
              <div className="space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {c.user?.name?.[0]?.toUpperCase() ?? 'U'}
                    </div>
                    <div className="flex-1 bg-white/3 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-white/70">{c.user?.name}</span>
                        {c.progress !== null && c.progress !== undefined && (
                          <span className="text-[10px] text-purple-400">{c.progress}%</span>
                        )}
                        <span className="text-[10px] text-white/25 ml-auto">
                          {format(new Date(c.createdAt), "dd 'de' MMM. 'de' yyyy", { locale: ptBR })}
                        </span>
                      </div>
                      {c.content && <p className="text-sm text-white/65 whitespace-pre-wrap">{c.content}</p>}

                      {/* Anexo do comentário */}
                      {c.attachmentUrl && (
                        <a
                          href={fileUrl(c.attachmentUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={c.attachmentName ?? undefined}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-purple-500/40 hover:bg-white/8 transition-colors group',
                            c.content ? 'mt-2' : '',
                          )}
                        >
                          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-[10px] text-blue-400 font-bold">
                              {(c.attachmentName ?? c.attachmentUrl).split('.').pop()?.toUpperCase().slice(0, 3)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white/80 truncate">{c.attachmentName ?? 'arquivo'}</p>
                            {c.attachmentSize != null && (
                              <p className="text-[10px] text-white/30">{formatBytes(c.attachmentSize)}</p>
                            )}
                          </div>
                          <Download size={14} className="text-white/30 group-hover:text-white/70 transition-colors flex-shrink-0" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-center text-sm text-white/25 py-6">Nenhum comentário ainda.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {tab === 'edit' && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-white/5 flex-shrink-0">
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
            >
              <Trash2 size={14} />
              Excluir
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20 transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => updateMutation.mutate({
                  title: action.title,
                  description: action.description ?? null,
                  priority: action.priority,
                  status: action.status,
                  dueDate: action.dueDate ?? null,
                  progress: action.progress,
                  ownerName: owner?.name ?? action.ownerName,
                  ownerId: owner?.id ?? action.ownerId ?? null,
                })}
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50 transition-colors"
              >
                <span>💾</span>
                {updateMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message="Tem certeza que deseja excluir esta ação? Esta operação não poderá ser desfeita."
          confirmLabel="Excluir"
          loading={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-white/35 uppercase tracking-wider mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}
