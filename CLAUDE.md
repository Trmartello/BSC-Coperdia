# BSC Copérdia — Contexto do Projeto

## Visão Geral
Sistema de Gestão de Indicadores (BSC/EPM) para a Copérdia, com simulação de cenários, árvore de impacto causal, mapas visuais e planos de ação.

## Stack
- **Monorepo**: Turborepo (`apps/api`, `apps/web`)
- **Backend**: NestJS 10 + Prisma 5 + PostgreSQL 16
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS + ReactFlow + Zustand + React Query
- **Auth**: JWT (passport-jwt)
- **Cálculo**: mathjs + sort topológico (CalcEngineService)

## Estrutura de Pastas
```
apps/
  api/
    prisma/
      schema.prisma        ← todos os modelos
      seed.ts              ← dados de demonstração
      migrations/          ← histórico de migrações
    src/
      modules/
        auth/              ← JWT login/register
        users/             ← CRUD usuários
        indicators/        ← CRUD + forecast
        calc-engine/       ← motor de cálculo topológico
        formulas/          ← expressões mathjs
        scenarios/         ← cenários de simulação
        action-plans/      ← planos de ação (3 níveis)
        maps/              ← mapas causais (ReactFlow)
        dashboard/         ← executive dashboard
        settings/          ← configurações do sistema
  web/
    src/
      app/
        auth/login/        ← login page
        dashboard/
          maps/            ← galeria + editor ReactFlow
          indicators/      ← grid de cards
          action-plans/    ← planos de ação
          users/           ← gestão de usuários
          settings/        ← configurações
      components/
        indicators/        ← IndicatorCard, IndicatorDetailPanel
        action-plans/      ← modais e detalhe de planos
        tree/              ← IndicatorTree (ReactFlow)
        ui/                ← Sidebar, Topbar, Providers
        users/             ← UserFormModal
      lib/
        api.ts             ← clientes axios por módulo
        utils.ts           ← cn(), formatValue()
      store/
        auth.store.ts      ← Zustand: token + user
        scenario.store.ts  ← Zustand: cenário ativo
      types/               ← TypeScript types

## Convenções de Código

### Backend (NestJS)
- Módulos seguem padrão: `*.module.ts`, `*.controller.ts`, `*.service.ts`
- Controller usa `@UseGuards(JwtAuthGuard)` em todos os endpoints protegidos
- `req.user.sub` = userId vindo do JWT payload
- Relacionamentos Prisma: usar `include` explícito, nunca `select *`
- Erros: `NotFoundException`, `ConflictException`, `BadRequestException`

### Frontend (Next.js)
- Todas as páginas em `app/dashboard/` são Client Components (`'use client'`)
- Dados: `useQuery` para leitura, `useMutation` para escrita
- Toasts: `toast.success()` / `toast.error()` via Sonner
- Tema dark: `bg-[#0d0f17]` (fundo geral), `bg-[#1a1f2e]` (cards), `border-white/10`
- Estilo ativo na sidebar: `bg-purple-600/20 text-purple-300 border border-purple-500/30`
- Botão primário: `bg-purple-600 hover:bg-purple-700`
- Classes utilitárias: `card-dark`, `input-dark` (definidas em globals.css)

### Regras de Negócio Críticas
- `estimate ?? realized` — se não há estimativa, usa valor realizado (sem desvio)
- `direction: HIGHER_IS_BETTER | LOWER_IS_BETTER` — define se ↑ é bom ou ruim
- Plano de ação: `indicatorId = null` → avulso; `indicatorId = id` → vinculado
- Cálculo: CalcEngineService faz sort topológico antes de avaliar fórmulas
- `formula.variables` = JSON `{NOME_VAR: indicatorId}` para substituição em mathjs
- Cenários foram **removidos** da UI. `scenario.store.ts` mantém `activePeriod` + `accumulate` (modo Acumular).

### Modo "Acumular" (YTD)
- Toggle **Acumular** na `Topbar` (store `scenario.store.ts`: `accumulate`/`toggleAccumulate`, em memória). Quando ligado, consolida os indicadores de **janeiro do ano do período até o mês selecionado** (Jan→mês). O seletor mostra "Acumulado: Jan–Jun 2026".
- Cada indicador de **ENTRADA** acumula conforme `Indicator.accumulation` (enum `AccumulationMethod`): `SUM` (fluxos: Receita, Custos, Fluxo de Caixa…), `AVERAGE` (prazos/taxas: dias, %), `LAST` (saldos de balanço: Estoques, Contas a Receber, Patrimônio, Dívida…). Ajustável por indicador em **Configurações → Indicadores** (coluna "Acúmulo (YTD)").
- Indicadores **CALCULATED** ignoram `accumulation`: são **recompostos pela fórmula sobre os insumos já acumulados** (ex.: NCG_ytd = média(PMR)+média(PME)−média(PMP); ROIC_ytd = NOPAT_ytd/CapInv_ytd×100). NÃO somar os calculados mensais.
- Núcleo: `CalcEngineService.getAccumulatedValues(targetPeriod)` → `Map<id, {realized, forecast, goal}>`. Consumido por `DashboardService.getExecutiveDashboard(period, scenarioId, accumulated)` e `MapsService.findOne(id, period, accumulated)` (injeta o acumulado nas arrays `realizedValues/forecastValues/goals` que o front já lê). Query param `accumulated=true`.
- Defaults: migration `20260624120000_add_indicator_accumulation` (AVERAGE p/ DAYS/PERCENTAGE/INDEX; LAST p/ saldos por código) + `seed.ts` (`acc` por indicador).

### Estruturas de Mapas (containers/pastas) — `app/dashboard/maps/page.tsx`
- Camada hierárquica acima dos mapas: **`MapStructure` → `IndicatorMap` → `IndicatorMapEntry`**. Modelo `MapStructure` (nome, descrição, `category` texto livre/área, `createdBy`, timestamps); `IndicatorMap.structureId` (FK `onDelete: Cascade`). Migration `20260701120000_add_map_structures` cria a tabela + faz backfill (uma estrutura por categoria existente, vincula os mapas). Seed cria 4 estruturas (`structMap` por categoria).
- **Galeria em 2 níveis (mesma página, estado `openStructure`)**: lista de estruturas ↔ mapas da estrutura. Clique no mapa → editor `/dashboard/maps/[id]` (rota inalterada).
- **RBAC**: `canManage = role ∈ {ADMIN, CONTROLADORIA}` esconde botões no front; backend valida com `@Roles(...WRITE_ROLES)` + `RolesGuard` em **todas** as rotas de escrita. Usuários comuns só visualizam.
- **Endpoints** (`maps.controller.ts`, rotas `structures` **antes** de `:id`): `GET/POST /maps/structures`, `GET/PATCH/DELETE /maps/structures/:id`, `POST /maps/:id/duplicate`, `GET /maps?structureId=`. Excluir estrutura com mapas exige `?deleteMaps=true` (senão `409`); a UI oferece **mover mapas** p/ outra estrutura (PATCH `structureId` de cada + delete) OU **cascata**.
- **Duplicar mapa**: `MapsService.duplicate` copia nome+" (cópia)", descrição, categoria, estrutura, `flowData` e todos os `entries` (posições). Não afeta o original nem os demais.
- Componentes na page: `ActionMenu` (⋮ com backdrop p/ fechar), `Modal` genérico, `StructureModal`, `MapModal`, `DeleteStructureModal`, `StructureCard`, `MapCard`, `AddCard`.

### Editor de Mapas (`app/dashboard/maps/[id]/page.tsx`)
Arquivo grande e central — abaixo o mapa mental para evitar re-leitura:
- **Persistência**: auto-save (debounce 800ms via `useEffect` + `dirtyRef`). **Não há botão "Salvar"** — `dirtyRef.current = true` em qualquer mudança de posição/edge dispara o save. `dirtyRef` evita save espúrio no mount inicial.
- **Smart guides**: `components/maps/helperLines.tsx` — `getHelperLines()` calcula snap (6px) + `<HelperLines>` desenha as linhas-guia roxas via canvas overlay lendo o transform do store ReactFlow.
- **Floating edges**: memo `displayEdges` recalcula `sourceHandle`/`targetHandle` pela posição relativa dos cards (`pickHandles`). Respeita `manualRoute`: edge com `data.manualRoute === true` nunca é re-roteada automaticamente. `onReconnect` na mesma dupla origem/destino marca `manualRoute = true`.
- **`manualRoute`** é persistido no `flowData` JSON e restaurado em `buildNodesAndEdges`.
- **Background**: `BackgroundVariant.Dots`, gap 20, size 1.5, cor `rgba(255,255,255,0.14)`.
- **MiniMap**: 120×80, opacity 0.85, pannable/zoomable. Dimensões vão no `style`, não como props.
- **Níveis**: ao adicionar card pelo painel "Gerenciar Indicadores", o nível sugerido pré-selecionado é `max(níveis em uso) + 1` (componente `IndicatorRow`).
- **Gerenciar Indicadores**: drawer lateral direito fixo (`fixed top-12 right-0 bottom-0 w-[380px]`) com backdrop.

### Alertas / Sino (`components/ui/NotificationsBell.tsx` + módulo `notifications`)
- Modelo Prisma `Notification` (dedupeKey único p/ upsert + auto-resolução). Tipos: `INCONSISTENCY` (insumo INPUT sem realizado no período mais recente → calculado comprometido), `OVERDUE_ACTION` (ação do plano em atraso) e `OFF_TRACK` (indicador fora da meta, Meta vs Realizado).
- `getForUser` faz refresh throttled (30s) de INCONSISTENCY + OVERDUE ao ser lido; detecta/resolve sozinho. Alerta in-app é **independente do SMTP**; e-mail apenas marca `emailSent=true`.
- `OFF_TRACK` é **manual**: `scanOffTrack()` (varredura) restrita a ADMIN/CONTROLADORIA, ancorada no período mais recente COM metas; severidade CRITICAL (fora da meta) / WARNING (em risco); idempotente; vincula `actionPlanId` se já houver plano.
- Visibilidade: ADMIN/CONTROLADORIA/DIRETORIA veem tudo; demais veem `userId null` ou próprios.
- Endpoints: `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`, `POST /notifications/scan-off-track` (Roles), `POST /notifications/trigger-overdue`.
- Sino: badge de não lidos, dropdown, botão "Varrer metas" (ADMIN/CONTROLADORIA). Clique marca lido e abre o alvo via **store reativo** `store/action-plan-intent.store.ts` (funciona mesmo já estando na página — `router.push` não remonta): OVERDUE→`requestEditAction` abre `ActionItemDetailModal` (form de edição), OFF_TRACK→`requestPlanForIndicator` chama `actionPlansApi.ensureForIndicator` (pega/cria plano) e abre `ActionPlanDetail` em drawer, INCONSISTENCY→`/dashboard/indicators`. A page de action-plans consome o intent em `useEffect`.

### Padrões do IndicatorCard (`components/indicators/IndicatorCard.tsx`)
- Largura fixa `w-[260px]`. Sem botões Info/lixeira/delete no card (removidos).
- Direção: `ArrowUp` verde (HIGHER_IS_BETTER) / `ArrowDown` azul (LOWER_IS_BETTER), antes do nome.
- Unidade: badge roxo no canto superior direito (`unitLabel(unit)`) — mostra **apenas a medida** (`R$`, `Dias`, `%`, `Índice`, `Nº`), **sem sufixo de escala**.
- Valores numéricos via `formatNumber()` (sem símbolo de unidade — o badge já mostra). A **escala (mil/mi/bi)** fica **em cada coluna, independente** (ex.: `12 mil`, `5,2 mil`, `1,5 mi`). `formatNumber = num + scale` de `formatNumberParts()`; `Intl` usa espaço não-quebrável (` `) entre número e escala — o split usa `/\s+/`.
- Desvio: esquerda = **Realizado vs Meta** (`vs meta`); direita = **Estimativa vs Realizado** (`Vs Real.`). `deviationLabel(pct, direction, suffix)` recebe o sufixo do texto; a cor (verde/vermelho) respeita a `direction`.
- Footer (ações/anexos/comentários) só renderiza se ao menos um count > 0.

## Banco de Dados
- **URL**: `postgresql://postgres:postgres@localhost:5432/bsc_coperdia`
- **Seed**: usuários + indicadores (PMR/PME/PMP/NCG e derivados) + mapas + planos
- **Credenciais seed**: `admin@coperdia.com.br / admin123`

## Deploy (Railway / Docker)
- `apps/api/Dockerfile` e `apps/web/Dockerfile`. **Builds falham silenciosamente** —
  SEMPRE validar antes de push: `cd apps/api && npx tsc --noEmit` e `cd apps/web && npx next build` (ambos devem sair 0).
- `next build` deve rodar de dentro de `apps/web`, nunca da raiz.
- Deploy parado/antigo no Railway = build novo falhou silenciosamente. Conferir deps no `package.json` do app afetado.
- **Branch monitorado pelo Railway = `claude/fervent-shannon-lmub77`** (é o *default branch* do repo no GitHub). Push só para `main` **NÃO dispara deploy** — sempre empurrar para os dois (o `main:claude/fervent-shannon-lmub77` resolve). Projeto: 2 serviços — API (`bsc-coperdia-production`) e Web (`renewed-tenderness-production-60e3.up.railway.app`).

## Fluxo Eficiente (economia de tokens)
- Sempre fazer push para **`main` E `claude/fervent-shannon-lmub77`**.
- Usar `/push` (commit+push nos dois branches) e `/build-check` em vez de fazer manualmente.
- Não re-verificar serviços/arquivos que não mudaram; confiar no estado já estabelecido.
- Edits cirúrgicos (Edit) em vez de reescrever arquivos inteiros.

## Portas
- API: `http://localhost:3001/api/v1`
- Web: `http://localhost:3000`
- PostgreSQL: `localhost:5432`

## Comandos Úteis
```bash
# Iniciar tudo
sudo pg_ctlcluster 16 main start
node /home/user/BSC-Coperdia/apps/api/dist/main.js &
cd apps/web && npx next dev -p 3000 &

# Recompilar API após mudanças
cd apps/api && /home/user/BSC-Coperdia/node_modules/.bin/nest build

# Migrações
cd apps/api && npx prisma migrate dev --name <nome>

# Seed
cd apps/api && npx ts-node --esm prisma/seed.ts
```

## Agentes Disponíveis (Slash Commands)
| Comando | Descrição |
|---|---|
| `/dev` | Inicia o ambiente de desenvolvimento completo |
| `/db-reset` | Reseta o banco e reaplica seed |
| `/new-module` | Cria novo módulo NestJS (controller + service + module) |
| `/new-page` | Cria nova página Next.js com padrão do projeto |
| `/add-indicator` | Adiciona novo indicador ao sistema via seed |
| `/test-api` | Testa os principais endpoints da API |
| `/build-check` | Verifica build da API e tipos do frontend |
| `/push` | Commita e faz push das mudanças para o GitHub |
