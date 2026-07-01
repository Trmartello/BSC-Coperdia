import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CalcEngineService } from '../calc-engine/calc-engine.service';

@Injectable()
export class MapsService {
  constructor(
    private prisma: PrismaService,
    private calcEngine: CalcEngineService,
  ) {}

  // ── Structures (containers/pastas de mapas) ─────────────────────────────────

  async getStructures() {
    return this.prisma.mapStructure.findMany({
      include: {
        creator: { select: { id: true, name: true } },
        _count: { select: { maps: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getStructure(id: string) {
    const structure = await this.prisma.mapStructure.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true } },
        maps: {
          include: {
            category: true,
            _count: { select: { entries: true } },
            entries: { select: { indicatorId: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!structure) throw new NotFoundException('Estrutura não encontrada');
    return structure;
  }

  async createStructure(
    data: { name: string; description?: string; category?: string },
    userId: string,
  ) {
    return this.prisma.mapStructure.create({
      data: {
        name: data.name,
        description: data.description,
        category: data.category ?? 'Geral',
        createdBy: userId,
      },
      include: { creator: { select: { id: true, name: true } }, _count: { select: { maps: true } } },
    });
  }

  async updateStructure(
    id: string,
    data: { name?: string; description?: string; category?: string },
  ) {
    await this.ensureStructure(id);
    return this.prisma.mapStructure.update({
      where: { id },
      data,
      include: { creator: { select: { id: true, name: true } }, _count: { select: { maps: true } } },
    });
  }

  /**
   * Exclui uma estrutura. Se ainda houver mapas vinculados, é obrigatório
   * confirmar a exclusão em cascata (`deleteMaps=true`) — caso contrário a
   * operação é bloqueada para que o usuário mova os mapas antes.
   */
  async deleteStructure(id: string, deleteMaps = false) {
    await this.ensureStructure(id);
    const mapCount = await this.prisma.indicatorMap.count({ where: { structureId: id } });
    if (mapCount > 0 && !deleteMaps) {
      throw new ConflictException(
        'A estrutura possui mapas vinculados. Mova-os para outra estrutura ou confirme a exclusão em cascata.',
      );
    }
    // onDelete: Cascade nos mapas cuida da remoção dos mapas + entries.
    return this.prisma.mapStructure.delete({ where: { id } });
  }

  private async ensureStructure(id: string) {
    const exists = await this.prisma.mapStructure.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Estrutura não encontrada');
  }

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

  async findAll(filter?: { categoryId?: string; structureId?: string }) {
    const where: any = {};
    if (filter?.categoryId) where.categoryId = filter.categoryId;
    if (filter?.structureId) where.structureId = filter.structureId;
    return this.prisma.indicatorMap.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        category: true,
        _count: { select: { entries: true } },
        // IDs dos indicadores do mapa — usado p/ filtrar planos de ação por mapa
        entries: { select: { indicatorId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, period?: string, accumulated = false) {
    // Mantém os valores calculados em dia para os cards do mapa
    await this.calcEngine.recalculateRealized();

    // Com um período de referência, os cards refletem o valor vigente "até"
    // aquele mês (último valor conhecido <= período selecionado).
    const upto = period ? { period: { lte: new Date(period) } } : {};

    const map = await this.prisma.indicatorMap.findUnique({
      where: { id },
      include: {
        category: true,
        entries: {
          include: {
            indicator: {
              include: {
                formula: true,
                realizedValues: { where: upto, orderBy: { period: 'desc' }, take: 1 },
                forecastValues: { where: { scenarioId: null, ...upto }, orderBy: { period: 'desc' }, take: 1 },
                goals: { where: upto, orderBy: { period: 'desc' }, take: 1 },
                // Contadores para o rodapé do card (ações/anexos/comentários).
                // Anexos agora vivem dentro dos comentários (attachmentUrl).
                actionPlans: {
                  select: {
                    comments: { select: { content: true, attachmentUrl: true } },
                    initiatives: { select: { _count: { select: { actions: true } } } },
                  },
                },
                parents: { include: { parent: { select: { id: true, code: true, name: true } } } },
                children: { include: { child: { select: { id: true, code: true, name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!map) throw new NotFoundException();

    // Modo "Acumular" (YTD): substitui os valores pontuais dos cards pelos
    // acumulados de jan→período. Calculados refletem o acumulado das bases.
    if (accumulated && period) {
      const acc = await this.calcEngine.getAccumulatedValues(new Date(period));
      for (const entry of map.entries) {
        const v = acc.get(entry.indicatorId);
        const ind = entry.indicator as any;
        ind.realizedValues = v?.realized != null ? [{ value: v.realized.toString() }] : [];
        ind.forecastValues = v?.forecast != null ? [{ value: v.forecast.toString() }] : [];
        ind.goals = v?.goal != null ? [{ value: v.goal.toString() }] : [];
      }
    }

    return map;
  }

  async create(
    data: { name: string; description?: string; categoryId: string; structureId?: string },
    userId: string,
  ) {
    return this.prisma.indicatorMap.create({
      data: { ...data, userId },
      include: { category: true },
    });
  }

  async update(
    id: string,
    data: { name?: string; description?: string; categoryId?: string; structureId?: string; flowData?: any },
  ) {
    return this.prisma.indicatorMap.update({
      where: { id },
      data,
      include: { category: true },
    });
  }

  async delete(id: string) {
    return this.prisma.indicatorMap.delete({ where: { id } });
  }

  /**
   * Duplica um mapa (dentro da mesma estrutura): copia nome (+ " (cópia)"),
   * descrição, categoria, estrutura, layout (flowData) e todos os indicadores
   * com suas posições. Não afeta o mapa original nem os demais da estrutura.
   */
  async duplicate(id: string, userId: string) {
    const source = await this.prisma.indicatorMap.findUnique({
      where: { id },
      include: { entries: true },
    });
    if (!source) throw new NotFoundException('Mapa não encontrado');

    return this.prisma.indicatorMap.create({
      data: {
        name: `${source.name} (cópia)`,
        description: source.description,
        categoryId: source.categoryId,
        structureId: source.structureId,
        flowData: (source.flowData ?? undefined) as any,
        userId,
        entries: {
          create: source.entries.map((e) => ({
            indicatorId: e.indicatorId,
            positionX: e.positionX,
            positionY: e.positionY,
          })),
        },
      },
      include: { category: true, _count: { select: { entries: true } } },
    });
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
