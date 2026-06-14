import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CalcEngineService } from '../calc-engine/calc-engine.service';
import Decimal from 'decimal.js';

export interface CreateScenarioDto {
  name: string;
  description?: string;
  period: string;
}

@Injectable()
export class ScenariosService {
  constructor(
    private prisma: PrismaService,
    private calcEngine: CalcEngineService,
    private audit: AuditService,
  ) {}

  async findAll(userId: string) {
    return this.prisma.scenario.findMany({
      where: { userId },
      include: { _count: { select: { forecastValues: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id },
      include: {
        forecastValues: { include: { indicator: true } },
        scenarioValues: { include: { indicator: true } },
      },
    });
    if (!scenario) throw new NotFoundException(`Scenario ${id} not found`);
    return scenario;
  }

  async create(dto: CreateScenarioDto, userId: string) {
    const created = await this.prisma.scenario.create({
      data: { ...dto, period: new Date(dto.period), userId },
    });
    await this.audit.log({
      userId,
      action: 'CREATE',
      entity: 'Scenario',
      entityId: created.id,
      scenarioId: created.id,
      after: { name: created.name, description: created.description, period: created.period },
    });
    return created;
  }

  async recalculate(id: string) {
    const scenario = await this.prisma.scenario.findUnique({ where: { id } });
    if (!scenario) throw new NotFoundException();
    const results = await this.calcEngine.recalculate(id, scenario.period);
    return { scenarioId: id, computed: results.length };
  }

  async compare(baseId: string, compareId: string) {
    const [base, compare] = await Promise.all([
      this.prisma.scenarioValue.findMany({ where: { scenarioId: baseId }, include: { indicator: true } }),
      this.prisma.scenarioValue.findMany({ where: { scenarioId: compareId }, include: { indicator: true } }),
    ]);

    const compareMap = new Map(compare.map((v) => [v.indicatorId, v]));

    return base.map((bv) => {
      const cv = compareMap.get(bv.indicatorId);
      const baseVal = new Decimal(bv.value.toString());
      const compVal = cv ? new Decimal(cv.value.toString()) : new Decimal(0);
      const delta = compVal.minus(baseVal);
      const pct = baseVal.isZero() ? new Decimal(0) : delta.div(baseVal).mul(100);

      return {
        indicator: bv.indicator,
        base: baseVal.toNumber(),
        compare: compVal.toNumber(),
        delta: delta.toNumber(),
        deltaPercent: pct.toNumber(),
      };
    });
  }

  async getImpactMap(scenarioId: string) {
    const values = await this.prisma.scenarioValue.findMany({
      where: { scenarioId, delta: { not: 0 } },
      include: { indicator: true },
      orderBy: { deltaPercent: 'desc' },
    });
    return values;
  }

  async archive(id: string) {
    return this.prisma.scenario.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }
}
