import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CalcEngineService } from '../calc-engine/calc-engine.service';
import * as ExcelJS from 'exceljs';

// Importa o balancete (planilha larga: N1/N2/N3 + Conta Contábil + Cód. Reduzido
// + colunas mensais). Cria/atualiza SÓ os indicadores de nível (N1/N2/N3):
//  • N1 e N2 → valor lido das linhas "Totais" da própria planilha;
//  • N3 → soma das contas-folha (a planilha não traz linha "Totais" de N3).
// Idempotente: casa por `accountCode` (código hierárquico) e faz upsert dos
// valores por [indicador, mês], construindo um histórico incremental.

const MONTHS: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

// Abreviações padrão de indicadores financeiros (normalizadas: sem acento/código).
const ABBR_DICT: Record<string, string> = {
  'ATIVO TOTAL': 'AT', 'ATIVO CIRCULANTE': 'AC', 'ATIVO NAO CIRCULANTE': 'ANC',
  'PASSIVO': 'PAS', 'PASSIVO TOTAL': 'PT', 'PASSIVO CIRCULANTE': 'PC',
  'PASSIVO NAO CIRCULANTE': 'PNC', 'PATRIMONIO LIQUIDO': 'PL',
  'DISPONIBILIDADES': 'DISP', 'ESTOQUES': 'EST', 'CONTAS A RECEBER': 'CR',
  'CLIENTES': 'CLI', 'FORNECEDORES': 'FORN', 'CONTAS DE RESULTADO': 'CRES',
  'CUSTOS DE PRODUCAO': 'CPROD', 'RESULTADO RATEIO GERAL': 'RRG',
  'RECEITA': 'REC', 'RECEITAS': 'REC', 'RECEITA LIQUIDA': 'RL',
  'DESPESAS': 'DESP', 'CUSTOS': 'CUS',
};

const STOPWORDS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'A', 'O', 'AS', 'OS', 'EM', 'COM', 'PARA', 'POR']);

interface LevelDef { code: string; label: string; level: number; parentCode: string | null; }

// Catálogo de índices financeiros padrão. Cada índice referencia as contas do
// balancete pelo `accountCode` (estável), não pela abreviação (que pode variar).
// `expr(c)` monta a expressão usando c(accountCode) = abreviação atual da conta.
type RatioUnit = 'INDEX' | 'CURRENCY' | 'PERCENTAGE';
interface RatioDef {
  key: string; name: string; unit: RatioUnit;
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  needs: string[]; expr: (c: (acc: string) => string) => string;
}
// abs() em cada conta: o balancete guarda Passivo/PL como NEGATIVO (Ativo+Passivo≈0).
// Índices financeiros usam magnitudes, então trabalhamos com valores absolutos.
const FINANCIAL_RATIOS: RatioDef[] = [
  { key: 'LC', name: 'Liquidez Corrente', unit: 'INDEX', direction: 'HIGHER_IS_BETTER',
    needs: ['1.01', '2.01'], expr: (a) => `${a('1.01')} / ${a('2.01')}` },
  { key: 'LI', name: 'Liquidez Imediata', unit: 'INDEX', direction: 'HIGHER_IS_BETTER',
    needs: ['1.01.01', '2.01'], expr: (a) => `${a('1.01.01')} / ${a('2.01')}` },
  { key: 'LG', name: 'Liquidez Geral', unit: 'INDEX', direction: 'HIGHER_IS_BETTER',
    needs: ['1.01', '1.03.01', '2.01', '2.03'], expr: (a) => `(${a('1.01')} + ${a('1.03.01')}) / (${a('2.01')} + ${a('2.03')})` },
  { key: 'CCL', name: 'Capital Circulante Líquido', unit: 'CURRENCY', direction: 'HIGHER_IS_BETTER',
    needs: ['1.01', '2.01'], expr: (a) => `${a('1.01')} - ${a('2.01')}` },
  { key: 'EG', name: 'Endividamento Geral (Cap. Terceiros / Ativo)', unit: 'PERCENTAGE', direction: 'LOWER_IS_BETTER',
    needs: ['2.01', '2.03', '1'], expr: (a) => `(${a('2.01')} + ${a('2.03')}) / ${a('1')} * 100` },
  { key: 'CEND', name: 'Composição do Endividamento', unit: 'PERCENTAGE', direction: 'LOWER_IS_BETTER',
    needs: ['2.01', '2.03'], expr: (a) => `${a('2.01')} / (${a('2.01')} + ${a('2.03')}) * 100` },
  { key: 'GE', name: 'Grau de Endividamento (Cap. Terceiros / PL)', unit: 'PERCENTAGE', direction: 'LOWER_IS_BETTER',
    needs: ['2.01', '2.03', '2.07'], expr: (a) => `(${a('2.01')} + ${a('2.03')}) / ${a('2.07')} * 100` },
  { key: 'IPL', name: 'Imobilização do Patrimônio Líquido', unit: 'PERCENTAGE', direction: 'LOWER_IS_BETTER',
    needs: ['1.03.13', '2.07'], expr: (a) => `${a('1.03.13')} / ${a('2.07')} * 100` },
];

@Injectable()
export class BalanceteImportService {
  private readonly logger = new Logger(BalanceteImportService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private calcEngine: CalcEngineService,
  ) {}

  // ── helpers de parsing ────────────────────────────────────────────────────
  private stripAccents(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  private cellVal(cell: ExcelJS.Cell): any {
    const v: any = cell.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      if ('result' in v) return v.result;
      if ('text' in v) return v.text;
      return String(v);
    }
    return v;
  }

  private num(v: any): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') {
      v = 'result' in v ? v.result : ('text' in v ? v.text : null);
    }
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim();
    if (s === '' || s === '-') return null;
    // aceita "1.234.567,89" (pt-BR) e "1234567.89"
    const cleaned = /,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\s/g, '');
    const n = parseFloat(cleaned);
    return Number.isNaN(n) ? null : n;
  }

  private parsePtBrMonth(h: string): Date | null {
    const m = this.stripAccents(String(h)).toLowerCase().match(/([a-z]{3,})\.?\s*\/?\s*(\d{4})/);
    if (!m) return null;
    const mi = MONTHS[m[1].slice(0, 3)];
    if (mi === undefined) return null;
    return new Date(Date.UTC(parseInt(m[2], 10), mi, 1));
  }

  private codeOf(label: string): string | null {
    const m = label.trim().match(/^\s*(\d+(?:\.\d+)*)/);
    return m ? m[1] : null;
  }

  private labelText(label: string): string {
    return label.replace(/^\s*\d+(?:\.\d+)*\s+/, '').trim();
  }

  private genAbbrev(label: string, taken: Set<string>): string {
    const text = this.stripAccents(this.labelText(label)).toUpperCase();
    let base = ABBR_DICT[text];
    if (!base) {
      const words = text.split(/[^A-Z0-9]+/).filter((w) => w && !STOPWORDS.has(w));
      if (words.length >= 2) base = words.map((w) => w[0]).join('').slice(0, 5);
      else if (words.length === 1) base = words[0].slice(0, 4);
      else base = 'IND';
    }
    base = base.replace(/[^A-Z0-9]/g, '') || 'IND';
    if (/^[0-9]/.test(base)) base = '_' + base;
    let cand = base;
    let n = 2;
    while (taken.has(cand.toUpperCase())) cand = `${base}${n++}`;
    taken.add(cand.toUpperCase());
    return cand;
  }

  // ── import principal ──────────────────────────────────────────────────────
  async importBalancete(buffer: Buffer, userId: string) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('Planilha vazia.');

    // Colunas de mês: a partir da coluna F (6), cabeçalho tipo "jan 2025".
    const header = ws.getRow(1);
    const monthCols: { col: number; period: Date; iso: string }[] = [];
    for (let c = 6; c <= ws.columnCount; c++) {
      const p = this.parsePtBrMonth(String(this.cellVal(header.getCell(c))).trim());
      if (p) monthCols.push({ col: c, period: p, iso: p.toISOString() });
    }
    if (monthCols.length === 0) throw new Error('Nenhuma coluna de mês reconhecida (ex.: "jan 2025").');

    const levelPat = /^\s*\d+(?:\.\d+)*\s+\S/;
    const defs = new Map<string, LevelDef>();
    const totalVals = new Map<string, Map<string, number>>(); // linhas "Totais" (N1/N2)
    const leafSums = new Map<string, Map<string, number>>();  // soma de folhas por ancestral

    const addDef = (label: string): string | null => {
      const code = this.codeOf(label);
      if (!code) return null;
      if (!defs.has(code)) {
        const level = code.split('.').length;
        const parentCode = level > 1 ? code.split('.').slice(0, -1).join('.') : null;
        defs.set(code, { code, label: label.trim(), level, parentCode });
      }
      return code;
    };
    const addVal = (map: Map<string, Map<string, number>>, code: string, iso: string, v: number | null) => {
      if (v === null) return;
      if (!map.has(code)) map.set(code, new Map());
      const m = map.get(code)!;
      m.set(iso, (m.get(iso) ?? 0) + v);
    };

    ws.eachRow((row, r) => {
      if (r === 1) return;
      const A = String(this.cellVal(row.getCell(1))).trim();
      const B = String(this.cellVal(row.getCell(2))).trim();
      const C = String(this.cellVal(row.getCell(3))).trim();
      const D = String(this.cellVal(row.getCell(4))).trim();

      if (B === 'Totais' && levelPat.test(A)) {
        const code = addDef(A);
        if (code) for (const mc of monthCols) addVal(totalVals, code, mc.iso, this.num(row.getCell(mc.col).value));
        return;
      }
      if (C === 'Totais' && levelPat.test(B)) {
        addDef(A);
        const code = addDef(B);
        if (code) for (const mc of monthCols) addVal(totalVals, code, mc.iso, this.num(row.getCell(mc.col).value));
        return;
      }
      if (levelPat.test(A) && levelPat.test(B) && levelPat.test(C) && D && D !== 'Totais') {
        const c1 = addDef(A), c2 = addDef(B), c3 = addDef(C);
        for (const mc of monthCols) {
          const v = this.num(row.getCell(mc.col).value);
          if (v === null) continue;
          if (c1) addVal(leafSums, c1, mc.iso, v);
          if (c2) addVal(leafSums, c2, mc.iso, v);
          if (c3) addVal(leafSums, c3, mc.iso, v);
        }
      }
    });

    // valor final por código/mês: N1/N2 usam a linha Totais (fallback soma); N3 soma folhas.
    const valueFor = (code: string, iso: string): number | null => {
      const def = defs.get(code)!;
      if (def.level <= 2) {
        const tv = totalVals.get(code);
        if (tv && tv.has(iso)) return tv.get(iso)!;
      }
      const lv = leafSums.get(code);
      return lv && lv.has(iso) ? lv.get(iso)! : null;
    };

    const rootText = (code: string): string => {
      const top = code.split('.')[0];
      const d = defs.get(top);
      return this.labelText(d ? d.label : defs.get(code)!.label);
    };

    // ── grava indicadores (nível) ────────────────────────────────────────────
    const existing = await this.prisma.indicator.findMany();
    const byAccount = new Map(existing.filter((e) => e.accountCode).map((e) => [e.accountCode!, e]));
    const taken = new Set(existing.map((e) => e.code.toUpperCase()));

    const sorted = [...defs.values()].sort((a, b) => a.level - b.level || a.code.localeCompare(b.code, undefined, { numeric: true }));
    const idByCode = new Map<string, string>();
    let created = 0, updated = 0;

    for (const def of sorted) {
      const category = rootText(def.code);
      const top = def.code.split('.')[0];
      const accumulation = (top === '1' || top === '2') ? 'LAST' : 'SUM'; // balanço=saldo; resultado=fluxo
      const found = byAccount.get(def.code);
      if (found) {
        const upd = await this.prisma.indicator.update({
          where: { id: found.id },
          data: { name: def.label, category, source: 'BALANCETE' },
        });
        idByCode.set(def.code, upd.id);
        updated++;
      } else {
        const code = this.genAbbrev(def.label, taken);
        const ind = await this.prisma.indicator.create({
          data: {
            code, name: def.label, category, type: 'INPUT', unit: 'CURRENCY',
            periodicity: 'MONTHLY', direction: 'HIGHER_IS_BETTER',
            accumulation: accumulation as any, source: 'BALANCETE', accountCode: def.code,
          },
        });
        idByCode.set(def.code, ind.id);
        created++;
      }
    }

    // ── relações pai→filho (hierarquia p/ o mapa causal) ──────────────────────
    let relations = 0;
    for (const def of sorted) {
      if (!def.parentCode) continue;
      const parentId = idByCode.get(def.parentCode);
      const childId = idByCode.get(def.code);
      if (!parentId || !childId) continue;
      await this.prisma.indicatorRelation.upsert({
        where: { parentId_childId: { parentId, childId } },
        create: { parentId, childId },
        update: {},
      });
      relations++;
    }

    // ── valores mensais (upsert idempotente) ──────────────────────────────────
    const ops: any[] = [];
    const periods = new Set<string>();
    let values = 0;
    for (const def of sorted) {
      const id = idByCode.get(def.code)!;
      for (const mc of monthCols) {
        const v = valueFor(def.code, mc.iso);
        if (v === null) continue;
        const rounded = Math.round(v * 100) / 100;
        ops.push(this.prisma.realizedValue.upsert({
          where: { indicatorId_period: { indicatorId: id, period: mc.period } },
          create: { indicatorId: id, period: mc.period, value: rounded },
          update: { value: rounded },
        }));
        values++;
        periods.add(mc.iso.slice(0, 10));
      }
    }
    for (let i = 0; i < ops.length; i += 200) {
      await this.prisma.$transaction(ops.slice(i, i + 200));
    }

    // ── validação: Totais da planilha (N1/N2) vs soma das folhas ──────────────
    const warnings: string[] = [];
    for (const def of sorted) {
      if (def.level > 2) continue;
      const tv = totalVals.get(def.code);
      if (!tv) continue;
      const lv = leafSums.get(def.code);
      for (const [iso, total] of tv) {
        const ls = lv?.get(iso) ?? 0;
        if (Math.abs(total - ls) > 1) {
          warnings.push(`${def.code} (${iso.slice(0, 7)}): total planilha ${total.toFixed(2)} ≠ soma folhas ${ls.toFixed(2)}`);
        }
      }
    }

    await this.calcEngine.recalculateRealized();

    await this.audit.log({
      userId, action: 'CREATE', entity: 'Indicator', entityId: 'balancete-import',
      after: { created, updated, values, relations, warningCount: warnings.length },
    });

    return {
      created,
      updated,
      levels: sorted.length,
      values,
      relations,
      periods: [...periods].sort(),
      warningCount: warnings.length,
      warnings: warnings.slice(0, 25),
    };
  }

  // ── Índices financeiros de análise (CALCULATED sobre as contas do balancete) ──
  // Idempotente: casa cada índice pelo accountCode "R.<KEY>". Só cria quando as
  // contas necessárias existem (após importar o balancete). Reexecutar atualiza.
  async generateFinancialRatios(userId: string) {
    const existing = await this.prisma.indicator.findMany();
    const byAccount = new Map(existing.filter((e) => e.accountCode).map((e) => [e.accountCode!, e]));
    const taken = new Set(existing.map((e) => e.code.toUpperCase()));
    const codeOfAcc = (acc: string) => byAccount.get(acc)!.code;
    const idOfAcc = (acc: string) => byAccount.get(acc)!.id;

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    for (const def of FINANCIAL_RATIOS) {
      const missing = def.needs.filter((a) => !byAccount.has(a));
      if (missing.length) { skipped.push(`${def.name} — faltam contas ${missing.join(', ')}`); continue; }

      const absExpr = (acc: string) => `abs(${codeOfAcc(acc)})`;
      const expression = def.expr(absExpr);
      const variables: Record<string, string> = {};
      for (const a of def.needs) variables[codeOfAcc(a)] = idOfAcc(a);

      const acctKey = `R.${def.key}`;
      let ind = byAccount.get(acctKey);
      if (ind) {
        ind = await this.prisma.indicator.update({
          where: { id: ind.id },
          data: { name: def.name, unit: def.unit as any, direction: def.direction as any, type: 'CALCULATED', category: 'Análise Financeira', source: 'RATIO' },
        });
        updated.push(def.name);
      } else {
        let code = def.key; let n = 2;
        while (taken.has(code.toUpperCase())) code = `${def.key}${n++}`;
        taken.add(code.toUpperCase());
        ind = await this.prisma.indicator.create({
          data: { code, name: def.name, category: 'Análise Financeira', type: 'CALCULATED', unit: def.unit as any, periodicity: 'MONTHLY', direction: def.direction as any, source: 'RATIO', accountCode: acctKey },
        });
        byAccount.set(acctKey, ind);
        created.push(def.name);
      }
      await this.prisma.formula.upsert({
        where: { indicatorId: ind.id },
        create: { indicatorId: ind.id, expression, variables, description: `${def.name} = ${expression}` },
        update: { expression, variables, description: `${def.name} = ${expression}` },
      });
    }

    await this.calcEngine.recalculateRealized();
    await this.audit.log({
      userId, action: 'CREATE', entity: 'Indicator', entityId: 'generate-ratios',
      after: { created: created.length, updated: updated.length, skipped: skipped.length },
    });

    return { created, updated, skipped };
  }
}
