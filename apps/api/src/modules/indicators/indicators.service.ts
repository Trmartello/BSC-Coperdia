import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CalcEngineService, IndicatorNode } from '../calc-engine/calc-engine.service';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { UpdateForecastDto } from './dto/update-forecast.dto';

@Injectable()
export class IndicatorsService {
  constructor(
    private prisma: PrismaService,
    private calcEngine: CalcEngineService,
    private audit: AuditService,
  ) {}

  async findAll() {
    // Garante que indicadores CALCULATED tenham valor realizado atualizado
    // pela fórmula vigente (recompute idempotente; só grava se mudou).
    await this.calcEngine.recalculateRealized();
    return this.prisma.indicator.findMany({
      where: { active: true },
      include: {
        formula: true,
        parents: { include: { parent: { select: { id: true, code: true, name: true } } } },
        children: { include: { child: { select: { id: true, code: true, name: true } } } },
        realizedValues: { orderBy: { period: 'desc' }, take: 1 },
        forecastValues: { where: { scenarioId: null }, orderBy: { period: 'desc' }, take: 1 },
        goals: { orderBy: { period: 'desc' }, take: 1 },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string) {
    await this.calcEngine.recalculateRealized();
    const indicator = await this.prisma.indicator.findUnique({
      where: { id },
      include: {
        formula: true,
        parents: { include: { parent: true } },
        children: { include: { child: true } },
        realizedValues: { orderBy: { period: 'desc' }, take: 12 },
        forecastValues: { where: { scenarioId: null }, orderBy: { period: 'desc' }, take: 12 },
        goals: { orderBy: { period: 'desc' }, take: 12 },
      },
    });
    if (!indicator) throw new NotFoundException(`Indicator ${id} not found`);
    return indicator;
  }

  async create(dto: CreateIndicatorDto) {
    return this.prisma.indicator.create({ data: dto as any });
  }

  async updateForecast(dto: UpdateForecastDto, userId: string) {
    const indicator = await this.prisma.indicator.findUnique({ where: { id: dto.indicatorId } });
    if (!indicator) throw new NotFoundException();
    if (indicator.type === 'CALCULATED') throw new ForbiddenException('Calculated indicators cannot be manually set');

    const period = new Date(dto.period);

    // valor anterior (para registrar o "antes" na auditoria)
    const previous = await this.prisma.forecastValue.findUnique({
      where: {
        indicatorId_scenarioId_period: {
          indicatorId: dto.indicatorId,
          scenarioId: dto.scenarioId,
          period,
        },
      },
    });

    const forecast = await this.prisma.forecastValue.upsert({
      where: {
        indicatorId_scenarioId_period: {
          indicatorId: dto.indicatorId,
          scenarioId: dto.scenarioId,
          period,
        },
      },
      create: {
        indicatorId: dto.indicatorId,
        scenarioId: dto.scenarioId,
        period,
        value: dto.value,
        isManual: true,
        userId,
      },
      update: { value: dto.value, isManual: true },
    });

    // Auditoria da simulação: quem, indicador, cenário, valor anterior e novo
    await this.audit.log({
      userId,
      action: 'SIMULATE',
      entity: 'ForecastValue',
      entityId: forecast.id,
      scenarioId: dto.scenarioId,
      before: previous ? { value: Number(previous.value), period: dto.period } : undefined,
      after: { indicator: indicator.code, value: dto.value, period: dto.period },
    });

    // Trigger recalculation
    await this.calcEngine.recalculate(dto.scenarioId, period, dto.indicatorId);

    return forecast;
  }

  // Carga/correção de valor REALIZADO (carga de dados)
  async setRealized(indicatorId: string, period: string, value: number, userId: string) {
    const p = new Date(period);
    const before = await this.prisma.realizedValue.findUnique({
      where: { indicatorId_period: { indicatorId, period: p } },
    });
    const rv = await this.prisma.realizedValue.upsert({
      where: { indicatorId_period: { indicatorId, period: p } },
      create: { indicatorId, period: p, value },
      update: { value },
    });
    await this.audit.log({
      userId,
      action: before ? 'UPDATE' : 'CREATE',
      entity: 'RealizedValue',
      entityId: rv.id,
      before: before ? { value: Number(before.value), period } : undefined,
      after: { value, period },
    });
    // Keep CALCULATED indicators in sync after input change
    await this.calcEngine.recalculateRealized();
    return rv;
  }

  // Lançamento/correção de ESTIMATIVA (forecast baseline, sem cenário)
  async setEstimate(indicatorId: string, period: string, value: number, userId: string) {
    const indicator = await this.prisma.indicator.findUnique({ where: { id: indicatorId } });
    if (!indicator) throw new NotFoundException();
    if (indicator.type === 'CALCULATED') {
      throw new BadRequestException('A estimativa de um indicador calculado é derivada da fórmula');
    }
    const p = new Date(period);
    // Índice único trata scenarioId NULL como distinto → findFirst + update/create
    const existing = await this.prisma.forecastValue.findFirst({
      where: { indicatorId, scenarioId: null, period: p },
    });
    const fv = existing
      ? await this.prisma.forecastValue.update({ where: { id: existing.id }, data: { value, isManual: true } })
      : await this.prisma.forecastValue.create({
          data: { indicatorId, scenarioId: null, period: p, value, isManual: true, userId },
        });
    await this.audit.log({
      userId,
      action: existing ? 'UPDATE' : 'CREATE',
      entity: 'ForecastValue',
      entityId: fv.id,
      before: existing ? { value: Number(existing.value), period } : undefined,
      after: { value, period, baseline: true },
    });
    // Recalcula a estimativa dos indicadores calculados que dependem deste insumo
    await this.calcEngine.recalculateForecast(userId);
    return fv;
  }

  // Definição/correção de META
  async setGoal(indicatorId: string, period: string, value: number, userId: string) {
    const p = new Date(period);
    const before = await this.prisma.goal.findUnique({
      where: { indicatorId_period: { indicatorId, period: p } },
    });
    const goal = await this.prisma.goal.upsert({
      where: { indicatorId_period: { indicatorId, period: p } },
      create: { indicatorId, period: p, value },
      update: { value },
    });
    await this.audit.log({
      userId,
      action: before ? 'UPDATE' : 'CREATE',
      entity: 'Goal',
      entityId: goal.id,
      before: before ? { value: Number(before.value), period } : undefined,
      after: { value, period },
    });
    return goal;
  }

  // ── Conexões da árvore de impacto (parent = recebe impacto, child = causa) ──
  async addRelation(parentId: string, childId: string, userId: string) {
    if (parentId === childId) {
      throw new BadRequestException('Não é possível conectar um indicador a ele mesmo');
    }
    // Evita ciclo direto: se já existe child→parent, bloquear o inverso
    const inverse = await this.prisma.indicatorRelation.findUnique({
      where: { parentId_childId: { parentId: childId, childId: parentId } },
    });
    if (inverse) {
      throw new BadRequestException('Conexão inversa já existe (geraria um ciclo)');
    }
    const rel = await this.prisma.indicatorRelation.upsert({
      where: { parentId_childId: { parentId, childId } },
      create: { parentId, childId },
      update: {},
    });
    await this.audit.log({
      userId, action: 'CREATE', entity: 'IndicatorRelation', entityId: rel.id,
      after: { parentId, childId },
    });
    return rel;
  }

  async removeRelation(parentId: string, childId: string, userId: string) {
    await this.prisma.indicatorRelation.deleteMany({ where: { parentId, childId } });
    await this.audit.log({
      userId, action: 'DELETE', entity: 'IndicatorRelation', entityId: `${parentId}:${childId}`,
      before: { parentId, childId },
    });
    return { success: true };
  }

  async getTree(rootId?: string) {
    const graph = await this.calcEngine.buildGraph();

    if (rootId) {
      return this.buildSubTree(rootId, graph);
    }

    // Find roots (nodes with no parents)
    const roots = [...graph.values()].filter((n) => n.parents.length === 0);
    return roots.map((r) => this.buildSubTree(r.id, graph));
  }

  private buildSubTree(id: string, graph: Map<string, IndicatorNode>, visited = new Set<string>()): any {
    if (visited.has(id)) return { id, circular: true };
    visited.add(id);
    const node = graph.get(id);
    if (!node) return null;
    return {
      ...node,
      children: node.children.map((cid) => this.buildSubTree(cid, graph, new Set(visited))),
    };
  }

  async getImpactChain(indicatorId: string) {
    const graph = await this.calcEngine.buildGraph();
    const affected = await this.calcEngine.getImpactChain(indicatorId, graph);
    return { indicatorId, affectedIndicators: affected };
  }
}
