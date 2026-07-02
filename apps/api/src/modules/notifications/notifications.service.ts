import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MailerService } from '@nestjs-modules/mailer';
import { NotificationType, NotificationSeverity } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Papéis que enxergam TODOS os alertas (visão de gestão). Demais usuários só
// veem os alertas globais (userId null) ou direcionados a eles.
const MANAGER_ROLES = ['ADMIN', 'CONTROLADORIA', 'DIRETORIA'];

type AuthUser = { id: string; role: string };

interface UpsertPayload {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  actionPlanId?: string | null;
  actionItemId?: string | null;
  indicatorId?: string | null;
  period?: Date | null;
  userId?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  // throttle do refresh disparado pelas leituras do sino (evita martelar o banco)
  private lastRefresh = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  // ── Leitura para o sino ──────────────────────────────────────────────────────

  async getForUser(user: AuthUser) {
    // Mantém os alertas frescos sem exigir ação manual; tolerante a falhas.
    const now = Date.now();
    if (now - this.lastRefresh > 30_000) {
      this.lastRefresh = now;
      try {
        await this.refreshInconsistencies();
        await this.refreshOverdueNotifications();
      } catch (e) {
        this.logger.error('Falha ao atualizar notificações', e as Error);
      }
    }

    const where = this.visibilityWhere(user);
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
        take: 50,
      }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);

    return { items, unreadCount };
  }

  async markRead(id: string) {
    await this.prisma.notification.updateMany({ where: { id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead(user: AuthUser) {
    const where = this.visibilityWhere(user);
    const res = await this.prisma.notification.updateMany({
      where: { ...where, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }

  private visibilityWhere(user: AuthUser) {
    const base = { resolvedAt: null as Date | null };
    if (MANAGER_ROLES.includes(user.role)) return base;
    return { ...base, OR: [{ userId: null }, { userId: user.id }] };
  }

  // ── Detecção de inconsistências de dados ─────────────────────────────────────
  // Insumo (INPUT) sem realizado no período mais recente → o indicador calculado
  // que depende dele fica comprometido. Espelha a checagem feita na importação.

  async refreshInconsistencies(): Promise<void> {
    const latest = await this.prisma.realizedValue.findFirst({
      orderBy: { period: 'desc' },
      select: { period: true },
    });
    if (!latest) return;
    const period = latest.period;
    const periodISO = period.toISOString();
    const periodLabel = format(period, 'MM/yyyy');

    const [indicators, realized] = await Promise.all([
      this.prisma.indicator.findMany({ where: { active: true }, include: { formula: true } }),
      this.prisma.realizedValue.findMany({ where: { period }, select: { indicatorId: true } }),
    ]);
    const byId = new Map(indicators.map((i) => [i.id, i]));
    const haveValue = new Set(realized.map((r) => r.indicatorId));

    const detected: string[] = [];
    for (const ind of indicators) {
      const vars = ind.formula?.variables as Record<string, string> | undefined;
      if (!vars) continue;
      for (const depId of Object.values(vars)) {
        const dep = byId.get(depId);
        if (!dep) continue;
        if (dep.type === 'INPUT' && !haveValue.has(depId)) {
          const dedupeKey = `INCO:${ind.id}:${depId}:${periodISO}`;
          detected.push(dedupeKey);
          await this.upsert(dedupeKey, {
            type: 'INCONSISTENCY',
            severity: 'WARNING',
            title: `Dado faltante: ${dep.code}`,
            message: `${ind.name} não pôde ser calculado: falta o realizado de ${dep.name} (${dep.code}) em ${periodLabel}.`,
            indicatorId: ind.id,
            period,
            userId: null,
          });
        }
      }
    }

    // Resolve inconsistências que não existem mais (insumo lançado depois).
    await this.prisma.notification.updateMany({
      where: { type: 'INCONSISTENCY', resolvedAt: null, dedupeKey: { notIn: detected } },
      data: { resolvedAt: new Date() },
    });
  }

  // ── Detecção de ações em atraso (independente do envio de e-mail) ─────────────

  async refreshOverdueNotifications(): Promise<void> {
    const now = new Date();
    const overdue = await this.prisma.actionItem.findMany({
      where: { status: { notIn: ['DONE', 'CANCELLED', 'AWAITING_VALIDATION'] }, dueDate: { lt: now } },
      include: {
        owner: { select: { id: true, name: true } },
        initiative: {
          include: { actionPlan: { include: { indicator: { select: { name: true } } } } },
        },
      },
    });

    const detected: string[] = [];
    for (const item of overdue) {
      const plan = item.initiative.actionPlan;
      const dedupeKey = `OVERDUE:${item.id}`;
      detected.push(dedupeKey);
      const dueLabel = item.dueDate ? format(item.dueDate, 'dd/MM/yyyy') : '—';
      const parts = [`Vencida em ${dueLabel}`];
      if (plan.indicator?.name) parts.push(plan.indicator.name);
      if (item.owner?.name) parts.push(`resp. ${item.owner.name}`);
      await this.upsert(dedupeKey, {
        type: 'OVERDUE_ACTION',
        severity: 'CRITICAL',
        title: `Ação em atraso: ${item.title}`,
        message: `${parts.join(' · ')}. ${plan.problem}`,
        actionPlanId: plan.id,
        actionItemId: item.id,
        indicatorId: plan.indicatorId ?? null,
        userId: item.owner?.id ?? null,
      });
    }

    // Resolve alertas de ações que saíram do atraso (concluídas/canceladas/reagendadas).
    await this.prisma.notification.updateMany({
      where: { type: 'OVERDUE_ACTION', resolvedAt: null, dedupeKey: { notIn: detected } },
      data: { resolvedAt: new Date() },
    });
  }

  // ── Varredura Meta vs Realizado (manual: ADMIN/CONTROLADORIA após cargas) ─────
  // Lista os indicadores que precisam de tratativa (em risco / fora da meta) no
  // período mais recente e gera um alerta por indicador, com link para criar/abrir
  // o plano de ação. Idempotente: re-executar resolve os que voltaram à meta.

  async scanOffTrack(): Promise<{ flagged: number }> {
    // Off-track só faz sentido onde há meta; ancora no período mais recente COM metas.
    const latest = await this.prisma.goal.findFirst({
      orderBy: { period: 'desc' },
      select: { period: true },
    });
    if (!latest) return { flagged: 0 };
    const period = latest.period;
    const periodISO = period.toISOString();
    const periodLabel = format(period, 'MM/yyyy');

    const [indicators, realized, goals, plans] = await Promise.all([
      this.prisma.indicator.findMany({ where: { active: true } }),
      this.prisma.realizedValue.findMany({ where: { period }, select: { indicatorId: true, value: true } }),
      this.prisma.goal.findMany({ where: { period }, select: { indicatorId: true, value: true } }),
      this.prisma.actionPlan.findMany({
        where: { indicatorId: { not: null } },
        select: { id: true, indicatorId: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const realMap = new Map(realized.map((r) => [r.indicatorId, Number(r.value)]));
    const goalMap = new Map(goals.map((g) => [g.indicatorId, Number(g.value)]));
    const planMap = new Map<string, string>(); // indicatorId → plano mais recente
    for (const p of plans) if (p.indicatorId && !planMap.has(p.indicatorId)) planMap.set(p.indicatorId, p.id);

    const detected: string[] = [];
    for (const ind of indicators) {
      const real = realMap.get(ind.id);
      const goal = goalMap.get(ind.id);
      if (real == null || goal == null) continue; // sem dado completo → vira inconsistência, não off-track

      // Desvio "favorável" conforme a direção (menor-é-melhor inverte o sinal)
      const raw = goal === 0 ? real - goal : (real - goal) / Math.abs(goal);
      const favorableDev = ind.direction === 'LOWER_IS_BETTER' ? -raw : raw;

      let status: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';
      if (favorableDev >= -0.001) status = 'ON_TRACK';
      else if (favorableDev >= -0.1) status = 'AT_RISK';
      else status = 'OFF_TRACK';
      if (status === 'ON_TRACK') continue;

      const dedupeKey = `OFFTRACK:${ind.id}:${periodISO}`;
      detected.push(dedupeKey);
      await this.upsert(dedupeKey, {
        type: 'OFF_TRACK',
        severity: status === 'OFF_TRACK' ? 'CRITICAL' : 'WARNING',
        title: `${status === 'OFF_TRACK' ? 'Fora da meta' : 'Em risco'}: ${ind.code}`,
        message: `${ind.name}: realizado ${this.fmtNum(real)} vs meta ${this.fmtNum(goal)} em ${periodLabel}. Requer plano de ação.`,
        indicatorId: ind.id,
        actionPlanId: planMap.get(ind.id) ?? null,
        period,
        userId: null,
      });
    }

    // Resolve alertas do período que voltaram à meta (não detectados nesta varredura)
    await this.prisma.notification.updateMany({
      where: { type: 'OFF_TRACK', resolvedAt: null, period, dedupeKey: { notIn: detected } },
      data: { resolvedAt: new Date() },
    });

    return { flagged: detected.length };
  }

  private fmtNum(v: number): string {
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }

  private async upsert(dedupeKey: string, payload: UpsertPayload): Promise<void> {
    await this.prisma.notification.upsert({
      where: { dedupeKey },
      create: { dedupeKey, ...payload },
      // Mantém readAt/emailSent; reabre se havia sido resolvido e voltou a ocorrer.
      update: {
        title: payload.title,
        message: payload.message,
        severity: payload.severity,
        resolvedAt: null,
      },
    });
  }

  // ── Envio de e-mails de ação em atraso (cron diário + disparo manual) ─────────

  // Roda todo dia às 08:00 (horário do servidor)
  @Cron('0 8 * * *', { name: 'overdue-actions' })
  async sendOverdueNotifications() {
    this.logger.log('Verificando ações em atraso...');
    const sent = await this.notifyOverdueActions();
    this.logger.log(`Notificações enviadas: ${sent}`);
  }

  // Garante que os alertas no sino existam e tenta enviar o e-mail de cada ação.
  // O alerta in-app independe do SMTP; o e-mail é um canal adicional.
  async notifyOverdueActions(): Promise<number> {
    // Primeiro materializa/atualiza os alertas no sino.
    await this.refreshOverdueNotifications();

    const now = new Date();
    const overdueItems = await this.prisma.actionItem.findMany({
      where: { status: { notIn: ['DONE', 'CANCELLED', 'AWAITING_VALIDATION'] }, dueDate: { lt: now } },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        initiative: {
          include: { actionPlan: { include: { indicator: { select: { name: true } } } } },
        },
      },
    });

    const appUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    let sent = 0;

    for (const item of overdueItems) {
      // Sem usuário vinculado não há e-mail confiável (o alerta no sino já existe).
      if (!item.owner?.email) continue;
      const plan = item.initiative.actionPlan;
      try {
        await this.mailer.sendMail({
          to: item.owner.email,
          subject: `⚠️ Ação em atraso: ${item.title}`,
          template: 'overdue-action',
          context: {
            ownerName: item.owner.name,
            actionTitle: item.title,
            actionDescription: item.description ?? '',
            dueDate: item.dueDate
              ? format(new Date(item.dueDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
              : '—',
            planProblem: plan.problem,
            indicatorName: plan.indicator?.name ?? '',
            appUrl,
          },
        });
        sent++;
        // Marca o alerta como "e-mail enviado".
        await this.prisma.notification.updateMany({
          where: { dedupeKey: `OVERDUE:${item.id}` },
          data: { emailSent: true },
        });
        this.logger.log(`E-mail enviado para ${item.owner.email}: "${item.title}"`);
      } catch (err: any) {
        this.logger.error(`Falha ao enviar e-mail para ${item.owner.email}: ${err?.message}`);
      }
    }

    return sent;
  }
}
