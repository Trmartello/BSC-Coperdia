import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import Decimal from 'decimal.js';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getExecutiveDashboard(period?: Date, scenarioId?: string) {
    // Se nenhum período válido foi informado, usa o período mais recente com dados realizados
    const effectivePeriod = period ?? (await this.latestRealizedPeriod()) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const strategicCodes = ['RECEITA', 'EBITDA', 'LUCRO_LIQUIDO', 'ROIC', 'ROE', 'FLUXO_CAIXA', 'CAPITAL_GIRO', 'ENDIVIDAMENTO'];

    // Tenta os indicadores estratégicos; se nenhum existir, mostra todos os ativos
    const strategic = await this.prisma.indicator.count({ where: { code: { in: strategicCodes }, active: true } });
    const whereClause = strategic > 0 ? { code: { in: strategicCodes }, active: true } : { active: true };

    const indicators = await this.prisma.indicator.findMany({
      where: whereClause,
      orderBy: { sortOrder: 'asc' },
      include: {
        realizedValues: { where: { period: effectivePeriod }, take: 1 },
        forecastValues: { where: { period: effectivePeriod, scenarioId: scenarioId ?? undefined }, take: 1 },
        goals: { where: { period: effectivePeriod }, take: 1 },
      },
    });

    return indicators.map((ind) => {
      // Usa `!= null` (não truthiness) para não tratar valor 0 como ausente
      const realized = ind.realizedValues[0]?.value != null ? new Decimal(ind.realizedValues[0].value.toString()).toNumber() : null;
      const forecast = ind.forecastValues[0]?.value != null ? new Decimal(ind.forecastValues[0].value.toString()).toNumber() : null;
      const goal = ind.goals[0]?.value != null ? new Decimal(ind.goals[0].value.toString()).toNumber() : null;

      const effective = forecast ?? realized;
      // Desvio cru vs meta; inverte o sinal para indicadores onde "menor é melhor"
      const rawDeviation = goal != null && goal !== 0 && effective != null ? ((effective - goal) / Math.abs(goal)) * 100 : null;
      const deviationGoal = rawDeviation != null && ind.direction === 'LOWER_IS_BETTER' ? -rawDeviation : rawDeviation;

      return {
        id: ind.id,
        code: ind.code,
        name: ind.name,
        unit: ind.unit,
        direction: ind.direction,
        realized,
        forecast,
        goal,
        effective,
        deviationGoal,
        status: this.computeStatus(deviationGoal),
      };
    });
  }

  private async latestRealizedPeriod(): Promise<Date | null> {
    const latest = await this.prisma.realizedValue.findFirst({
      orderBy: { period: 'desc' },
      select: { period: true },
    });
    return latest?.period ?? null;
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
