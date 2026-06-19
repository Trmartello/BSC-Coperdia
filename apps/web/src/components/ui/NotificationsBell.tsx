'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Bell, AlertTriangle, CalendarClock, Target, Mail, CheckCheck, RadarIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { notificationsApi, AppNotification } from '../../lib/api';
import { useAuthStore } from '../../store/auth.store';
import { useActionPlanIntent } from '../../store/action-plan-intent.store';
import { cn } from '../../lib/utils';

export function NotificationsBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { requestPlanForIndicator, requestEditAction } = useActionPlanIntent();
  const canScan = user?.role === 'ADMIN' || user?.role === 'CONTROLADORIA';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list().then((r) => r.data),
    refetchInterval: 30_000,
  });
  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const scan = useMutation({
    mutationFn: () => notificationsApi.scanOffTrack().then((r) => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(
        res.flagged > 0
          ? `${res.flagged} indicador(es) precisam de tratativa (Meta vs Realizado)`
          : 'Nenhum indicador fora da meta no período mais recente',
      );
    },
    onError: () => toast.error('Falha ao executar a varredura'),
  });

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleClick = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    // Ação em atraso → abre o formulário de edição da ação estruturada
    if (n.type === 'OVERDUE_ACTION' && n.actionItemId) {
      requestEditAction(n.actionItemId);
      router.push('/dashboard/action-plans');
      return;
    }
    // Fora da meta → abre o plano de ação do indicador (existente p/ edição ou
    // um plano em branco recém-criado para preencher)
    if (n.type === 'OFF_TRACK' && n.indicatorId) {
      requestPlanForIndicator(n.indicatorId);
      router.push('/dashboard/action-plans');
      return;
    }
    if (n.type === 'OVERDUE_ACTION' || n.type === 'OFF_TRACK') {
      router.push('/dashboard/action-plans');
      return;
    }
    router.push('/dashboard/indicators');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white/80 transition-colors"
        title="Alertas"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-[360px] max-h-[460px] flex flex-col bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white/80">
                Alertas{unread > 0 && <span className="text-white/40 font-normal"> · {unread} não lidos</span>}
              </span>
              {unread > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  className="flex items-center gap-1 text-[11px] text-purple-300 hover:text-purple-200 disabled:opacity-50"
                >
                  <CheckCheck size={13} /> Marcar todas
                </button>
              )}
            </div>
            {canScan && (
              <button
                onClick={() => scan.mutate()}
                disabled={scan.isPending}
                className="mt-2 w-full flex items-center justify-center gap-1.5 text-[11px] text-purple-200 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                title="Varrer indicadores fora da meta (Meta vs Realizado) no período mais recente"
              >
                <RadarIcon size={13} />
                {scan.isPending ? 'Varrendo...' : 'Varrer metas (Meta vs Realizado)'}
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="overflow-y-auto">
            {items.length === 0 && (
              <div className="px-4 py-10 text-center text-xs text-white/30">
                Nenhum alerta no momento.
              </div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  'w-full text-left px-4 py-3 flex gap-3 border-b border-white/5 hover:bg-white/5 transition-colors',
                  !n.readAt && 'bg-white/[0.03]',
                )}
              >
                <NotifIcon notif={n} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn('text-xs font-semibold truncate', n.readAt ? 'text-white/60' : 'text-white/90')}>
                      {n.title}
                    </p>
                    {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />}
                  </div>
                  <p className="text-[11px] text-white/45 mt-0.5 line-clamp-2">{n.message}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-white/30">
                    <span>{relative(n.createdAt)}</span>
                    {n.emailSent && (
                      <span className="flex items-center gap-0.5 text-emerald-400/70">
                        <Mail size={10} /> e-mail enviado
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifIcon({ notif }: { notif: AppNotification }) {
  const Icon =
    notif.type === 'OVERDUE_ACTION' ? CalendarClock : notif.type === 'OFF_TRACK' ? Target : AlertTriangle;
  const color = notif.severity === 'CRITICAL' ? 'text-red-400 bg-red-500/10' : 'text-amber-400 bg-amber-500/10';
  return (
    <span className={cn('flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center', color)}>
      <Icon size={15} />
    </span>
  );
}

function relative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return '';
  }
}
