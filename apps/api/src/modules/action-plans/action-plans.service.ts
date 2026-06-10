import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateActionPlanDto {
  indicatorId: string;
  title: string;
  description?: string;
  responsible?: string;
  dueDate?: string;
  priority?: string;
}

@Injectable()
export class ActionPlansService {
  constructor(private prisma: PrismaService) {}

  findByIndicator(indicatorId: string) {
    return this.prisma.actionPlan.findMany({
      where: { indicatorId },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: CreateActionPlanDto, userId: string) {
    return this.prisma.actionPlan.create({
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        priority: (dto.priority as any) ?? 'MEDIUM',
        userId,
      },
    });
  }

  async update(id: string, data: Partial<{ status: string; title: string; description: string; responsible: string; dueDate: string; priority: string }>) {
    const existing = await this.prisma.actionPlan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();

    return this.prisma.actionPlan.update({
      where: { id },
      data: {
        ...data,
        status: data.status as any,
        priority: data.priority as any,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });
  }

  async delete(id: string) {
    return this.prisma.actionPlan.delete({ where: { id } });
  }

  findAll(userId: string) {
    return this.prisma.actionPlan.findMany({
      where: { userId },
      include: { indicator: { select: { id: true, code: true, name: true } } },
      orderBy: { dueDate: 'asc' },
    });
  }
}
