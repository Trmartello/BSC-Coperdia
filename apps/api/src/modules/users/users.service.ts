import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true, name: true, email: true, role: true,
        active: true, createdAt: true, updatedAt: true,
        _count: { select: { actionPlans: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true,
        active: true, createdAt: true, updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async create(data: any, requesterId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const passwordHash = await bcrypt.hash(data.password || 'changeme123', 12);
    const created = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role ?? 'GESTOR',
        active: data.active ?? true,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    });
    await this.audit.log({
      userId: requesterId,
      action: 'CREATE',
      entity: 'User',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  async update(id: string, data: any, requesterId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.email) updateData.email = data.email;
    if (data.role) updateData.role = data.role;
    if (data.active !== undefined) updateData.active = data.active;
    if (data.password) updateData.passwordHash = await bcrypt.hash(data.password, 12);

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, active: true, updatedAt: true },
    });
    await this.audit.log({
      userId: requesterId,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      before: { name: user.name, email: user.email, role: user.role, active: user.active },
      after: updated,
    });
    return updated;
  }

  async remove(id: string, requesterId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { _count: { select: { actionPlans: true } } },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    // Usuário com vínculos (planos, mapas, etc.) não pode ser apagado por FK Restrict.
    // Nesse caso fazemos desativação (soft-delete) para preservar o histórico.
    const auditBefore = { name: user.name, email: user.email, role: user.role };
    try {
      await this.prisma.user.delete({ where: { id } });
      await this.audit.log({ userId: requesterId, action: 'DELETE', entity: 'User', entityId: id, before: auditBefore });
      return { success: true, deactivated: false };
    } catch (err: any) {
      if (err?.code === 'P2003') {
        await this.prisma.user.update({ where: { id }, data: { active: false } });
        await this.audit.log({
          userId: requesterId,
          action: 'UPDATE',
          entity: 'User',
          entityId: id,
          before: auditBefore,
          after: { active: false, deactivated: true },
        });
        return { success: true, deactivated: true };
      }
      throw err;
    }
  }

  async toggleActive(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.prisma.user.update({
      where: { id },
      data: { active: !user.active },
      select: { id: true, active: true },
    });
  }
}
