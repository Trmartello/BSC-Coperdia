import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CalcEngineService, IndicatorNode } from '../calc-engine/calc-engine.service';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { UpdateForecastDto } from './dto/update-forecast.dto';
import * as ExcelJS from 'exceljs';

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
        realizedValues: { orderBy: { period: 'desc' }, take: 27 },
        forecastValues: { where: { scenarioId: null }, orderBy: { period: 'desc' }, take: 27 },
        goals: { orderBy: { period: 'desc' }, take: 27 },
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
    // recalcula a META dos indicadores calculados que dependem deste insumo
    await this.calcEngine.recalculateGoals();
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

  async getAvailablePeriods(): Promise<string[]> {
    const rows = await this.prisma.realizedValue.findMany({
      select: { period: true },
      distinct: ['period'],
      orderBy: { period: 'asc' },
    });
    return rows.map((r) => r.period.toISOString().slice(0, 10));
  }

  // ── Carga de dados (planilha Excel) ──────────────────────────────────────────

  async generateImportTemplate(): Promise<Buffer> {
    const indicators = await this.prisma.indicator.findMany({
      where: { active: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BSC Copérdia';
    wb.created = new Date();

    const PURPLE = 'FF6B3FA0';
    const lockFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D0F17' } };
    const lockFont: Partial<ExcelJS.Font> = { color: { argb: 'FF888888' } };

    // ── Aba única: Lançamento ────────────────────────────────────────────────
    const ws = wb.addWorksheet('Lançamento', { properties: { tabColor: { argb: PURPLE } } });

    ws.addRow(['Preencha as colunas Realizado, Meta e/ou Estimativa. Deixe em branco o que não deseja carregar. Se Estimativa vazia, será preenchida automaticamente com o valor do Realizado.'])
      .font = { italic: true, color: { argb: 'FF888888' } };
    ws.addRow([]);

    const hdr = ws.addRow(['Código', 'Nome do Indicador', 'Período (AAAA-MM)', 'Realizado', 'Meta', 'Estimativa']);
    const colColors = ['', '', '', 'FF1E40AF', 'FF166534', 'FF92400E'];
    hdr.eachCell((cell, col) => {
      const color = colColors[col - 1] || PURPLE;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF444444' } } };
    });

    ws.columns = [
      { key: 'cod',        width: 14 },
      { key: 'nome',       width: 44 },
      { key: 'periodo',    width: 20 },
      { key: 'realizado',  width: 16 },
      { key: 'meta',       width: 16 },
      { key: 'estimativa', width: 16 },
    ];

    for (const ind of indicators) {
      const isCalc = ind.type === 'CALCULATED';
      const row = ws.addRow([ind.code, ind.name, period, '', '', '']);
      row.getCell(1).fill = lockFill; row.getCell(1).font = lockFont;
      row.getCell(2).fill = lockFill; row.getCell(2).font = lockFont;
      row.getCell(3).alignment = { horizontal: 'center' };
      if (isCalc) {
        row.getCell(4).fill = lockFill;
        row.getCell(4).font = { color: { argb: 'FF555555' }, italic: true };
        row.getCell(4).value = '(calculado)';
      } else {
        row.getCell(4).numFmt = '#,##0.00';
      }
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '#,##0.00';
    }

    ws.getRow(3).height = 22;
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

    // ── Instruções ───────────────────────────────────────────────────────────
    const info = wb.addWorksheet('ℹ️ Instruções');
    info.columns = [{ width: 80 }];
    const instrucoes = [
      ['BSC Copérdia — Planilha Modelo de Carga de Dados'],
      [''],
      ['COMO USAR:'],
      ['1. Na aba "Lançamento", informe o Período desejado (formato AAAA-MM, ex.: 2026-04).'],
      ['2. Preencha Realizado, Meta e/ou Estimativa para cada indicador.'],
      ['3. Campos em branco são ignorados. Se Estimativa estiver vazia, o sistema usa o valor do Realizado.'],
      ['4. Salve e faça upload pelo botão "Importar Planilha" no sistema.'],
      [''],
      ['REGRAS:'],
      ['• Não altere o Código nem o Nome dos indicadores.'],
      ['• Formato do período: AAAA-MM (ex.: 2026-01).'],
      ['• Linhas marcadas como "(calculado)" no Realizado são ignoradas — o sistema recalcula automaticamente.'],
      ['• Estimativa vazia → sistema preenche com o valor do Realizado (quando informado).'],
    ];
    for (const l of instrucoes) {
      const row = info.addRow(l);
      const txt = l[0]?.toString() ?? '';
      if (txt.startsWith('BSC')) row.font = { bold: true, size: 14, color: { argb: PURPLE } };
      else if (txt.match(/^(COMO USAR|REGRAS):/)) row.font = { bold: true, size: 12 };
    }

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  private parseImportCsv(text: string): { codigo: string; periodo: string; valor: string }[] {
    const clean = text.replace(/^﻿/, '');
    const lines = clean.split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
    const col = {
      codigo: header.findIndex((h) => h.startsWith('cod')),
      periodo: header.findIndex((h) => h.startsWith('per')),
      valor: header.findIndex((h) => h.startsWith('val')),
    };
    if (col.codigo < 0 || col.periodo < 0 || col.valor < 0) {
      throw new BadRequestException('Formato inválido. Baixe e utilize a planilha modelo (colunas: codigo, periodo, valor).');
    }
    const split = (line: string) => line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const rows: { codigo: string; periodo: string; valor: string }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const c = split(lines[i]);
      rows.push({ codigo: c[col.codigo] ?? '', periodo: c[col.periodo] ?? '', valor: c[col.valor] ?? '' });
    }
    return rows;
  }

  private normalizePeriod(p: string): Date | null {
    const t = p.trim();
    const iso = /^\d{4}-\d{2}$/.test(t) ? `${t}-01` : t;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  async importRealizedValues(text: string, userId: string) {
    const rows = this.parseImportCsv(text);
    const indicators = await this.prisma.indicator.findMany({ include: { formula: true } });
    const byCode = new Map(indicators.map((i) => [i.code.toUpperCase(), i]));
    const byId = new Map(indicators.map((i) => [i.id, i]));

    const skipped: { codigo: string; motivo: string }[] = [];
    const importedPeriods = new Set<string>(); // ISO
    let importedCount = 0;
    const ops: any[] = [];

    for (const row of rows) {
      const code = row.codigo.trim().toUpperCase();
      if (!code) continue;
      if (row.valor.trim() === '') { skipped.push({ codigo: code, motivo: 'valor em branco' }); continue; }
      const ind = byCode.get(code);
      if (!ind) { skipped.push({ codigo: code, motivo: 'código não encontrado' }); continue; }
      if (ind.type === 'CALCULATED' || ind.formula) {
        skipped.push({ codigo: code, motivo: 'ignorado — calculado por fórmula' });
        continue;
      }
      const period = this.normalizePeriod(row.periodo);
      if (!period) { skipped.push({ codigo: code, motivo: `período inválido (${row.periodo})` }); continue; }
      const value = parseFloat(row.valor.replace(/\s/g, '').replace(',', '.'));
      if (Number.isNaN(value)) { skipped.push({ codigo: code, motivo: `valor inválido (${row.valor})` }); continue; }

      importedCount++;
      importedPeriods.add(period.toISOString());
      ops.push(
        this.prisma.realizedValue.upsert({
          where: { indicatorId_period: { indicatorId: ind.id, period } },
          create: { indicatorId: ind.id, period, value },
          update: { value },
        }),
      );
    }

    if (ops.length) await this.prisma.$transaction(ops);
    // Recalcula indicadores calculados a partir dos novos insumos
    if (ops.length) await this.calcEngine.recalculateRealized();

    // ── Relatório de inconsistências ──
    // Para cada período importado, verifica insumos (variáveis das fórmulas) que
    // são de ENTRADA e seguem sem valor → o indicador calculado fica comprometido.
    const inconsistencies: {
      calculado: string; calculadoNome: string; faltando: string; faltandoNome: string; periodo: string;
    }[] = [];

    for (const isoPeriod of importedPeriods) {
      const period = new Date(isoPeriod);
      const realized = await this.prisma.realizedValue.findMany({ where: { period }, select: { indicatorId: true } });
      const haveValue = new Set(realized.map((r) => r.indicatorId));
      const periodLabel = isoPeriod.slice(0, 10);

      for (const ind of indicators) {
        const variables = ind.formula?.variables as Record<string, string> | undefined;
        if (!variables) continue;
        for (const depId of Object.values(variables)) {
          const dep = byId.get(depId);
          if (!dep) continue;
          if (dep.type === 'INPUT' && !haveValue.has(depId)) {
            inconsistencies.push({
              calculado: ind.code, calculadoNome: ind.name,
              faltando: dep.code, faltandoNome: dep.name,
              periodo: periodLabel,
            });
          }
        }
      }
    }

    await this.audit.log({
      userId, action: 'CREATE', entity: 'RealizedValue', entityId: 'bulk-import',
      after: { importedCount, skipped: skipped.length, inconsistencies: inconsistencies.length },
    });

    return {
      importedCount,
      periods: [...importedPeriods].map((p) => p.slice(0, 10)).sort(),
      skipped,
      inconsistencies,
    };
  }

  async importSpreadsheet(buffer: Buffer, userId: string) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const indicators = await this.prisma.indicator.findMany({ include: { formula: true } });
    const byCode = new Map(indicators.map((i) => [i.code.toUpperCase(), i]));

    const realizedOps: any[] = [];
    const goalOps: any[] = [];
    const estimateItems: { indicatorId: string; period: Date; value: number }[] = [];
    const importedPeriods = new Set<string>();
    const skipped: { aba: string; codigo: string; motivo: string }[] = [];
    let realizedCount = 0, goalsCount = 0, estimatesCount = 0;

    const parseValue = (v: any): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
      return Number.isNaN(n) ? null : n;
    };

    const parsePeriod = (v: any): Date | null => {
      if (!v) return null;
      return this.normalizePeriod(String(v).trim());
    };

    const processSheet = (sheetName: string, type: 'realized' | 'goal' | 'estimate', skipCalculated = false) => {
      const ws = wb.getWorksheet(sheetName);
      if (!ws) return;
      ws.eachRow((row, rowNum) => {
        if (rowNum <= 3) return; // skip instruction + header rows
        const code = String(row.getCell(1).value ?? '').trim().toUpperCase();
        if (!code) return;
        const periodRaw = row.getCell(3).value;
        const valorRaw = row.getCell(4).value;
        const value = parseValue(valorRaw);
        if (value === null) { skipped.push({ aba: sheetName, codigo: code, motivo: 'valor em branco ou inválido' }); return; }
        const period = parsePeriod(periodRaw);
        if (!period) { skipped.push({ aba: sheetName, codigo: code, motivo: `período inválido (${periodRaw})` }); return; }
        const ind = byCode.get(code);
        if (!ind) { skipped.push({ aba: sheetName, codigo: code, motivo: 'código não encontrado' }); return; }
        if (skipCalculated && (ind.type === 'CALCULATED' || ind.formula)) {
          skipped.push({ aba: sheetName, codigo: code, motivo: 'ignorado — calculado por fórmula' }); return;
        }
        importedPeriods.add(period.toISOString());
        if (type === 'realized') {
          realizedCount++;
          realizedOps.push(this.prisma.realizedValue.upsert({
            where: { indicatorId_period: { indicatorId: ind.id, period } },
            create: { indicatorId: ind.id, period, value },
            update: { value },
          }));
        } else if (type === 'goal') {
          goalsCount++;
          goalOps.push(this.prisma.goal.upsert({
            where: { indicatorId_period: { indicatorId: ind.id, period } },
            create: { indicatorId: ind.id, period, value },
            update: { value },
          }));
        } else {
          estimatesCount++;
          estimateItems.push({ indicatorId: ind.id, period, value });
        }
      });
    };

    const unifiedWs = wb.getWorksheet('Lançamento');
    if (unifiedWs) {
      unifiedWs.eachRow((row, rowNum) => {
        if (rowNum <= 3) return;
        const code = String(row.getCell(1).value ?? '').trim().toUpperCase();
        if (!code) return;
        const period = parsePeriod(row.getCell(3).value);
        if (!period) { skipped.push({ aba: 'Lançamento', codigo: code, motivo: `período inválido (${row.getCell(3).value})` }); return; }
        const ind = byCode.get(code);
        if (!ind) { skipped.push({ aba: 'Lançamento', codigo: code, motivo: 'código não encontrado' }); return; }
        importedPeriods.add(period.toISOString());

        const isCalculated = ind.type === 'CALCULATED' || !!ind.formula;
        const vReal = parseValue(row.getCell(4).value);
        if (vReal !== null) {
          if (isCalculated) {
            skipped.push({ aba: 'Lançamento', codigo: code, motivo: 'Realizado ignorado — calculado por fórmula' });
          } else {
            realizedCount++;
            realizedOps.push(this.prisma.realizedValue.upsert({
              where: { indicatorId_period: { indicatorId: ind.id, period } },
              create: { indicatorId: ind.id, period, value: vReal },
              update: { value: vReal },
            }));
          }
        }

        const vMeta = parseValue(row.getCell(5).value);
        if (vMeta !== null) {
          goalsCount++;
          goalOps.push(this.prisma.goal.upsert({
            where: { indicatorId_period: { indicatorId: ind.id, period } },
            create: { indicatorId: ind.id, period, value: vMeta },
            update: { value: vMeta },
          }));
        }

        const vEst = parseValue(row.getCell(6).value);
        const estToSave = vEst !== null ? vEst : (!isCalculated && vReal !== null ? vReal : null);
        if (estToSave !== null) {
          estimatesCount++;
          estimateItems.push({ indicatorId: ind.id, period, value: estToSave });
        }
      });
    } else {
      processSheet('Realizados', 'realized', true);
      processSheet('Metas', 'goal', false);
      processSheet('Estimativas', 'estimate', false);
    }

    if (realizedOps.length) await this.prisma.$transaction(realizedOps);
    if (goalOps.length) await this.prisma.$transaction(goalOps);
    for (const { indicatorId, period, value } of estimateItems) {
      const existing = await this.prisma.forecastValue.findFirst({ where: { indicatorId, scenarioId: null, period } });
      if (existing) {
        await this.prisma.forecastValue.update({ where: { id: existing.id }, data: { value, isManual: true } });
      } else {
        await this.prisma.forecastValue.create({ data: { indicatorId, scenarioId: null, period, value, isManual: true, userId } });
      }
    }
    if (realizedCount > 0) await this.calcEngine.recalculateRealized();

    await this.audit.log({
      userId, action: 'CREATE', entity: 'RealizedValue', entityId: 'bulk-import-xlsx',
      after: { realizedCount, goalsCount, estimatesCount, skipped: skipped.length },
    });

    return {
      realizedCount,
      goalsCount,
      estimatesCount,
      total: realizedCount + goalsCount + estimatesCount,
      periods: [...importedPeriods].map((p) => p.slice(0, 10)).sort(),
      skipped,
    };
  }
}
