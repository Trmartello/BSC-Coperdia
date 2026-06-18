import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from '../../common/prisma/prisma.service';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  // Roda todo dia às 08:00 (horário do servidor)
  @Cron('0 8 * * *', { name: 'overdue-actions' })
  async sendOverdueNotifications() {
    this.logger.log('Verificando ações em atraso...');
    const sent = await this.notifyOverdueActions();
    this.logger.log(`Notificações enviadas: ${sent}`);
  }

  // Permite disparo manual (ex: via endpoint de admin / teste)
  async notifyOverdueActions(): Promise<number> {
    const now = new Date();

    // Busca ações em atraso com responsável no sistema (tem ownerId) ou ownerName
    const overdueItems = await this.prisma.actionItem.findMany({
      where: {
        status: { notIn: ['DONE', 'CANCELLED'] },
        dueDate: { lt: now },
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        initiative: {
          include: {
            actionPlan: {
              include: {
                indicator: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    this.logger.log(`Ações em atraso: ${overdueItems.length}`);

    // Agrupa por e-mail para enviar um resumo por usuário (evita spam)
    const byEmail = new Map<string, { email: string; name: string; items: typeof overdueItems }>();

    for (const item of overdueItems) {
      // Usa o usuário vinculado (ownerId); sem ownerId, não temos e-mail confiável
      if (!item.owner?.email) continue;

      const { email, name } = item.owner;
      if (!byEmail.has(email)) byEmail.set(email, { email, name, items: [] });
      byEmail.get(email)!.items.push(item);
    }

    const appUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    let sent = 0;

    for (const { email, name, items } of byEmail.values()) {
      // Se tem múltiplas ações, envia uma por uma para clareza
      for (const item of items) {
        const plan = item.initiative.actionPlan;
        try {
          await this.mailer.sendMail({
            to: email,
            subject: `⚠️ Ação em atraso: ${item.title}`,
            template: 'overdue-action',
            context: {
              ownerName: name,
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
          this.logger.log(`E-mail enviado para ${email}: "${item.title}"`);
        } catch (err: any) {
          this.logger.error(`Falha ao enviar e-mail para ${email}: ${err?.message}`);
        }
      }
    }

    return sent;
  }
}
