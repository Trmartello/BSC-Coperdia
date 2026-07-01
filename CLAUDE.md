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
- `formula.variables` = JSON `{NOME_VAR: indicatorId}` para substituição em mathjs. **`NOME_VAR` é um alias amigável editável** (não mais o código): em `IndicatorFormPanel`, cada variável marcada ganha um campo de nome (default = `toVarName(code)`, sanitiza p/ identificador válido — ex.: `GER-046`→`GER_046`). Renomear o alias propaga a troca na expressão (`replaceVarToken`, fronteira de palavra). Uma prévia "Leitura" (`humanizeExpression`) mostra a fórmula com os nomes completos dos indicadores; o `IndicatorDetailModal` também exibe essa leitura. Helpers em `lib/utils.ts` (`toVarName`, `replaceVarToken`, `humanizeExpression`). O backend já aceita qualquer token no map de variáveis — mudança é só de front.
- Cenários foram **removidos** da UI. `scenario.store.ts` mantém `activePeriod` + `accumulate` (modo Acumular).

### Modo "Acumular" (YTD)
- Toggle **Acumular** na `Topbar` (store `scenario.store.ts`: `accumulate`/`toggleAccumulate`, em memória). Quando ligado, consolida os indicadores de **janeiro do ano do período até o mês selecionado** (Jan→mês). O seletor mostra "Acumulado: Jan–Jun 2026".
- Cada indicador de **ENTRADA** acumula conforme `Indicator.accumulation` (enum `AccumulationMethod`): `SUM` (fluxos: Receita, Custos, Fluxo de Caixa…), `AVERAGE` (prazos/taxas: dias, %), `LAST` (saldos de balanço: Estoques, Contas a Receber, Patrimônio, Dívida…). Ajustável por indicador em **Configurações → Indicadores** (coluna "Acúmulo (YTD)").
- Indicadores **CALCULATED** ignoram `accumulation`: são **recompostos pela fórmula sobre os insumos já acumulados** (ex.: NCG_ytd = média(PMR)+média(PME)−média(PMP); ROIC_ytd = NOPAT_ytd/CapInv_ytd×100). NÃO somar os calculados mensais.
- Núcleo: `CalcEngineService.getAccumulatedValues(targetPeriod)` → `Map<id, {realized, forecast, goal}>`. Consumido por `DashboardService.getExecutiveDashboard(period, scenarioId, accumulated)` e `MapsService.findOne(id, period, accumulated)` (injeta o acumulado nas arrays `realizedValues/forecastValues/goals` que o front já lê). Query param `accumulated=true`.
- Defaults: migration `20260624120000_add_indicator_accumulation` (AVERAGE p/ DAYS/PERCENTAGE/INDEX; LAST p/ saldos por código) + `seed.ts` (`acc` por indicador).

### Importação de Balancete (planilha larga → indicadores de nível)
- Fonte: `.xlsx` com colunas **N1, N2, N3, Conta Contábil, Cód. Reduzido** + **1 coluna por mês** (cabeçalho "jan 2025"…). Serviço `BalanceteImportService` (`apps/api/src/modules/indicators/balancete-import.service.ts`), endpoint `POST /indicators/import-balancete` (Roles ADMIN/CONTROLADORIA, multer).
- Cria/atualiza **só os indicadores de nível** (N1/N2/N3) — folhas NÃO viram indicadores. **N1/N2** usam as linhas **"Totais"** da planilha; **N3** = soma das contas-folha (a planilha não traz linha Totais de N3). Valida Totais×soma e reporta divergências.
- **Idempotente**: casa por `Indicator.accountCode` (código hierárquico `1` / `1.01` / `1.01.01`, `@unique`) → UPDATE; `RealizedValue` upsert por `[indicatorId, period]` (reimport mensal só atualiza e insere o mês novo). Campo `Indicator.source = "BALANCETE"`. Migration `20260701130000_add_indicator_account_code`.
- **`code` = abreviação + Cód. Reduzido** (código do plano de contas), ex.: `AC 1.01`, `DISP 1.01.01`, `OCV 9.05.02` (`balCode` = `abbrevOf(label) + ' ' + accountCode`). O código do plano é único → dispensa contador de colisão e mantém o code legível e identificável (nada de `OCV2`/`ISL4`). Abreviações via dicionário (AT, AC, DISP, ANC, IMOB, PC, PL…) + iniciais; editável depois. Aplicado no create **e no update** (re-import corrige codes antigos). `accumulation` = LAST p/ códigos 1/2 (balanço/saldo), SUM p/ demais (resultado/fluxo). Relações pai→filho (N3→N2→N1) para o mapa causal.
- Como o `code` agora tem espaço/ponto, fórmulas usam **token sanitizado** (`toToken`: `AC 1.01`→`AC_1_01`). O `generateFinancialRatios` monta expressão/variables com `toToken(code)`. Fórmulas já existentes continuam válidas (o calc-engine avalia via `formula.variables` token→id, independente do `code` atual).
- **Mapas do balancete** (`ensureBalanceteMaps`, chamado no import): cria (idempotente) a estrutura **"Balancete"** com **um mapa por grupo N1** (Ativo, Passivo, Resultado…), contendo N1→N2→N3 com `flowData.nodes[].data.level` (1/2/3) para o drill-down por nível. **NUNCA altera estruturas/mapas existentes** (escopo próprio por nome). Layout em árvore (x = nível×380).
- Front: aba **"Balancete"** no `ImportDataModal` (botão "Importar" da Topbar), `indicatorsApi.importBalancete(file)`.
- **Índices de análise** (`generateFinancialRatios`, endpoint `POST /indicators/generate-ratios`, botão na aba Balancete): cria indicadores CALCULATED (Liquidez Corrente/Imediata/Geral, Capital Circulante Líquido, Endividamento Geral, Composição do Endividamento, Grau de Endividamento, Imobilização do PL) sobre as contas do balancete. Catálogo `FINANCIAL_RATIOS` referencia as contas por `accountCode` (estável) e resolve o token = abreviação atual da conta; idempotente por `accountCode = "R.<KEY>"`. **Passivo/PL são negativos no balancete** (Ativo+Passivo≈0) → as fórmulas usam `abs(...)` em cada conta (magnitudes). Só gera os índices cujas contas existem (após importar). Também monta (idempotente, `ensureAnalysisMap`) a estrutura + mapa **"Análise Financeira" › "Índices de Análise"** com os 8 índices em 2 colunas (Liquidez | Endividamento), todos nível 1.

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
- **Drill-down por nó (expansão progressiva)**: estado `expandedNodes: Set<string>` (não mais `visibleUpToLevel`). Grafo `childrenMap` (parent→[child]) montado por edge de forma **HÍBRIDA guiada pelo NÍVEL cadastrado** (`levelOf` = `node.data.level`): se os dois extremos têm níveis diferentes, o **mais raso é o pai** (respeita o nível cadastrado no painel Gerenciar Indicadores — ex.: Ciclo Financeiro nível 1 é pai dos vizinhos nível 2); se os níveis são iguais/indefinidos, cai na semântica `data.parentId`(agregado)/`data.childId`(causa) — preserva mapas sem níveis. `childHasParent` = união dos filhos; **raízes** = nós sem pai (topo) começam visíveis. `visibleIds` propaga das raízes descendo só pelos nós em `expandedNodes` (reachability) → oculta descendentes inacessíveis; edge visível só quando ambos os extremos visíveis. Botão `→`/`←` no card chama `onToggleExpand(id)` (revela SÓ os filhos diretos; recolher remove apenas o nó — robusto a losango/DAG). Reset ao trocar `id`. Mudar o nível no painel marca `dirtyRef` (auto-save) pois o nível dita a hierarquia.
- **4 ações globais** (topbar): `expandNextLevel` (expande toda a fronteira visível → +1 camada), `collapseLastLevel` (fecha os expandidos "mais profundos" = sem filho expandido; **depth-free**, simétrico/reversível), `expandAllLevels` (= todos os `expandableIds`), `collapseAllLevels` (= só raízes). Badge: `Raízes` / `visíveis/total` / `Tudo`. Animação de entrada `.map-node-in` (globals.css). NÃO usar modelo por nível — a antiga lógica `visibleUpToLevel`/`onExpandLevel` foi removida.
- **Níveis (metadado)**: `node.data.level` ainda existe só para o painel "Gerenciar Indicadores" (sugestão `max(níveis)+1` no `IndicatorRow`), **desacoplado da visibilidade**.
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
