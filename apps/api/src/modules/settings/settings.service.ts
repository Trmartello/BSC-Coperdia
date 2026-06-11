import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async createIndicator(data: any) {
    return this.prisma.indicator.create({ data });
  }

  async updateIndicator(id: string, data: any) {
    return this.prisma.indicator.update({ where: { id }, data });
  }

  async deleteIndicator(id: string) {
    await this.prisma.indicator.delete({ where: { id } });
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
