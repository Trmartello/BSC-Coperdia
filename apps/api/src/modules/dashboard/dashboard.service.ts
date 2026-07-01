import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CalcEngineService } from '../calc-engine/calc-engine.service';
import Decimal from 'decimal.js';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private calcEngine: CalcEngineService,
  ) {}

  async getExecutiveDashboard(period?: Date, scenarioId?: string, accumulated = false) {
    // Se nenhum período válido foi informado, usa o período mais recente com dados realizados
    const effectivePeriod = period ?? (await this.latestRealizedPeriod()) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const strategicCodes = ['RECEITA', 'EBITDA', 'LUCRO_LIQUIDO', 'ROIC', 'ROE', 'FLUXO_CAIXA', 'CAPITAL_GIRO', 'ENDIVIDAMENTO'];

    // Tenta os indicadores estratégicos; se nenhum existir, mostra todos os ativos
    const strategic = await this.prisma.indicator.count({ where: { code: { in: strategicCodes }, active: true } });
    const whereClause = strategic > 0 ? { code: { in: strategicCodes }, active: true } : { active: true };

    // Modo "Acumular" (YTD): consolida jan→período. Calculados refletem o
    // acumulado das bases de cálculo (fórmula sobre os insumos acumulados).
    const acc = accumulated ? await this.calcEngine.getAccumulatedValues(effectivePeriod) : null;

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
      const accVal = acc?.get(ind.id);
      const realized = acc
        ? (accVal?.realized != null ? accVal.realized.toNumber() : null)
        : (ind.realizedValues[0]?.value != null ? new Decimal(ind.realizedValues[0].value.toString()).toNumber() : null);
      const forecast = acc
        ? (accVal?.forecast != null ? accVal.forecast.toNumber() : null)
        : (ind.forecastValues[0]?.value != null ? new Decimal(ind.forecastValues[0].value.toString()).toNumber() : null);
      const goal = acc
        ? (accVal?.goal != null ? accVal.goal.toNumber() : null)
        : (ind.goals[0]?.value != null ? new Decimal(ind.goals[0].value.toString()).toNumber() : null);

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

  // Índices de análise financeira (source=RATIO): valor atual + mês anterior + variação.
  async getFinancialAnalysis(period?: Date) {
    const effectivePeriod = period ?? (await this.latestRealizedPeriod()) ?? new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1));
    const prev = new Date(Date.UTC(effectivePeriod.getUTCFullYear(), effectivePeriod.getUTCMonth() - 1, 1));

    const inds = await this.prisma.indicator.findMany({
      where: { source: 'RATIO', active: true },
      orderBy: { createdAt: 'asc' },
      include: { realizedValues: { where: { period: { in: [effectivePeriod, prev] } } } },
    });

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return inds.map((ind) => {
      const cur = ind.realizedValues.find((r) => iso(r.period) === iso(effectivePeriod));
      const pr = ind.realizedValues.find((r) => iso(r.period) === iso(prev));
      const current = cur?.value != null ? new Decimal(cur.value.toString()).toNumber() : null;
      const previous = pr?.value != null ? new Decimal(pr.value.toString()).toNumber() : null;
      const delta = current != null && previous != null && previous !== 0
        ? ((current - previous) / Math.abs(previous)) * 100 : null;
      return { id: ind.id, code: ind.code, name: ind.name, unit: ind.unit, direction: ind.direction, current, previous, delta };
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
