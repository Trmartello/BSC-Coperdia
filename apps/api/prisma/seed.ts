import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Users ──────────────────────────────────────────────────────────────────
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

  // ── Indicators: Capital de Giro ────────────────────────────────────────────

  const pmr = await prisma.indicator.upsert({
    where: { code: 'PMR' },
    update: {},
    create: {
      code: 'PMR',
      name: 'PMR - Prazo Médio de Recebimento',
      category: 'Capital de Giro',
      type: 'INPUT',
      unit: 'DAYS',
      periodicity: 'MONTHLY',
      direction: 'LOWER_IS_BETTER',
      responsible: 'Financeiro',
      sortOrder: 1,
    },
  });

  const pme = await prisma.indicator.upsert({
    where: { code: 'PME' },
    update: {},
    create: {
      code: 'PME',
      name: 'PME - Prazo Médio de Estoque',
      category: 'Capital de Giro',
      type: 'INPUT',
      unit: 'DAYS',
      periodicity: 'MONTHLY',
      direction: 'LOWER_IS_BETTER',
      responsible: 'Logística',
      sortOrder: 2,
    },
  });

  const pmp = await prisma.indicator.upsert({
    where: { code: 'PMP' },
    update: {},
    create: {
      code: 'PMP',
      name: 'PMP - Prazo Médio de Pagamento',
      category: 'Capital de Giro',
      type: 'INPUT',
      unit: 'DAYS',
      periodicity: 'MONTHLY',
      direction: 'HIGHER_IS_BETTER',
      responsible: 'Financeiro',
      sortOrder: 3,
    },
  });

  const ncg = await prisma.indicator.upsert({
    where: { code: 'NCG' },
    update: {},
    create: {
      code: 'NCG',
      name: 'NCG - Necessidade de Capital de Giro',
      category: 'Capital de Giro',
      type: 'CALCULATED',
      unit: 'CURRENCY',
      periodicity: 'MONTHLY',
      direction: 'LOWER_IS_BETTER',
      responsible: 'Controladoria',
      sortOrder: 4,
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

  // ── Sample Action Plan ─────────────────────────────────────────────────────
  await prisma.actionPlan.create({
    data: {
      indicatorId: pmr.id,
      title: 'Renegociar prazos com clientes estratégicos',
      description: 'Reduzir prazo de recebimento dos top 10 clientes de 30 para 20 dias',
      responsible: 'Gerente Comercial',
      dueDate: new Date('2026-07-31'),
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      userId: admin.id,
    },
  });

  console.log('✅ Seed concluído!');
  console.log('   Admin: admin@coperdia.com.br / admin123');
  console.log('   Direção: diretoria@coperdia.com.br / diretoria123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
