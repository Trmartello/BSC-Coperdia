import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { evaluate } from 'mathjs';
import Decimal from 'decimal.js';

type Direction = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
type Status = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'NO_DATA';

export interface IndicatorNode {
  id: string;
  code: string;
  type: 'INPUT' | 'CALCULATED';
  direction: Direction;
  formulaExpression?: string;
  formulaVariables?: Record<string, string>; // { VAR_NAME: indicatorId }
  children: string[];
  parents: string[];
}

export interface ComputedResult {
  indicatorId: string;
  value: Decimal;
  delta: Decimal;
  deltaPercent: Decimal;
  status: Status;
}

@Injectable()
export class CalcEngineService {
  private readonly logger = new Logger(CalcEngineService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ── Build in-memory graph ────────────────────────────────────────────────────

  async buildGraph(): Promise<Map<string, IndicatorNode>> {
    const [indicators, relations, formulas] = await Promise.all([
      this.prisma.indicator.findMany({ where: { active: true } }),
      this.prisma.indicatorRelation.findMany(),
      this.prisma.formula.findMany(),
    ]);

    const formulaMap = new Map(formulas.map((f) => [f.indicatorId, f]));
    const graph = new Map<string, IndicatorNode>();

    for (const ind of indicators) {
      const formula = formulaMap.get(ind.id);
      graph.set(ind.id, {
        id: ind.id,
        code: ind.code,
        type: ind.type as 'INPUT' | 'CALCULATED',
        direction: ind.direction as Direction,
        formulaExpression: formula?.expression,
        formulaVariables: formula?.variables as Record<string, string> | undefined,
        children: [],
        parents: [],
      });
    }

    for (const rel of relations) {
      graph.get(rel.parentId)?.children.push(rel.childId);
      graph.get(rel.childId)?.parents.push(rel.parentId);
    }

    return graph;
  }

  // ── Resolve values for a period/scenario ───────────────────────────────────

  async resolveValues(
    period: Date,
    scenarioId: string | null,
  ): Promise<Map<string, Decimal>> {
    const [realized, forecasted] = await Promise.all([
      this.prisma.realizedValue.findMany({ where: { period } }),
      // scenarioId ?? null filtra explicitamente: baseline = forecasts sem cenário,
      // evitando vazar previstos de outros cenários (Prisma trata undefined como "sem filtro").
      this.prisma.forecastValue.findMany({ where: { period, scenarioId: scenarioId ?? null } }),
    ]);

    const values = new Map<string, Decimal>();

    // base: realized
    for (const rv of realized) {
      values.set(rv.indicatorId, new Decimal(rv.value.toString()));
    }

    // override with forecast (regra: se existe previsto, usa previsto; senão realizado)
    for (const fv of forecasted) {
      values.set(fv.indicatorId, new Decimal(fv.value.toString()));
    }

    return values;
  }

  // ── Topological sort ────────────────────────────────────────────────────────

  topologicalSort(graph: Map<string, IndicatorNode>): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = graph.get(id);
      if (!node) return;
      for (const childId of node.children) visit(childId);
      order.push(id);
    };

    for (const id of graph.keys()) visit(id);
    return order.reverse(); // leaves first, roots last
  }

  // ── Evaluate single formula ─────────────────────────────────────────────────
  // Retorna null (= NO_DATA) se alguma variável não tiver valor ou o resultado
  // não for um número finito. Não trata ausência de dado como 0.

  evaluateFormula(
    expression: string,
    variables: Record<string, string>,
    values: Map<string, Decimal>,
  ): Decimal | null {
    const scope: Record<string, number> = {};

    for (const [varName, indicatorId] of Object.entries(variables)) {
      const v = values.get(indicatorId);
      if (v === undefined) return null; // dependência sem dado → propaga NO_DATA
      scope[varName] = v.toNumber();
    }

    try {
      const result = evaluate(expression, scope);
      if (typeof result !== 'number' || !Number.isFinite(result)) return null;
      return new Decimal(result);
    } catch (err) {
      this.logger.error(`Formula eval error: ${expression}`, err as Error);
      return null;
    }
  }

  // ── Status derivation (respeita a direção do indicador) ──────────────────────

  private computeStatus(value: Decimal, goal: Decimal | undefined, direction: Direction): Status {
    if (goal === undefined) return 'NO_DATA';

    // desvio relativo à meta, com sinal "favorável" conforme a direção
    let favorableDev: Decimal;
    if (goal.isZero()) {
      const diff = value.minus(goal);
      favorableDev = direction === 'LOWER_IS_BETTER' ? diff.negated() : diff;
    } else {
      const rawDev = value.minus(goal).div(goal.abs());
      favorableDev = direction === 'LOWER_IS_BETTER' ? rawDev.negated() : rawDev;
    }

    if (favorableDev.gte(-0.001)) return 'ON_TRACK'; // na meta ou melhor
    if (favorableDev.gte(-0.1)) return 'AT_RISK'; // até 10% pior que a meta
    return 'OFF_TRACK';
  }

  // ── Full recalculation ──────────────────────────────────────────────────────

  async recalculate(
    scenarioId: string,
    period: Date,
    changedIndicatorId?: string,
  ): Promise<ComputedResult[]> {
    const graph = await this.buildGraph();
    const values = await this.resolveValues(period, scenarioId);
    const baselineValues = await this.resolveValues(period, null);
    const goals = await this.prisma.goal.findMany({ where: { period } });
    const goalMap = new Map(goals.map((g) => [g.indicatorId, new Decimal(g.value.toString())]));

    const order = this.topologicalSort(graph);

    // Recalcula indicadores CALCULATED na ordem topológica (filhos antes dos pais).
    // Se a fórmula não puder ser resolvida, o indicador fica sem valor (NO_DATA)
    // e, como os pais dependem dele, o NO_DATA propaga naturalmente para cima.
    for (const id of order) {
      const node = graph.get(id);
      if (!node) continue;
      if (node.type === 'CALCULATED' && node.formulaExpression && node.formulaVariables) {
        const computed = this.evaluateFormula(node.formulaExpression, node.formulaVariables, values);
        if (computed === null) {
          values.delete(id);
        } else {
          values.set(id, computed);
        }
      }
    }

    // Build results with delta vs baseline + status (respeitando direção)
    const results: ComputedResult[] = [];
    for (const [id, value] of values.entries()) {
      const node = graph.get(id);
      const direction: Direction = node?.direction ?? 'HIGHER_IS_BETTER';
      const base = baselineValues.get(id) ?? value;
      const delta = value.minus(base); // mudança factual do valor (cenário vs baseline)
      const deltaPercent = base.isZero() ? new Decimal(0) : delta.div(base.abs()).mul(100);
      const status = this.computeStatus(value, goalMap.get(id), direction);

      results.push({ indicatorId: id, value, delta, deltaPercent, status });
    }

    // Persist computed values
    await this.persistScenarioValues(scenarioId, period, results);

    // Emit event for downstream listeners (WebSocket, cache invalidation)
    this.eventEmitter.emit('calc.completed', { scenarioId, period, changedIndicatorId, results });

    return results;
  }

  // ── Persist to scenario_values ──────────────────────────────────────────────

  private async persistScenarioValues(
    scenarioId: string,
    period: Date,
    results: ComputedResult[],
  ) {
    const upserts = results.map((r) =>
      this.prisma.scenarioValue.upsert({
        where: { scenarioId_indicatorId_period: { scenarioId, indicatorId: r.indicatorId, period } },
        create: {
          scenarioId,
          indicatorId: r.indicatorId,
          period,
          value: r.value.toFixed(6),
          delta: r.delta.toFixed(6),
          deltaPercent: r.deltaPercent.toFixed(4),
          status: r.status,
        },
        update: {
          value: r.value.toFixed(6),
          delta: r.delta.toFixed(6),
          deltaPercent: r.deltaPercent.toFixed(4),
          status: r.status,
          computedAt: new Date(),
        },
      }),
    );

    await this.prisma.$transaction(upserts);
  }

  // ── Recalculate CALCULATED indicators from realized values (no scenario) ─────
  // Called after formula create/update or after setRealized, so cards always
  // display an up-to-date computed value in the "REAL." column.

  async recalculateRealized(): Promise<void> {
    const graph = await this.buildGraph();
    // topologicalSort() returns roots-first; for evaluation we need
    // dependencies (children) computed BEFORE dependents, so iterate reversed.
    const evalOrder = [...this.topologicalSort(graph)].reverse();

    // Collect realized values grouped by period
    const allRealized = await this.prisma.realizedValue.findMany({
      select: { indicatorId: true, period: true, value: true },
      orderBy: { period: 'asc' },
    });

    // Group input realized values by period (Date object keyed by ISO string)
    const periodMap = new Map<string, { period: Date; values: Map<string, Decimal> }>();
    const stored = new Map<string, Decimal>(); // `${indId}|${periodISO}` -> stored value
    for (const rv of allRealized) {
      const key = rv.period.toISOString();
      if (!periodMap.has(key)) periodMap.set(key, { period: rv.period, values: new Map() });
      const dec = new Decimal(rv.value.toString());
      periodMap.get(key)!.values.set(rv.indicatorId, dec);
      stored.set(`${rv.indicatorId}|${key}`, dec);
    }

    const upserts: ReturnType<typeof this.prisma.realizedValue.upsert>[] = [];

    for (const { period, values } of periodMap.values()) {
      const periodKey = period.toISOString();
      for (const id of evalOrder) {
        const node = graph.get(id);
        if (!node || node.type !== 'CALCULATED' || !node.formulaExpression || !node.formulaVariables) continue;
        const computed = this.evaluateFormula(node.formulaExpression, node.formulaVariables, values);
        if (computed === null) continue;
        values.set(id, computed); // make available for downstream CALCULATED nodes
        // skip the write when the stored value already matches (keeps reads cheap).
        // Compare at storage precision (6 casas) to evitar regravar dízimas.
        const computedStr = computed.toFixed(6);
        const prev = stored.get(`${id}|${periodKey}`);
        if (prev && prev.toFixed(6) === computedStr) continue;
        upserts.push(
          this.prisma.realizedValue.upsert({
            where: { indicatorId_period: { indicatorId: id, period } },
            create: { indicatorId: id, period, value: computedStr },
            update: { value: computedStr },
          }),
        );
      }
    }

    if (upserts.length) await this.prisma.$transaction(upserts);
    if (upserts.length) this.logger.log(`recalculateRealized: upserted ${upserts.length} computed realized values`);
  }

  // ── Recalculate baseline ESTIMATE (forecast w/ scenarioId=null) ──────────────
  // A estimativa de um indicador calculado é derivada da fórmula aplicada às
  // estimativas dos insumos (regra "estimate ?? realized" por insumo). Roda
  // somente nos períodos que já têm alguma estimativa lançada.
  // Obs.: usa findFirst/update-by-id em vez de upsert porque o índice único
  // [indicatorId, scenarioId, period] trata NULL como distinto no Postgres.

  async recalculateForecast(userId: string): Promise<void> {
    const graph = await this.buildGraph();
    const evalOrder = [...this.topologicalSort(graph)].reverse();

    const [allRealized, baselineForecasts] = await Promise.all([
      this.prisma.realizedValue.findMany({ select: { indicatorId: true, period: true, value: true } }),
      this.prisma.forecastValue.findMany({
        where: { scenarioId: null },
        select: { id: true, indicatorId: true, period: true, value: true },
      }),
    ]);

    const realizedByPeriod = new Map<string, Map<string, Decimal>>();
    for (const rv of allRealized) {
      const k = rv.period.toISOString();
      if (!realizedByPeriod.has(k)) realizedByPeriod.set(k, new Map());
      realizedByPeriod.get(k)!.set(rv.indicatorId, new Decimal(rv.value.toString()));
    }

    const periods = new Map<string, Date>();
    const forecastByPeriod = new Map<string, Map<string, Decimal>>();
    const existingFc = new Map<string, { id: string; value: Decimal }>();
    for (const fv of baselineForecasts) {
      const k = fv.period.toISOString();
      periods.set(k, fv.period);
      if (!forecastByPeriod.has(k)) forecastByPeriod.set(k, new Map());
      const dec = new Decimal(fv.value.toString());
      forecastByPeriod.get(k)!.set(fv.indicatorId, dec);
      existingFc.set(`${fv.indicatorId}|${k}`, { id: fv.id, value: dec });
    }

    const ops: any[] = [];
    for (const [k, period] of periods.entries()) {
      // values = realizado, sobrescrito pela estimativa lançada (estimate ?? realized)
      const values = new Map<string, Decimal>();
      for (const [id, v] of realizedByPeriod.get(k) ?? new Map()) values.set(id, v);
      for (const [id, v] of forecastByPeriod.get(k) ?? new Map()) values.set(id, v);

      for (const id of evalOrder) {
        const node = graph.get(id);
        if (!node || node.type !== 'CALCULATED' || !node.formulaExpression || !node.formulaVariables) continue;
        const computed = this.evaluateFormula(node.formulaExpression, node.formulaVariables, values);
        if (computed === null) continue;
        values.set(id, computed);
        const computedStr = computed.toFixed(6);
        const existing = existingFc.get(`${id}|${k}`);
        if (existing) {
          if (existing.value.toFixed(6) === computedStr) continue;
          ops.push(this.prisma.forecastValue.update({ where: { id: existing.id }, data: { value: computedStr } }));
        } else {
          ops.push(this.prisma.forecastValue.create({
            data: { indicatorId: id, scenarioId: null, period, value: computedStr, isManual: false, userId },
          }));
        }
      }
    }

    if (ops.length) await this.prisma.$transaction(ops);
    if (ops.length) this.logger.log(`recalculateForecast: wrote ${ops.length} computed estimate values`);
  }

  async getImpactChain(
    indicatorId: string,
    graph: Map<string, IndicatorNode>,
  ): Promise<string[]> {
    const affected = new Set<string>();

    const propagate = (id: string) => {
      const node = graph.get(id);
      if (!node) return;
      for (const parentId of node.parents) {
        if (!affected.has(parentId)) {
          affected.add(parentId);
          propagate(parentId);
        }
      }
    };

    propagate(indicatorId);
    return [...affected];
  }
}
