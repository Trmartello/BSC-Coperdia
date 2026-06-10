import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { compile, evaluate } from 'mathjs';
import Decimal from 'decimal.js';

export interface IndicatorNode {
  id: string;
  code: string;
  type: 'INPUT' | 'CALCULATED';
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
      this.prisma.forecastValue.findMany({ where: { period, scenarioId: scenarioId ?? undefined } }),
    ]);

    const values = new Map<string, Decimal>();

    // base: realized
    for (const rv of realized) {
      values.set(rv.indicatorId, new Decimal(rv.value.toString()));
    }

    // override with forecast (regra: se existe previsto, usa previsto)
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

  evaluateFormula(
    expression: string,
    variables: Record<string, string>,
    values: Map<string, Decimal>,
  ): Decimal {
    const scope: Record<string, number> = {};

    for (const [varName, indicatorId] of Object.entries(variables)) {
      scope[varName] = values.get(indicatorId)?.toNumber() ?? 0;
    }

    try {
      const result = evaluate(expression, scope);
      return new Decimal(result);
    } catch (err) {
      this.logger.error(`Formula eval error: ${expression}`, err);
      return new Decimal(0);
    }
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

    const order = this.topologicalSort(graph);

    // Recalculate calculated indicators in order
    for (const id of order) {
      const node = graph.get(id)!;
      if (node.type === 'CALCULATED' && node.formulaExpression && node.formulaVariables) {
        const computed = this.evaluateFormula(
          node.formulaExpression,
          node.formulaVariables,
          values,
        );
        values.set(id, computed);
      }
    }

    // Build results with delta vs baseline
    const results: ComputedResult[] = [];
    for (const [id, value] of values.entries()) {
      const base = baselineValues.get(id) ?? new Decimal(0);
      const delta = value.minus(base);
      const deltaPercent = base.isZero() ? new Decimal(0) : delta.div(base).mul(100);

      results.push({ indicatorId: id, value, delta, deltaPercent });
    }

    // Persist computed values
    await this.persistScenarioValues(scenarioId, period, results, graph);

    // Emit event for downstream listeners (WebSocket, cache invalidation)
    this.eventEmitter.emit('calc.completed', { scenarioId, period, changedIndicatorId, results });

    return results;
  }

  // ── Persist to scenario_values ──────────────────────────────────────────────

  private async persistScenarioValues(
    scenarioId: string,
    period: Date,
    results: ComputedResult[],
    graph: Map<string, IndicatorNode>,
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
        },
        update: {
          value: r.value.toFixed(6),
          delta: r.delta.toFixed(6),
          deltaPercent: r.deltaPercent.toFixed(4),
          computedAt: new Date(),
        },
      }),
    );

    await this.prisma.$transaction(upserts);
  }

  // ── Impact chain for a single indicator change ──────────────────────────────

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
