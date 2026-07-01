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

  // Abreviação financeira (sem contador): dicionário ou iniciais das palavras.
  private abbrevOf(label: string): string {
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
    return base;
  }

  // Código do indicador de balancete = abreviação + Cód. Reduzido (código do
  // plano de contas). Único por natureza (o código do plano é único) e legível.
  // Ex.: "9.05.02 OUTROS CUSTOS DAS VENDAS" → "OCV 9.05.02".
  private balCode(label: string, accountCode: string): string {
    return `${this.abbrevOf(label)} ${accountCode}`;
  }

  // Converte um código em token válido para fórmula (mathjs). Ex.: "AC 1.01" → "AC_1_01".
  private toToken(code: string): string {
    let t = code.replace(/[^A-Za-z0-9_]/g, '_');
    if (/^[0-9]/.test(t)) t = '_' + t;
    return t || 'VAR';
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
    interface LeafDef { reducedCode: string; name: string; n3Code: string; vals: Map<string, number>; }
    const leafDefs = new Map<string, LeafDef>(); // contas-folha por Cód. Reduzido (coluna E)

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
        // Conta-folha: coluna E (Cód. Reduzido) + Conta Contábil (D). Vira indicador.
        const E = String(this.cellVal(row.getCell(5))).trim();
        let leaf: LeafDef | null = null;
        if (E && c3) {
          leaf = leafDefs.get(E) ?? null;
          if (!leaf) { leaf = { reducedCode: E, name: D, n3Code: c3, vals: new Map() }; leafDefs.set(E, leaf); }
        }
        for (const mc of monthCols) {
          const v = this.num(row.getCell(mc.col).value);
          if (v === null) continue;
          if (c1) addVal(leafSums, c1, mc.iso, v);
          if (c2) addVal(leafSums, c2, mc.iso, v);
          if (c3) addVal(leafSums, c3, mc.iso, v);
          if (leaf) leaf.vals.set(mc.iso, (leaf.vals.get(mc.iso) ?? 0) + v);
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

    const sorted = [...defs.values()].sort((a, b) => a.level - b.level || a.code.localeCompare(b.code, undefined, { numeric: true }));
    const idByCode = new Map<string, string>();
    let created = 0, updated = 0;

    // `taken` = códigos que NÃO pertencem aos indicadores deste balancete (que
    // serão reatribuídos) — evita colisão com indicadores de outra origem.
    const defCodes = new Set(sorted.map((d) => d.code));
    const taken = new Set(
      existing.filter((e) => !(e.accountCode && defCodes.has(e.accountCode))).map((e) => e.code.toUpperCase()),
    );
    const uniqueCode = (base: string): string => {
      let code = base, n = 2;
      while (taken.has(code.toUpperCase())) code = `${base}${n++}`;
      taken.add(code.toUpperCase());
      return code;
    };

    for (const def of sorted) {
      const category = rootText(def.code);
      const top = def.code.split('.')[0];
      const accumulation = (top === '1' || top === '2') ? 'LAST' : 'SUM'; // balanço=saldo; resultado=fluxo
      const code = uniqueCode(this.abbrevOf(def.label)); // níveis (A/B/C): só a abreviação
      const found = byAccount.get(def.code);
      if (found) {
        const upd = await this.prisma.indicator.update({
          where: { id: found.id },
          data: { code, name: def.label, category, source: 'BALANCETE' },
        });
        idByCode.set(def.code, upd.id);
        updated++;
      } else {
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

    // ── contas-folha (coluna E) → indicadores INPUT ───────────────────────────
    // code = iniciais do nome + Cód. Reduzido (ex.: "AES 1341"); nome = "Cód - Conta".
    const leafList = [...leafDefs.values()];
    let leavesCreated = 0;
    const newLeafData: any[] = [];
    for (const leaf of leafList) {
      const found = byAccount.get(leaf.reducedCode);
      if (found) { idByCode.set(leaf.reducedCode, found.id); continue; }
      const top = leaf.n3Code.split('.')[0];
      const accumulation = (top === '1' || top === '2') ? 'LAST' : 'SUM';
      const code = uniqueCode(this.balCode(leaf.name, leaf.reducedCode)); // folha (D): abreviação + Cód. Reduzido (E)
      newLeafData.push({
        code, name: `${leaf.reducedCode} - ${leaf.name}`, category: rootText(leaf.n3Code),
        type: 'INPUT', unit: 'CURRENCY', periodicity: 'MONTHLY', direction: 'HIGHER_IS_BETTER',
        accumulation: accumulation as any, source: 'BALANCETE', accountCode: leaf.reducedCode,
      });
    }
    for (let i = 0; i < newLeafData.length; i += 500) {
      await this.prisma.indicator.createMany({ data: newLeafData.slice(i, i + 500), skipDuplicates: true });
    }
    if (newLeafData.length) {
      const fetched = await this.prisma.indicator.findMany({
        where: { accountCode: { in: newLeafData.map((d) => d.accountCode) } },
        select: { id: true, accountCode: true },
      });
      for (const f of fetched) if (f.accountCode) idByCode.set(f.accountCode, f.id);
      leavesCreated = newLeafData.length;
    }

    // ── relações pai→filho (hierarquia): níveis + folha→N3 ─────────────────────
    const relData: { parentId: string; childId: string }[] = [];
    for (const def of sorted) {
      if (!def.parentCode) continue;
      const parentId = idByCode.get(def.parentCode);
      const childId = idByCode.get(def.code);
      if (parentId && childId) relData.push({ parentId, childId });
    }
    for (const leaf of leafList) {
      const parentId = idByCode.get(leaf.n3Code);
      const childId = idByCode.get(leaf.reducedCode);
      if (parentId && childId) relData.push({ parentId, childId });
    }
    let relations = 0;
    for (let i = 0; i < relData.length; i += 500) {
      const res = await this.prisma.indicatorRelation.createMany({ data: relData.slice(i, i + 500), skipDuplicates: true });
      relations += res.count;
    }

    // ── valores mensais (níveis + folhas) — cria os novos, atualiza os alterados ─
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const desired = new Map<string, { indicatorId: string; period: Date; value: number }>();
    for (const def of sorted) {
      const id = idByCode.get(def.code);
      if (!id) continue;
      for (const mc of monthCols) {
        const v = valueFor(def.code, mc.iso);
        if (v === null) continue;
        desired.set(`${id}|${mc.iso}`, { indicatorId: id, period: mc.period, value: round2(v) });
      }
    }
    for (const leaf of leafList) {
      const id = idByCode.get(leaf.reducedCode);
      if (!id) continue;
      for (const mc of monthCols) {
        const v = leaf.vals.get(mc.iso);
        if (v === undefined) continue;
        desired.set(`${id}|${mc.iso}`, { indicatorId: id, period: mc.period, value: round2(v) });
      }
    }
    const indIds = [...new Set([...desired.values()].map((d) => d.indicatorId))];
    const existingRV = await this.prisma.realizedValue.findMany({
      where: { indicatorId: { in: indIds }, period: { in: monthCols.map((m) => m.period) } },
      select: { id: true, indicatorId: true, period: true, value: true },
    });
    const existingMap = new Map(existingRV.map((rv) => [`${rv.indicatorId}|${rv.period.toISOString()}`, rv]));
    const toCreate: any[] = [];
    const toUpdate: { id: string; value: number }[] = [];
    const periods = new Set<string>();
    for (const [key, d] of desired) {
      periods.add(d.period.toISOString().slice(0, 10));
      const ex = existingMap.get(key);
      if (!ex) toCreate.push({ indicatorId: d.indicatorId, period: d.period, value: d.value });
      else if (Number(ex.value) !== d.value) toUpdate.push({ id: ex.id, value: d.value });
    }
    for (let i = 0; i < toCreate.length; i += 1000) {
      await this.prisma.realizedValue.createMany({ data: toCreate.slice(i, i + 1000), skipDuplicates: true });
    }
    for (const u of toUpdate) {
      await this.prisma.realizedValue.update({ where: { id: u.id }, data: { value: u.value } });
    }
    const values = desired.size;
    created += leavesCreated;

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

    // Cria NOVOS mapas causais a partir da hierarquia (um por grupo N1), sem
    // tocar nos mapas existentes (estrutura própria "Balancete").
    const builtMaps = await this.ensureBalanceteMaps(userId, sorted, idByCode);

    await this.audit.log({
      userId, action: 'CREATE', entity: 'Indicator', entityId: 'balancete-import',
      after: { created, updated, values, relations, warningCount: warnings.length, maps: builtMaps.maps.length },
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
      maps: builtMaps.maps,
    };
  }

  // Gera (idempotente) a estrutura "Balancete" com um mapa por grupo N1 (Ativo,
  // Passivo, Resultado…), contendo N1→N2→N3 com níveis para o drill-down.
  // NÃO altera estruturas/mapas já existentes (escopo próprio por nome).
  private async ensureBalanceteMaps(userId: string, sorted: LevelDef[], idByCode: Map<string, string>) {
    let structure = await this.prisma.mapStructure.findFirst({ where: { name: 'Balancete' } });
    if (!structure) {
      structure = await this.prisma.mapStructure.create({
        data: { name: 'Balancete', description: 'Estrutura patrimonial e de resultado (importada do balancete)', category: 'Financeiro', createdBy: userId },
      });
    }
    let category = await this.prisma.mapCategory.findFirst({ where: { name: 'Financeiro' } })
      ?? await this.prisma.mapCategory.findFirst();
    if (!category) category = await this.prisma.mapCategory.create({ data: { name: 'Financeiro', userId } });

    const childrenOf = (code: string) => sorted.filter((d) => d.parentCode === code);
    const n1s = sorted.filter((d) => d.level === 1);
    const maps: { name: string; entries: number }[] = [];

    for (const n1 of n1s) {
      const n2s = childrenOf(n1.code);
      if (n2s.length === 0) continue; // pula grupos sem desdobramento

      const nodes: any[] = [];
      const entries: { id: string; x: number; y: number }[] = [];
      const place = (code: string, level: number, yIdx: number) => {
        const id = idByCode.get(code);
        if (!id) return;
        const position = { x: (level - 1) * 380, y: yIdx * 160 };
        nodes.push({ id, position, data: { level } });
        entries.push({ id, x: position.x, y: position.y });
      };

      let y = 0, sumY = 0, cnt = 0;
      for (const n2 of n2s) {
        const n3s = childrenOf(n2.code);
        let n2y: number;
        if (n3s.length) {
          const start = y;
          for (const n3 of n3s) { place(n3.code, 3, y); y++; }
          n2y = (start + (y - 1)) / 2;
        } else {
          n2y = y; y++;
        }
        place(n2.code, 2, n2y);
        sumY += n2y; cnt++;
      }
      place(n1.code, 1, cnt ? sumY / cnt : 0);

      const mapName = this.labelText(n1.label);
      let map = await this.prisma.indicatorMap.findFirst({ where: { name: mapName, structureId: structure.id } });
      if (!map) {
        map = await this.prisma.indicatorMap.create({
          data: { name: mapName, description: `Hierarquia ${n1.label}`, categoryId: category.id, structureId: structure.id, userId },
        });
      }
      for (const e of entries) {
        await this.prisma.indicatorMapEntry.upsert({
          where: { mapId_indicatorId: { mapId: map.id, indicatorId: e.id } },
          create: { mapId: map.id, indicatorId: e.id, positionX: e.x, positionY: e.y },
          update: { positionX: e.x, positionY: e.y },
        });
      }
      await this.prisma.indicatorMap.update({ where: { id: map.id }, data: { flowData: { nodes, edges: [] } as any } });
      maps.push({ name: mapName, entries: entries.length });
    }
    return { structureId: structure.id, maps };
  }

  // ── Índices financeiros de análise (CALCULATED sobre as contas do balancete) ──
  // Idempotente: casa cada índice pelo accountCode "R.<KEY>". Só cria quando as
  // contas necessárias existem (após importar o balancete). Reexecutar atualiza.
  async generateFinancialRatios(userId: string) {
    const existing = await this.prisma.indicator.findMany();
    const byAccount = new Map(existing.filter((e) => e.accountCode).map((e) => [e.accountCode!, e]));
    // `taken` exclui os próprios índices (R.*) que serão reatribuídos → permite
    // recuperar o código limpo (ex.: "EG") quando ele deixa de estar ocupado.
    const ratioAccts = new Set(FINANCIAL_RATIOS.map((d) => `R.${d.key}`));
    const taken = new Set(
      existing.filter((e) => !(e.accountCode && ratioAccts.has(e.accountCode))).map((e) => e.code.toUpperCase()),
    );
    const uniqueCode = (base: string): string => {
      let code = base, n = 2;
      while (taken.has(code.toUpperCase())) code = `${base}${n++}`;
      taken.add(code.toUpperCase());
      return code;
    };
    // Token de fórmula sanitizado a partir do código da conta (que agora contém
    // "abreviação + Cód. Reduzido", ex.: "AC 1.01" → token "AC_1_01").
    const tokenOfAcc = (acc: string) => this.toToken(byAccount.get(acc)!.code);
    const idOfAcc = (acc: string) => byAccount.get(acc)!.id;

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];
    const idByKey = new Map<string, string>();

    for (const def of FINANCIAL_RATIOS) {
      const missing = def.needs.filter((a) => !byAccount.has(a));
      if (missing.length) { skipped.push(`${def.name} — faltam contas ${missing.join(', ')}`); continue; }

      const absExpr = (acc: string) => `abs(${tokenOfAcc(acc)})`;
      const expression = def.expr(absExpr);
      const variables: Record<string, string> = {};
      for (const a of def.needs) variables[tokenOfAcc(a)] = idOfAcc(a);

      const acctKey = `R.${def.key}`;
      const code = uniqueCode(def.key);
      let ind = byAccount.get(acctKey);
      if (ind) {
        ind = await this.prisma.indicator.update({
          where: { id: ind.id },
          data: { code, name: def.name, unit: def.unit as any, direction: def.direction as any, type: 'CALCULATED', category: 'Análise Financeira', source: 'RATIO' },
        });
        updated.push(def.name);
      } else {
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
      idByKey.set(def.key, ind.id);
    }

    await this.calcEngine.recalculateRealized();

    const map = await this.ensureAnalysisMap(userId, idByKey);

    await this.audit.log({
      userId, action: 'CREATE', entity: 'Indicator', entityId: 'generate-ratios',
      after: { created: created.length, updated: updated.length, skipped: skipped.length },
    });

    return { created, updated, skipped, map };
  }

  // Monta (idempotente) a estrutura + mapa "Análise Financeira" com os índices,
  // dispostos em duas colunas (Liquidez | Endividamento), todos no nível 1.
  private async ensureAnalysisMap(userId: string, idByKey: Map<string, string>) {
    let structure = await this.prisma.mapStructure.findFirst({ where: { name: 'Análise Financeira' } });
    if (!structure) {
      structure = await this.prisma.mapStructure.create({
        data: { name: 'Análise Financeira', description: 'Índices de liquidez e endividamento (balancete)', category: 'Financeiro', createdBy: userId },
      });
    }

    let category = await this.prisma.mapCategory.findFirst({ where: { name: 'Financeiro' } })
      ?? await this.prisma.mapCategory.findFirst();
    if (!category) category = await this.prisma.mapCategory.create({ data: { name: 'Financeiro', userId } });

    let map = await this.prisma.indicatorMap.findFirst({ where: { name: 'Índices de Análise', structureId: structure.id } });
    if (!map) {
      map = await this.prisma.indicatorMap.create({
        data: { name: 'Índices de Análise', description: 'Liquidez e Endividamento', categoryId: category.id, structureId: structure.id, userId },
      });
    }

    const groups = [['LC', 'LI', 'LG', 'CCL'], ['EG', 'CEND', 'GE', 'IPL']];
    const nodes: any[] = [];
    for (let col = 0; col < groups.length; col++) {
      for (let row = 0; row < groups[col].length; row++) {
        const id = idByKey.get(groups[col][row]);
        if (!id) continue;
        const position = { x: col * 380, y: row * 180 };
        await this.prisma.indicatorMapEntry.upsert({
          where: { mapId_indicatorId: { mapId: map.id, indicatorId: id } },
          create: { mapId: map.id, indicatorId: id, positionX: position.x, positionY: position.y },
          update: { positionX: position.x, positionY: position.y },
        });
        nodes.push({ id, position, data: { level: 1 } });
      }
    }
    await this.prisma.indicatorMap.update({ where: { id: map.id }, data: { flowData: { nodes, edges: [] } as any } });

    return { structureId: structure.id, mapId: map.id, name: 'Índices de Análise', entries: nodes.length };
  }
}
