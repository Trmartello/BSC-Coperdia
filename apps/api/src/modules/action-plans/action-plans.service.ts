import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreatePlanDto {
  indicatorId?: string;
  problem: string;
  description?: string;
  status?: string;
}

export interface UpdatePlanDto {
  problem?: string;
  description?: string;
  status?: string;
}

export interface CreateInitiativeDto {
  title: string;
  description?: string;
}

export interface UpdateInitiativeDto {
  title?: string;
  description?: string;
  status?: string;
}

export interface CreateActionItemDto {
  title: string;
  description?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  ownerName?: string;
  ownerId?: string;
  progress?: number;
  observations?: string;
}

export interface UpdateActionItemDto extends Partial<CreateActionItemDto> {}

export interface CreateCommentDto {
  content?: string;
  progress?: number;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
  attachmentMime?: string;
}

export interface CreateAttachmentDto {
  filename: string;
  url: string;
  size: number;
  mimeType: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ActionPlansService {
  constructor(private prisma: PrismaService) {}

  // ── Plans ──────────────────────────────────────────────────────────────────

  async findAll(filters: {
    indicatorId?: string;
    userId?: string;
    standalone?: boolean;
    // Filtros de ação aplicados server-side (evita dependência de versão do build no client)
    priorities?: string[];
    statuses?: string[];
    ownerOrCreatorIds?: string[];
  }) {
    const planWhere: any = {};
    if (filters.indicatorId) planWhere.indicatorId = filters.indicatorId;
    if (filters.userId) planWhere.userId = filters.userId;
    if (filters.standalone) planWhere.indicatorId = null;

    // Constrói o filtro de ação: plano só aparece se tiver ≥1 ação compatível
    const actionFilter: any = {};
    if (filters.priorities?.length) actionFilter.priority = { in: filters.priorities };
    if (filters.statuses?.length) actionFilter.status = { in: filters.statuses };
    if (filters.ownerOrCreatorIds?.length) {
      actionFilter.OR = [
        { userId: { in: filters.ownerOrCreatorIds } },
        { ownerId: { in: filters.ownerOrCreatorIds } },
      ];
    }

    const hasActionFilter = Object.keys(actionFilter).length > 0;
    if (hasActionFilter) {
      planWhere.initiatives = { some: { actions: { some: actionFilter } } };
    }

    const plans = await this.prisma.actionPlan.findMany({
      where: planWhere,
      include: {
        user: { select: { id: true, name: true } },
        indicator: { select: { id: true, code: true, name: true } },
        _count: { select: { initiatives: true, comments: true, attachments: true } },
        initiatives: {
          include: {
            _count: { select: { actions: true } },
            // Quando há filtro de ação, retorna SOMENTE as ações compatíveis —
            // o servidor é a fonte única da verdade da hierarquia exibida.
            actions: {
              where: hasActionFilter ? actionFilter : undefined,
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Com filtro ativo: descarta iniciativas sem nenhuma ação compatível.
    // (Planos sem iniciativa compatível já foram excluídos pelo `where` acima.)
    if (hasActionFilter) {
      return plans.map((p) => ({
        ...p,
        initiatives: p.initiatives.filter((i) => i.actions.length > 0),
      }));
    }

    return plans;
  }

  async findOne(id: string) {
    const plan = await this.prisma.actionPlan.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, role: true } },
        indicator: { select: { id: true, code: true, name: true, unit: true } },
        initiatives: {
          include: {
            actions: { include: { owner: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        comments: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        auditLogs: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!plan) throw new NotFoundException(`ActionPlan ${id} not found`);
    return plan;
  }

  async create(dto: CreatePlanDto, userId: string) {
    const plan = await this.prisma.actionPlan.create({
      data: {
        problem: dto.problem,
        description: dto.description,
        status: (dto.status as any) ?? 'OPEN',
        indicatorId: dto.indicatorId ?? null,
        userId,
      },
    });

    await this.audit(plan.id, userId, 'CREATE', undefined, undefined, plan);
    return plan;
  }

  // Plano vinculado a indicador: o "problema" é implícito (o próprio indicador).
  // Retorna o plano canônico (mais antigo) do indicador, criando um se não existir.
  async ensureForIndicator(indicatorId: string, userId: string) {
    const existing = await this.prisma.actionPlan.findFirst({
      where: { indicatorId },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;

    const indicator = await this.prisma.indicator.findUnique({ where: { id: indicatorId } });
    if (!indicator) throw new NotFoundException(`Indicator ${indicatorId} not found`);

    const plan = await this.prisma.actionPlan.create({
      data: {
        indicatorId,
        problem: indicator.name, // problema implícito = o próprio indicador
        status: 'OPEN',
        userId,
      },
    });
    await this.audit(plan.id, userId, 'CREATE', undefined, undefined, plan);
    return plan;
  }

  async update(id: string, dto: UpdatePlanDto, userId: string) {
    const before = await this.prisma.actionPlan.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();

    const updated = await this.prisma.actionPlan.update({
      where: { id },
      data: {
        ...dto,
        status: dto.status ? (dto.status as any) : undefined,
      },
    });

    if (dto.status && dto.status !== before.status) {
      await this.audit(id, userId, 'STATUS_CHANGE', 'status', before.status, dto.status);
    } else {
      await this.audit(id, userId, 'UPDATE', undefined, before, dto);
    }

    return updated;
  }

  async delete(id: string, userId: string) {
    await this.audit(id, userId, 'DELETE', undefined, undefined, undefined);
    return this.prisma.actionPlan.delete({ where: { id } });
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard() {
    const [plans, items] = await Promise.all([
      this.prisma.actionPlan.findMany({
        include: {
          initiatives: {
            include: { actions: { select: { status: true, progress: true, dueDate: true, ownerName: true } } },
          },
          indicator: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.actionItem.findMany({ select: { status: true, progress: true, ownerName: true, priority: true, dueDate: true } }),
    ]);

    const allActions = plans.flatMap((p) => p.initiatives.flatMap((i) => i.actions));
    const now = new Date();

    const open = allActions.filter((a) => a.status !== 'DONE' && a.status !== 'CANCELLED').length;
    const done = allActions.filter((a) => a.status === 'DONE').length;
    const overdue = allActions.filter(
      (a) => a.dueDate && new Date(a.dueDate) < now && a.status !== 'DONE' && a.status !== 'CANCELLED',
    ).length;
    const avgProgress = allActions.length
      ? Math.round(allActions.reduce((s, a) => s + (a.progress ?? 0), 0) / allActions.length)
      : 0;

    const byPriority = allActions.reduce((acc: any, a: any) => {
      acc[a.priority] = (acc[a.priority] ?? 0) + 1;
      return acc;
    }, {});

    const byOwner = allActions.reduce((acc: any, a: any) => {
      const key = a.ownerName ?? 'Sem responsável';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const indicatorActionCount = plans
      .filter((p) => p.indicatorId)
      .map((p) => ({
        indicator: p.indicator,
        openActions: p.initiatives.flatMap((i) => i.actions).filter((a) => a.status !== 'DONE').length,
      }))
      .sort((a, b) => b.openActions - a.openActions)
      .slice(0, 5);

    const nearDue = allActions
      .filter((a) => {
        if (!a.dueDate || a.status === 'DONE' || a.status === 'CANCELLED') return false;
        const diff = (new Date(a.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 7;
      })
      .slice(0, 5);

    return { open, done, overdue, avgProgress, byPriority, byOwner, indicatorActionCount, nearDue };
  }

  // ── Initiatives ────────────────────────────────────────────────────────────

  async createInitiative(planId: string, dto: CreateInitiativeDto, userId: string) {
    const count = await this.prisma.initiative.count({ where: { actionPlanId: planId } });
    const initiative = await this.prisma.initiative.create({
      data: { actionPlanId: planId, title: dto.title, description: dto.description, userId, sortOrder: count },
    });
    await this.audit(planId, userId, 'CREATE', 'initiative', undefined, initiative);
    return initiative;
  }

  async updateInitiative(initiativeId: string, dto: UpdateInitiativeDto, userId: string) {
    const init = await this.prisma.initiative.findUnique({ where: { id: initiativeId } });
    if (!init) throw new NotFoundException();
    const updated = await this.prisma.initiative.update({
      where: { id: initiativeId },
      data: { ...dto, status: dto.status as any },
    });
    await this.audit(init.actionPlanId, userId, 'UPDATE', 'initiative', init, dto);
    return updated;
  }

  async deleteInitiative(initiativeId: string, userId: string) {
    const init = await this.prisma.initiative.findUnique({ where: { id: initiativeId } });
    if (!init) throw new NotFoundException();
    await this.audit(init.actionPlanId, userId, 'DELETE', 'initiative', init, undefined);
    return this.prisma.initiative.delete({ where: { id: initiativeId } });
  }

  // ── Action Items ───────────────────────────────────────────────────────────

  async createActionItem(initiativeId: string, dto: CreateActionItemDto, userId: string) {
    const init = await this.prisma.initiative.findUnique({ where: { id: initiativeId } });
    if (!init) throw new NotFoundException(`Initiative ${initiativeId} not found`);

    const item = await this.prisma.actionItem.create({
      data: {
        initiativeId,
        title: dto.title,
        description: dto.description,
        priority: (dto.priority as any) ?? 'MEDIUM',
        status: (dto.status as any) ?? 'PENDING',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        ownerName: dto.ownerName,
        ownerId: dto.ownerId,
        progress: dto.progress ?? 0,
        observations: dto.observations,
        userId,
      },
    });

    await this.audit(init.actionPlanId, userId, 'CREATE', 'action_item', undefined, item);

    return item;
  }

  async updateActionItem(itemId: string, dto: UpdateActionItemDto, userId: string) {
    const before = await this.prisma.actionItem.findUnique({ where: { id: itemId }, include: { initiative: true } });
    if (!before) throw new NotFoundException();

    // Auto-detect overdue
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : before.dueDate;
    let status = dto.status ?? before.status;
    if (dueDate && new Date(dueDate) < new Date() && status === 'PENDING') {
      status = 'OVERDUE';
    }

    const completedAt = status === 'DONE' && before.status !== 'DONE' ? new Date() : before.completedAt;

    const updated = await this.prisma.actionItem.update({
      where: { id: itemId },
      data: {
        ...dto,
        status: status as any,
        priority: dto.priority as any,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        progress: dto.progress !== undefined ? Number(dto.progress) : undefined,
        completedAt,
      },
    });

    await this.audit(before.initiative.actionPlanId, userId, 'UPDATE', 'action_item', before, dto);
    return updated;
  }

  async deleteActionItem(itemId: string, userId: string) {
    const item = await this.prisma.actionItem.findUnique({ where: { id: itemId }, include: { initiative: true } });
    if (!item) throw new NotFoundException();
    await this.audit(item.initiative.actionPlanId, userId, 'DELETE', 'action_item', item, undefined);
    return this.prisma.actionItem.delete({ where: { id: itemId } });
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async addComment(planId: string, dto: CreateCommentDto, userId: string) {
    const comment = await this.prisma.planComment.create({
      data: {
        actionPlanId: planId,
        content: dto.content ?? '',
        progress: dto.progress,
        attachmentUrl: dto.attachmentUrl ?? null,
        attachmentName: dto.attachmentName ?? null,
        attachmentSize: dto.attachmentSize != null ? Number(dto.attachmentSize) : null,
        attachmentMime: dto.attachmentMime ?? null,
        userId,
      },
      include: { user: { select: { id: true, name: true } } },
    });
    await this.audit(planId, userId, dto.attachmentUrl ? 'ATTACHMENT' : 'COMMENT', undefined, undefined, {
      content: dto.content,
      attachment: dto.attachmentName,
    });
    return comment;
  }

  async deleteComment(planId: string, commentId: string, userId: string) {
    const comment = await this.prisma.planComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException();
    if (comment.userId !== userId) throw new ForbiddenException();
    return this.prisma.planComment.delete({ where: { id: commentId } });
  }

  // ── Attachments ────────────────────────────────────────────────────────────

  async addAttachment(planId: string, dto: CreateAttachmentDto, userId: string) {
    const attachment = await this.prisma.planAttachment.create({
      data: { actionPlanId: planId, ...dto, userId },
      include: { user: { select: { id: true, name: true } } },
    });
    await this.audit(planId, userId, 'ATTACHMENT', undefined, undefined, { filename: dto.filename });
    return attachment;
  }

  async deleteAttachment(planId: string, attachmentId: string, userId: string) {
    const att = await this.prisma.planAttachment.findUnique({ where: { id: attachmentId } });
    if (!att) throw new NotFoundException();
    return this.prisma.planAttachment.delete({ where: { id: attachmentId } });
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async audit(
    planId: string,
    userId: string,
    action: string,
    field?: string,
    previousValue?: any,
    newValue?: any,
  ) {
    await this.prisma.planAuditLog.create({
      data: { actionPlanId: planId, userId, action, field, previousValue, newValue },
    });
  }
}
