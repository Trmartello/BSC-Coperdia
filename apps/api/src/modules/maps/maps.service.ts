import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CalcEngineService } from '../calc-engine/calc-engine.service';

@Injectable()
export class MapsService {
  constructor(
    private prisma: PrismaService,
    private calcEngine: CalcEngineService,
  ) {}

  // ── Categories ─────────────────────────────────────────────────────────────

  async getCategories() {
    return this.prisma.mapCategory.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createCategory(data: { name: string; color?: string }, userId: string) {
    const count = await this.prisma.mapCategory.count();
    return this.prisma.mapCategory.create({
      data: { name: data.name, color: data.color ?? '#6366f1', sortOrder: count, userId },
    });
  }

  async updateCategory(id: string, data: { name?: string; color?: string }) {
    return this.prisma.mapCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string) {
    return this.prisma.mapCategory.delete({ where: { id } });
  }

  // ── Maps ───────────────────────────────────────────────────────────────────

  async findAll(categoryId?: string) {
    return this.prisma.indicatorMap.findMany({
      where: categoryId ? { categoryId } : undefined,
      include: {
        category: true,
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    // Mantém os valores calculados em dia para os cards do mapa
    await this.calcEngine.recalculateRealized();
    const map = await this.prisma.indicatorMap.findUnique({
      where: { id },
      include: {
        category: true,
        entries: {
          include: {
            indicator: {
              include: {
                formula: true,
                realizedValues: { orderBy: { period: 'desc' }, take: 1 },
                forecastValues: { orderBy: { period: 'desc' }, take: 1 },
                goals: { orderBy: { period: 'desc' }, take: 1 },
                parents: { include: { parent: { select: { id: true, code: true, name: true } } } },
                children: { include: { child: { select: { id: true, code: true, name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!map) throw new NotFoundException();
    return map;
  }

  async create(data: { name: string; description?: string; categoryId: string }, userId: string) {
    return this.prisma.indicatorMap.create({
      data: { ...data, userId },
      include: { category: true },
    });
  }

  async update(id: string, data: { name?: string; description?: string; categoryId?: string; flowData?: any }) {
    return this.prisma.indicatorMap.update({
      where: { id },
      data,
      include: { category: true },
    });
  }

  async delete(id: string) {
    return this.prisma.indicatorMap.delete({ where: { id } });
  }

  // ── Save ReactFlow layout ──────────────────────────────────────────────────

  async saveLayout(id: string, flowData: { nodes: any[]; edges: any[] }) {
    // Persist node positions back to entries
    const map = await this.prisma.indicatorMap.findUnique({ where: { id }, include: { entries: true } });
    if (!map) throw new NotFoundException();

    const posMap = new Map(
      flowData.nodes.map((n: any) => [n.id, { x: n.position?.x ?? 0, y: n.position?.y ?? 0 }]),
    );

    await this.prisma.$transaction(
      map.entries.map((entry) => {
        const pos = posMap.get(entry.indicatorId);
        if (!pos) return this.prisma.indicatorMapEntry.update({ where: { id: entry.id }, data: {} });
        return this.prisma.indicatorMapEntry.update({
          where: { id: entry.id },
          data: { positionX: pos.x, positionY: pos.y },
        });
      }),
    );

    return this.prisma.indicatorMap.update({
      where: { id },
      data: { flowData: flowData as any },
    });
  }

  // ── Add / remove indicator from map ───────────────────────────────────────

  async addIndicator(mapId: string, indicatorId: string, position?: { x: number; y: number }) {
    return this.prisma.indicatorMapEntry.upsert({
      where: { mapId_indicatorId: { mapId, indicatorId } },
      create: { mapId, indicatorId, positionX: position?.x ?? 0, positionY: position?.y ?? 0 },
      update: { positionX: position?.x ?? 0, positionY: position?.y ?? 0 },
    });
  }

  async removeIndicator(mapId: string, indicatorId: string) {
    return this.prisma.indicatorMapEntry.deleteMany({ where: { mapId, indicatorId } });
  }
}
