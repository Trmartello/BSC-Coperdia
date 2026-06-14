import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Flags / preferências do sistema (chave/valor) ──────────────────────────
  private readonly FLAG_DEFAULTS: Record<string, any> = {
    showEstimate: true, // exibir coluna "Estimativa" nos cards/painéis
  };

  async getFlags() {
    const rows = await this.prisma.systemSetting.findMany();
    const flags: Record<string, any> = { ...this.FLAG_DEFAULTS };
    for (const row of rows) flags[row.key] = row.value;
    return flags;
  }

  async setFlag(key: string, value: any, userId: string) {
    const updated = await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    await this.audit.log({ userId, action: 'UPDATE', entity: 'SystemSetting', entityId: key, after: { key, value } });
    return updated;
  }

  async getSystemSettings() {
    // Return aggregated system info
    const [userCount, indicatorCount, mapCount, planCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.indicator.count(),
      this.prisma.indicatorMap.count(),
      this.prisma.actionPlan.count(),
    ]);

    return {
      system: {
        version: '1.0.0',
        name: 'BSC Copérdia',
      },
      stats: { userCount, indicatorCount, mapCount, planCount },
    };
  }

  async getIndicators() {
    return this.prisma.indicator.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      include: {
        formula: true,
        _count: { select: { realizedValues: true, forecastValues: true } },
      },
    });
  }

  async createIndicator(data: any, userId: string) {
    // Gera código automático (ex.: FIN-001) quando não informado
    if (!data.code) {
      const prefix = (data.category || 'IND')
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'IND';
      const count = await this.prisma.indicator.count();
      data.code = `${prefix}-${String(count + 1).padStart(3, '0')}`;
    }
    const created = await this.prisma.indicator.create({ data });
    await this.audit.log({ userId, action: 'CREATE', entity: 'Indicator', entityId: created.id, after: created });
    return created;
  }

  async updateIndicator(id: string, data: any, userId: string) {
    const before = await this.prisma.indicator.findUnique({ where: { id } });
    const updated = await this.prisma.indicator.update({ where: { id }, data });
    await this.audit.log({ userId, action: 'UPDATE', entity: 'Indicator', entityId: id, before, after: updated });
    return updated;
  }

  async deleteIndicator(id: string, userId: string) {
    const before = await this.prisma.indicator.findUnique({ where: { id } });
    await this.prisma.indicator.delete({ where: { id } });
    await this.audit.log({ userId, action: 'DELETE', entity: 'Indicator', entityId: id, before });
    return { success: true };
  }

  async getMaps() {
    return this.prisma.indicatorMap.findMany({
      include: {
        category: true,
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCategories() {
    return this.prisma.mapCategory.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createCategory(data: any, userId: string) {
    return this.prisma.mapCategory.create({ data: { ...data, userId } });
  }

  async updateCategory(id: string, data: any) {
    return this.prisma.mapCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string) {
    await this.prisma.mapCategory.delete({ where: { id } });
    return { success: true };
  }
}
