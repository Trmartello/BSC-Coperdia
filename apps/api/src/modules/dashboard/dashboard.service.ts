import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import Decimal from 'decimal.js';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getExecutiveDashboard(period: Date, scenarioId?: string) {
    const strategicCodes = ['RECEITA', 'EBITDA', 'LUCRO_LIQUIDO', 'ROIC', 'ROE', 'FLUXO_CAIXA', 'CAPITAL_GIRO', 'ENDIVIDAMENTO'];

    const indicators = await this.prisma.indicator.findMany({
      where: { code: { in: strategicCodes }, active: true },
      include: {
        realizedValues: { where: { period }, take: 1 },
        forecastValues: { where: { period, scenarioId: scenarioId ?? undefined }, take: 1 },
        goals: { where: { period }, take: 1 },
      },
    });

    return indicators.map((ind) => {
      const realized = ind.realizedValues[0]?.value ? new Decimal(ind.realizedValues[0].value.toString()).toNumber() : null;
      const forecast = ind.forecastValues[0]?.value ? new Decimal(ind.forecastValues[0].value.toString()).toNumber() : null;
      const goal = ind.goals[0]?.value ? new Decimal(ind.goals[0].value.toString()).toNumber() : null;

      const effective = forecast ?? realized;
      const deviationGoal = goal && effective != null ? ((effective - goal) / Math.abs(goal)) * 100 : null;

      return {
        id: ind.id,
        code: ind.code,
        name: ind.name,
        unit: ind.unit,
        realized,
        forecast,
        goal,
        effective,
        deviationGoal,
        status: this.computeStatus(deviationGoal),
      };
    });
  }

  async getKpiTimeSeries(indicatorId: string, periods: Date[]) {
    const [realized, goals] = await Promise.all([
      this.prisma.realizedValue.findMany({
        where: { indicatorId, period: { in: periods } },
        orderBy: { period: 'asc' },
      }),
      this.prisma.goal.findMany({
        where: { indicatorId, period: { in: periods } },
        orderBy: { period: 'asc' },
      }),
    ]);

    return { indicatorId, realized, goals };
  }

  async getAuditLog(limit = 50) {
    return this.prisma.auditLog.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private computeStatus(deviation: number | null): string {
    if (deviation === null) return 'NO_DATA';
    if (deviation >= -5) return 'ON_TRACK';
    if (deviation >= -15) return 'AT_RISK';
    return 'OFF_TRACK';
  }
}
