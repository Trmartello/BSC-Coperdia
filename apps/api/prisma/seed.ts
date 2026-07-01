import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Users (SEMPRE garantidos, mesmo em prod) ────────────────────────────────
  // Roda antes do guard SEED_ONLY_IF_EMPTY: upsert com update:{} é idempotente e
  // NÃO altera usuários já existentes — apenas cria os que faltam. Assim novos
  // perfis (ex.: Controladoria/Gestor) aparecem no próximo deploy sem tocar em
  // dados reais.
  const adminHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@coperdia.com.br' },
    update: {},
    create: { name: 'Administrador Copérdia', email: 'admin@coperdia.com.br', passwordHash: adminHash, role: 'ADMIN' },
  });

  const dirHash = await bcrypt.hash('diretoria123', 12);
  await prisma.user.upsert({
    where: { email: 'diretoria@coperdia.com.br' },
    update: {},
    create: { name: 'Diretoria Copérdia', email: 'diretoria@coperdia.com.br', passwordHash: dirHash, role: 'DIRETORIA' },
  });

  const contrHash = await bcrypt.hash('controladoria123', 12);
  await prisma.user.upsert({
    where: { email: 'controladoria@coperdia.com.br' },
    update: {},
    create: { name: 'Controladoria Copérdia', email: 'controladoria@coperdia.com.br', passwordHash: contrHash, role: 'CONTROLADORIA' },
  });

  const gestorHash = await bcrypt.hash('gestor123', 12);
  await prisma.user.upsert({
    where: { email: 'gestor@coperdia.com.br' },
    update: {},
    create: { name: 'Gestor Copérdia', email: 'gestor@coperdia.com.br', passwordHash: gestorHash, role: 'GESTOR' },
  });

  // Produção: além dos usuários (acima), o restante só é semeado quando o banco
  // está vazio, para nunca sobrescrever dados reais em deploys subsequentes.
  // (Local roda sem a flag → comportamento normal.)
  if (process.env.SEED_ONLY_IF_EMPTY === 'true') {
    const existingIndicators = await prisma.indicator.count();
    if (existingIndicators > 0) {
      console.log('⏭️  Banco já populado — usuários garantidos, restante do seed ignorado (SEED_ONLY_IF_EMPTY).');
      return;
    }
    console.log('📦 Banco vazio — aplicando seed inicial em produção...');
  }

  // ── Indicators: Capital de Giro ────────────────────────────────────────────

  const pmrMonitoring = [
    'Aging de recebíveis (0-30, 31-60, 61-90, +90 dias)',
    'Inadimplência e provisão para devedores duvidosos',
    'Política de crédito e prazo médio concedido por canal',
    'Mix cooperados (crédito diferenciado) vs mercado',
    'Régua de cobrança e renegociação de inadimplentes',
  ];
  const pmr = await prisma.indicator.upsert({
    where: { code: 'PMR' },
    update: { monitoringPoints: pmrMonitoring, description: 'Contas a Receber / (Receita Bruta / 30). Dias médios para receber.' },
    create: {
      code: 'PMR',
      name: 'PMR - Prazo Médio de Recebimento',
      description: 'Contas a Receber / (Receita Bruta / 30). Dias médios para receber.',
      category: 'Capital de Giro',
      type: 'INPUT',
      unit: 'DAYS',
      periodicity: 'MONTHLY',
      direction: 'LOWER_IS_BETTER',
      responsible: 'Financeiro',
      sortOrder: 1,
      accumulation: 'AVERAGE',
      monitoringPoints: pmrMonitoring,
    },
  });

  const pmeMonitoring = [
    'Giro de estoque por categoria e curva ABC',
    'Estoque obsoleto, vencido e baixa rotatividade',
    'Acuracidade de inventário e rupturas',
    'Lote econômico de compra e lead time de fornecedores',
    'Sazonalidade e previsão de demanda',
  ];
  const pme = await prisma.indicator.upsert({
    where: { code: 'PME' },
    update: { monitoringPoints: pmeMonitoring, description: 'Estoque Médio / (CPV / 30). Dias médios em estoque.' },
    create: {
      code: 'PME',
      name: 'PME - Prazo Médio de Estoque',
      description: 'Estoque Médio / (CPV / 30). Dias médios em estoque.',
      category: 'Capital de Giro',
      type: 'INPUT',
      unit: 'DAYS',
      periodicity: 'MONTHLY',
      direction: 'LOWER_IS_BETTER',
      responsible: 'Logística',
      sortOrder: 2,
      accumulation: 'AVERAGE',
      monitoringPoints: pmeMonitoring,
    },
  });

  const pmpMonitoring = [
    'Negociação de prazo com fornecedores estratégicos',
    'Aproveitamento de descontos por antecipação vs prazo',
    'Concentração de fornecedores e poder de barganha',
    'Calendário de pagamentos e gestão de fluxo',
  ];
  const pmp = await prisma.indicator.upsert({
    where: { code: 'PMP' },
    update: { monitoringPoints: pmpMonitoring, description: 'Contas a Pagar / (Compras / 30). Dias médios para pagar.' },
    create: {
      code: 'PMP',
      name: 'PMP - Prazo Médio de Pagamento',
      description: 'Contas a Pagar / (Compras / 30). Dias médios para pagar.',
      category: 'Capital de Giro',
      type: 'INPUT',
      unit: 'DAYS',
      periodicity: 'MONTHLY',
      direction: 'HIGHER_IS_BETTER',
      responsible: 'Financeiro',
      sortOrder: 3,
      accumulation: 'AVERAGE',
      monitoringPoints: pmpMonitoring,
    },
  });

  const ncgMonitoring = [
    'Equilíbrio entre PMR, PME e PMP (ciclo financeiro)',
    'Capital de giro próprio vs financiamento de terceiros',
    'Sazonalidade da necessidade de caixa',
    'Antecipação de recebíveis e custo financeiro',
  ];
  const ncg = await prisma.indicator.upsert({
    where: { code: 'NCG' },
    update: { monitoringPoints: ncgMonitoring, description: 'PMR + PME - PMP. Necessidade de Capital de Giro em dias.' },
    create: {
      code: 'NCG',
      name: 'NCG - Necessidade de Capital de Giro',
      description: 'PMR + PME - PMP. Necessidade de Capital de Giro em dias.',
      category: 'Capital de Giro',
      type: 'CALCULATED',
      unit: 'CURRENCY',
      periodicity: 'MONTHLY',
      direction: 'LOWER_IS_BETTER',
      responsible: 'Controladoria',
      sortOrder: 4,
      monitoringPoints: ncgMonitoring,
    },
  });

  // ── Formula: NCG = (PMR + PME - PMP) × (Receita / 360) ───────────────────
  // Simplificado: NCG = PMR + PME - PMP  (índice em dias)
  await prisma.formula.upsert({
    where: { indicatorId: ncg.id },
    update: {},
    create: {
      indicatorId: ncg.id,
      expression: 'PMR + PME - PMP',
      variables: { PMR: pmr.id, PME: pme.id, PMP: pmp.id },
      description: 'Necessidade de Capital de Giro em dias (PMR + PME - PMP)',
    },
  });

  // ── Relations ──────────────────────────────────────────────────────────────
  for (const childId of [pmr.id, pme.id, pmp.id]) {
    await prisma.indicatorRelation.upsert({
      where: { parentId_childId: { parentId: ncg.id, childId } },
      update: {},
      create: { parentId: ncg.id, childId, weight: 1 },
    });
  }

  // ── Realized Values ────────────────────────────────────────────────────────
  const period = new Date('2026-06-01');

  await prisma.realizedValue.upsert({
    where: { indicatorId_period: { indicatorId: pmr.id, period } },
    update: {},
    create: { indicatorId: pmr.id, period, value: 25 },
  });
  await prisma.realizedValue.upsert({
    where: { indicatorId_period: { indicatorId: pme.id, period } },
    update: {},
    create: { indicatorId: pme.id, period, value: 22 },
  });
  await prisma.realizedValue.upsert({
    where: { indicatorId_period: { indicatorId: pmp.id, period } },
    update: {},
    create: { indicatorId: pmp.id, period, value: 45 },
  });

  // ── Goals ─────────────────────────────────────────────────────────────────
  await prisma.goal.upsert({
    where: { indicatorId_period: { indicatorId: pmr.id, period } },
    update: {},
    create: { indicatorId: pmr.id, period, value: 30 },
  });
  await prisma.goal.upsert({
    where: { indicatorId_period: { indicatorId: pme.id, period } },
    update: {},
    create: { indicatorId: pme.id, period, value: 25 },
  });
  await prisma.goal.upsert({
    where: { indicatorId_period: { indicatorId: pmp.id, period } },
    update: {},
    create: { indicatorId: pmp.id, period, value: 45 },
  });

  // ── Forecast for PMR (estimativa = 28 dias) ────────────────────────────────
  const scenario = await prisma.scenario.upsert({
    where: { id: 'scenario-baseline' },
    update: {},
    create: {
      id: 'scenario-baseline',
      name: 'Cenário Base 2026',
      description: 'Cenário base para o mês de junho 2026',
      period,
      isBaseline: true,
      status: 'ACTIVE',
      userId: admin.id,
    },
  });

  await prisma.forecastValue.upsert({
    where: { indicatorId_scenarioId_period: { indicatorId: pmr.id, scenarioId: scenario.id, period } },
    update: {},
    create: { indicatorId: pmr.id, scenarioId: scenario.id, period, value: 28, isManual: true, userId: admin.id },
  });
  await prisma.forecastValue.upsert({
    where: { indicatorId_scenarioId_period: { indicatorId: pme.id, scenarioId: scenario.id, period } },
    update: {},
    create: { indicatorId: pme.id, scenarioId: scenario.id, period, value: 28, isManual: true, userId: admin.id },
  });

  // ── Estimativas baseline (sem cenário) p/ exibição/edição nos cards ─────────
  const baselineEstimates: { id: string; value: number }[] = [
    { id: pmr.id, value: 26 },
    { id: pme.id, value: 24 },
    { id: pmp.id, value: 46 },
  ];
  for (const est of baselineEstimates) {
    const existing = await prisma.forecastValue.findFirst({
      where: { indicatorId: est.id, scenarioId: null, period },
    });
    if (existing) {
      await prisma.forecastValue.update({ where: { id: existing.id }, data: { value: est.value } });
    } else {
      await prisma.forecastValue.create({
        data: { indicatorId: est.id, scenarioId: null, period, value: est.value, isManual: true, userId: admin.id },
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ÁRVORE FINANCEIRA ESTRATÉGICA (Receita → EBITDA → NOPAT → ROIC ; → ROE)
  // Valores em R$ milhões. Códigos batem com o Dashboard Executivo.
  // ════════════════════════════════════════════════════════════════════════════

  type Dir = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  type Unit = 'CURRENCY' | 'PERCENTAGE';

  // acc = consolidação no modo "Acumular": SUM (fluxos), LAST (saldos de balanço)
  type Acc = 'SUM' | 'AVERAGE' | 'LAST';
  const inputDefs: {
    code: string; name: string; unit: Unit; direction: Dir; responsible: string; realized: number; goal: number; acc: Acc;
  }[] = [
    { code: 'RECEITA',           name: 'Receita Líquida',       unit: 'CURRENCY', direction: 'HIGHER_IS_BETTER', responsible: 'Comercial',     realized: 500, goal: 520, acc: 'SUM' },
    { code: 'CUSTOS',            name: 'Custos (CPV)',          unit: 'CURRENCY', direction: 'LOWER_IS_BETTER',  responsible: 'Operações',     realized: 300, goal: 290, acc: 'SUM' },
    { code: 'DESPESAS',          name: 'Despesas Operacionais', unit: 'CURRENCY', direction: 'LOWER_IS_BETTER',  responsible: 'Controladoria', realized: 120, goal: 115, acc: 'SUM' },
    { code: 'IMPOSTOS',          name: 'Impostos sobre Lucro',  unit: 'CURRENCY', direction: 'LOWER_IS_BETTER',  responsible: 'Fiscal',        realized: 20,  goal: 18,  acc: 'SUM' },
    { code: 'ESTOQUES',          name: 'Estoques',              unit: 'CURRENCY', direction: 'LOWER_IS_BETTER',  responsible: 'Logística',     realized: 80,  goal: 75,  acc: 'LAST' },
    { code: 'CONTAS_RECEBER',    name: 'Contas a Receber',      unit: 'CURRENCY', direction: 'LOWER_IS_BETTER',  responsible: 'Financeiro',    realized: 90,  goal: 85,  acc: 'LAST' },
    { code: 'ATIVO_IMOBILIZADO', name: 'Ativo Imobilizado',     unit: 'CURRENCY', direction: 'HIGHER_IS_BETTER', responsible: 'Controladoria', realized: 230, goal: 230, acc: 'LAST' },
    { code: 'PATRIMONIO',        name: 'Patrimônio Líquido',    unit: 'CURRENCY', direction: 'HIGHER_IS_BETTER', responsible: 'Controladoria', realized: 350, goal: 360, acc: 'LAST' },
    { code: 'DIVIDA',            name: 'Dívida Bruta',          unit: 'CURRENCY', direction: 'LOWER_IS_BETTER',  responsible: 'Financeiro',    realized: 150, goal: 140, acc: 'LAST' },
    { code: 'FLUXO_CAIXA',       name: 'Fluxo de Caixa Livre',  unit: 'CURRENCY', direction: 'HIGHER_IS_BETTER', responsible: 'Tesouraria',    realized: 45,  goal: 50,  acc: 'SUM' },
  ];

  // realized = valor realizado pré-computado a partir dos inputs (para o Dashboard)
  const calcDefs: {
    code: string; name: string; unit: Unit; direction: Dir; goal: number; realized: number; expr: string; vars: string[];
  }[] = [
    { code: 'EBITDA',            name: 'EBITDA',            unit: 'CURRENCY',   direction: 'HIGHER_IS_BETTER', goal: 115, realized: 80,        expr: 'RECEITA - CUSTOS - DESPESAS',                  vars: ['RECEITA', 'CUSTOS', 'DESPESAS'] },
    { code: 'NOPAT',             name: 'NOPAT',             unit: 'CURRENCY',   direction: 'HIGHER_IS_BETTER', goal: 97,  realized: 60,        expr: 'EBITDA - IMPOSTOS',                            vars: ['EBITDA', 'IMPOSTOS'] },
    { code: 'LUCRO_LIQUIDO',     name: 'Lucro Líquido',     unit: 'CURRENCY',   direction: 'HIGHER_IS_BETTER', goal: 97,  realized: 60,        expr: 'EBITDA - IMPOSTOS',                            vars: ['EBITDA', 'IMPOSTOS'] },
    { code: 'CAPITAL_INVESTIDO', name: 'Capital Investido', unit: 'CURRENCY',   direction: 'LOWER_IS_BETTER',  goal: 390, realized: 400,       expr: 'ESTOQUES + CONTAS_RECEBER + ATIVO_IMOBILIZADO', vars: ['ESTOQUES', 'CONTAS_RECEBER', 'ATIVO_IMOBILIZADO'] },
    { code: 'CAPITAL_GIRO',      name: 'Capital de Giro',   unit: 'CURRENCY',   direction: 'LOWER_IS_BETTER',  goal: 160, realized: 170,       expr: 'ESTOQUES + CONTAS_RECEBER',                    vars: ['ESTOQUES', 'CONTAS_RECEBER'] },
    { code: 'ROIC',              name: 'ROIC',              unit: 'PERCENTAGE', direction: 'HIGHER_IS_BETTER', goal: 18,  realized: 15,        expr: '(NOPAT / CAPITAL_INVESTIDO) * 100',            vars: ['NOPAT', 'CAPITAL_INVESTIDO'] },
    { code: 'ROE',               name: 'ROE',               unit: 'PERCENTAGE', direction: 'HIGHER_IS_BETTER', goal: 20,  realized: 17.142857, expr: '(LUCRO_LIQUIDO / PATRIMONIO) * 100',           vars: ['LUCRO_LIQUIDO', 'PATRIMONIO'] },
    { code: 'ENDIVIDAMENTO',     name: 'Endividamento',     unit: 'PERCENTAGE', direction: 'LOWER_IS_BETTER',  goal: 38,  realized: 42.857143, expr: '(DIVIDA / PATRIMONIO) * 100',                  vars: ['DIVIDA', 'PATRIMONIO'] },
  ];

  const fin: Record<string, string> = {}; // code -> id

  // Pontos de monitoria / frentes de trabalho por indicador estratégico
  const monitoring: Record<string, string[]> = {
    RECEITA: ['Mix de produtos e margem por linha', 'Preço médio vs volume', 'Penetração por canal e região', 'Novos cooperados e retenção'],
    CUSTOS: ['Custo de matéria-prima e contratos de fornecimento', 'Eficiência operacional e perdas', 'Produtividade fabril (OEE)', 'Renegociação de insumos críticos'],
    DESPESAS: ['Despesas fixas vs variáveis', 'Headcount e produtividade', 'Despesas comerciais vs receita', 'Contratos recorrentes e SaaS'],
    IMPOSTOS: ['Planejamento tributário e regime', 'Créditos fiscais não aproveitados', 'Incentivos para cooperativas'],
    ESTOQUES: ['Giro e cobertura de estoque', 'Estoque obsoleto e vencido', 'Acuracidade de inventário'],
    CONTAS_RECEBER: ['Aging e inadimplência', 'Política de crédito', 'Antecipação de recebíveis'],
    ATIVO_IMOBILIZADO: ['Retorno sobre ativos (capex)', 'Ociosidade e capacidade instalada', 'Plano de investimentos'],
    PATRIMONIO: ['Distribuição de sobras vs reinvestimento', 'Capitalização de cooperados', 'Reservas e fundos'],
    DIVIDA: ['Custo médio da dívida (CDI+)', 'Perfil de vencimento (curto vs longo)', 'Covenants e alavancagem'],
    FLUXO_CAIXA: ['Conversão de EBITDA em caixa', 'Ciclo de conversão de caixa', 'Capex vs geração operacional'],
    EBITDA: ['Alavancas de receita e custo', 'Margem EBITDA por unidade de negócio', 'Despesas controláveis'],
    NOPAT: ['Eficiência operacional após impostos', 'Planejamento tributário', 'Alocação de capital'],
    LUCRO_LIQUIDO: ['Resultado financeiro líquido', 'Itens não recorrentes', 'Distribuição de sobras'],
    CAPITAL_INVESTIDO: ['Capital de giro vs imobilizado', 'Desinvestimento de ativos ociosos', 'Eficiência de capex'],
    CAPITAL_GIRO: ['Ciclo financeiro (PMR+PME-PMP)', 'Estoques e recebíveis', 'Linhas de capital de giro'],
    ROIC: ['NOPAT vs capital investido', 'Spread ROIC - WACC', 'Disciplina de alocação de capital'],
    ROE: ['Alavancagem financeira', 'Margem líquida e giro do ativo', 'Retorno aos cooperados'],
    ENDIVIDAMENTO: ['Dívida líquida / EBITDA', 'Estrutura de capital alvo', 'Custo e perfil da dívida'],
  };

  // Indicadores de ENTRADA + realizado + meta
  let order = 10;
  for (const def of inputDefs) {
    const ind = await prisma.indicator.upsert({
      where: { code: def.code },
      update: { monitoringPoints: monitoring[def.code] ?? [] },
      create: {
        code: def.code, name: def.name, category: 'Estratégico', type: 'INPUT',
        unit: def.unit, periodicity: 'MONTHLY', direction: def.direction,
        responsible: def.responsible, sortOrder: order++, accumulation: def.acc,
        monitoringPoints: monitoring[def.code] ?? [],
      },
    });
    fin[def.code] = ind.id;
    await prisma.realizedValue.upsert({
      where: { indicatorId_period: { indicatorId: ind.id, period } },
      update: {}, create: { indicatorId: ind.id, period, value: def.realized },
    });
    await prisma.goal.upsert({
      where: { indicatorId_period: { indicatorId: ind.id, period } },
      update: {}, create: { indicatorId: ind.id, period, value: def.goal },
    });
  }

  // Indicadores CALCULADOS
  order = 30;
  for (const def of calcDefs) {
    const ind = await prisma.indicator.upsert({
      where: { code: def.code },
      update: { monitoringPoints: monitoring[def.code] ?? [] },
      create: {
        code: def.code, name: def.name, category: 'Estratégico', type: 'CALCULATED',
        unit: def.unit, periodicity: 'MONTHLY', direction: def.direction,
        responsible: 'Controladoria', sortOrder: order++,
        monitoringPoints: monitoring[def.code] ?? [],
      },
    });
    fin[def.code] = ind.id;
  }

  // Fórmulas + relações (pai = calculado, filhos = variáveis) + metas
  for (const def of calcDefs) {
    const variables: Record<string, string> = {};
    for (const v of def.vars) variables[v] = fin[v];
    await prisma.formula.upsert({
      where: { indicatorId: fin[def.code] },
      update: {},
      create: {
        indicatorId: fin[def.code], expression: def.expr, variables,
        description: `${def.name} = ${def.expr}`,
      },
    });
    for (const v of def.vars) {
      await prisma.indicatorRelation.upsert({
        where: { parentId_childId: { parentId: fin[def.code], childId: fin[v] } },
        update: {}, create: { parentId: fin[def.code], childId: fin[v], weight: 1 },
      });
    }
    await prisma.goal.upsert({
      where: { indicatorId_period: { indicatorId: fin[def.code], period } },
      update: {}, create: { indicatorId: fin[def.code], period, value: def.goal },
    });
    await prisma.realizedValue.upsert({
      where: { indicatorId_period: { indicatorId: fin[def.code], period } },
      update: {}, create: { indicatorId: fin[def.code], period, value: def.realized },
    });
  }

  // Forecast de exemplo no cenário base: Receita otimista (540 vs 500),
  // para demonstrar a propagação Receita → EBITDA → NOPAT → ROIC/ROE.
  await prisma.forecastValue.upsert({
    where: { indicatorId_scenarioId_period: { indicatorId: fin['RECEITA'], scenarioId: scenario.id, period } },
    update: {},
    create: { indicatorId: fin['RECEITA'], scenarioId: scenario.id, period, value: 540, isManual: true, userId: admin.id },
  });

  // ── Map Categories ────────────────────────────────────────────────────────
  const categories = [
    { name: 'Financeiro',   color: '#10b981', sortOrder: 0 },
    { name: 'Comercial',    color: '#3b82f6', sortOrder: 1 },
    { name: 'Operacional',  color: '#f59e0b', sortOrder: 2 },
    { name: 'Agro',         color: '#22c55e', sortOrder: 3 },
    { name: 'RH',           color: '#a78bfa', sortOrder: 4 },
  ];

  const catMap: Record<string, string> = {};
  for (const cat of categories) {
    const record = await prisma.mapCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: { ...cat, userId: admin.id },
    });
    catMap[cat.name] = record.id;
  }

  // ── Map Structures (containers/pastas) ──────────────────────────────────────
  const structureDefs = [
    { name: 'Estrutura Financeira Estratégica', category: 'Financeiro', description: 'Mapas causais da perspectiva financeira' },
    { name: 'Estrutura Comercial', category: 'Comercial', description: 'Mapas de performance e pricing comercial' },
    { name: 'Estrutura Operacional', category: 'Operacional', description: 'Mapas de eficiência e processos' },
    { name: 'Estrutura Agro', category: 'Agro', description: 'Mapas do negócio agro cooperativo' },
  ];
  const structMap: Record<string, string> = {};
  for (const def of structureDefs) {
    const existing = await prisma.mapStructure.findFirst({ where: { name: def.name } });
    const record = existing ?? (await prisma.mapStructure.create({
      data: { name: def.name, description: def.description, category: def.category, createdBy: admin.id },
    }));
    structMap[def.category] = record.id;
  }

  // ── Indicator Maps ─────────────────────────────────────────────────────────
  const mapDefs = [
    {
      name: 'Capital de Giro',
      description: 'Ciclo financeiro: PMR + PME - PMP → NCG → Capital Investido → ROIC',
      category: 'Financeiro',
    },
    {
      name: 'Resultado Financeiro',
      description: 'Árvore causal do ROIC: Receita → Margens → EBITDA → NOPAT → ROIC',
      category: 'Financeiro',
    },
    {
      name: 'Performance Comercial',
      description: 'Volume × Ticket × Desconto → Receita → Margem. NPS e Retenção',
      category: 'Comercial',
    },
    {
      name: 'Eficiência Operacional',
      description: 'OEE → Perdas → Produtividade → Custo Unitário. SLA e Logística',
      category: 'Operacional',
    },
    {
      name: 'Negócio Agro Copérdia',
      description: 'Cooperados Ativos + Fidelização → Volume Leite e Cereais → Receita e Qualidade',
      category: 'Agro',
    },
  ];

  if ((await prisma.indicatorMap.count()) === 0) {
    for (const def of mapDefs) {
      await prisma.indicatorMap.create({
        data: {
          name: def.name,
          description: def.description,
          categoryId: catMap[def.category],
          structureId: structMap[def.category],
          userId: admin.id,
        },
      });
    }
  }

  // ── Sample Action Plan (idempotente) ───────────────────────────────────────
  if ((await prisma.actionPlan.count()) === 0) {
    const samplePlan = await prisma.actionPlan.create({
      data: {
        indicatorId: pmr.id,
        problem: 'PMR acima da meta — prazo médio de 25 dias vs meta de 30 dias',
        description: 'Reduzir o prazo médio de recebimento para manter o capital de giro saudável',
        status: 'IN_PROGRESS',
        userId: admin.id,
      },
    });

    const initiative = await prisma.initiative.create({
      data: {
        actionPlanId: samplePlan.id,
        title: 'Renegociação com clientes estratégicos',
        description: 'Tratar os 10 maiores clientes para reduzir prazo de 30 para 20 dias',
        userId: admin.id,
      },
    });

    await prisma.actionItem.create({
      data: {
        initiativeId: initiative.id,
        title: 'Renegociar prazos com clientes estratégicos',
        description: 'Reunião com gerentes comerciais e top 10 clientes',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        dueDate: new Date('2026-07-31'),
        ownerName: 'Gerente Comercial',
        progress: 25,
        userId: admin.id,
      },
    });

    await prisma.planComment.create({
      data: {
        actionPlanId: samplePlan.id,
        content: 'Iniciamos as conversas com os 3 maiores clientes. Retorno positivo.',
        progress: 25,
        userId: admin.id,
      },
    });
  }

  console.log('✅ Seed concluído!');
  console.log('   Admin: admin@coperdia.com.br / admin123');
  console.log('   Direção: diretoria@coperdia.com.br / diretoria123');
  console.log('   Controladoria: controladoria@coperdia.com.br / controladoria123');
  console.log('   Gestor: gestor@coperdia.com.br / gestor123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
