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
- **Status de ação automático**: `PENDING` = "No prazo" e `OVERDUE` = "Atrasada" são derivados da data-limite — `syncOverdue()` (lazy, no findAll/findOne de planos) + `resolveStatus()` (create/update) em `action-plans.service.ts`: PENDING/IN_PROGRESS vencidas → OVERDUE; OVERDUE com data futura/nula → PENDING. Manuais: IN_PROGRESS, DONE, CANCELLED, PAUSED (Pausada), AWAITING_VALIDATION (Aguardando validação) — nunca sobrescritos (DONE/CANCELLED/AWAITING_VALIDATION não atrasam; notificações OVERDUE excluem os três). Nos selects dos modais, No prazo/Atrasada NÃO são selecionáveis: o vigente aparece como `<option disabled>` ("No prazo (automático)"/"Atrasada (automático)"); ordem = Em andamento, Concluída, Cancelada, separador (`<option disabled>──</option>`), Pausada, Aguardando validação e — só no modal de edição quando o status atual é manual — "Retomar automático" (envia PENDING; o backend resolve). BLOCKED existe no enum Prisma mas foi removido da UI (não usar). Migration `20260702120000_add_action_item_statuses`.
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
- Cria/atualiza os indicadores de **nível** (N1/N2/N3) **e as contas-folha** (coluna D+E). **N1/N2** usam as linhas **"Totais"** da planilha; **N3** = soma das contas-folha (a planilha não traz linha Totais de N3); **folha** = valores da própria linha. Valida Totais×soma e reporta divergências.
- **Códigos**: **níveis (A/B/C) = só a abreviação** (`abbrevOf` — dicionário AT/AC/DISP/ANC/IMOB/PC/PL… + iniciais; colisão → sufixo numérico `OCV`/`OCV2`). **Folha (D) = abreviação (iniciais do nome) + Cód. Reduzido (E)** (`balCode`, ex.: `AES 1341`; nome = `"1341 - ACERTOS DE ESTOQUES-SAIDAS"`). `accountCode` = código hierárquico p/ níveis, **Cód. Reduzido p/ folhas** (`@unique`). Aplicado no create **e update** (re-import corrige codes).
- **Folhas = só dados**: viram indicadores INPUT com histórico e aparecem na **busca do seletor de fórmulas**, mas **NÃO entram nos mapas** (mapas só com níveis).
- **Idempotente + performático**: casa por `accountCode`; níveis via create/update individual; **folhas via `createMany`** (lotes de 500); valores mensais via `createMany` (novos) + `update` (só os alterados) — reimport mensal só grava o que mudou. `RealizedValue` único por `[indicatorId, period]`. Migrations `20260701130000_add_indicator_account_code`.
- Fórmulas usam **token sanitizado** (`toToken`: `AES 1341`→`AES_1341`); `generateFinancialRatios` monta expressão/variables com `toToken(code)`. Níveis têm code limpo (`AC`), então tokens ficam `AC`. Fórmulas existentes seguem válidas (calc-engine usa `formula.variables` token→id, independe do `code`).
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

### Casas decimais por indicador + busca de variáveis (form)
- `Indicator.decimalPlaces Int @default(2)` (migration `20260701140000`; `20260701150000` seta DAYS→0 p/ não exibir "28,00 dias"). No form (`IndicatorFormPanel`): dropdown "Casas decimais" (0–4) salvo no payload; `settings.updateIndicator/createIndicator` fazem pass-through ao Prisma.
- Formatação centralizada em `lib/utils.ts`: `formatValue/formatNumber/formatNumberParts(value, unit, decimals = 2)` — `clampDecimals` limita 0–6; CURRENCY/NUMBER usam `Intl` compact `maximumFractionDigits`; %/DIAS/ÍNDICE usam `toFixed(d)`. Threaded em IndicatorCard (`dp`), ExecutiveDashboard (KpiCard + FinancialAnalysisPanel, `kpi.decimalPlaces`), IndicatorTree, IndicatorDetailPanel (`fmtLarge`/`fmtBar`/PeriodRow recebem `decimals`). Dashboard endpoints retornam `decimalPlaces`.
- **Busca de variáveis** no form (CALCULATED): input com debounce 300ms (`varSearchDeb`) filtra por code/name/category/responsible; **selecionados sempre primeiro e visíveis** (não são cortados pelo `slice(50)` das demais correspondências).

### Padrões do IndicatorCard (`components/indicators/IndicatorCard.tsx`)
- Largura fixa `w-[260px]`. Sem botões Info/lixeira/delete no card (removidos).
- Direção: `ArrowUp` verde (HIGHER_IS_BETTER) / `ArrowDown` azul (LOWER_IS_BETTER), antes do nome.
- Unidade: badge roxo no canto superior direito (`unitLabel(unit)`) — mostra **apenas a medida** (`R$`, `Dias`, `%`, `Índice`, `Nº`), **sem sufixo de escala**.
- Valores numéricos via `formatNumber()` (sem símbolo de unidade — o badge já mostra). A **escala (mil/mi/bi)** fica **em cada coluna, independente** (ex.: `12 mil`, `5,2 mil`, `1,5 mi`). `formatNumber = num + scale` de `formatNumberParts()`; `Intl` usa espaço não-quebrável (` `) entre número e escala — o split usa `/\s+/`.
- Desvio: esquerda = **Realizado vs Meta** (`vs meta`); direita = **Estimativa vs Realizado** (`Vs Real.`). `deviationLabel(pct, direction, suffix)` recebe o sufixo do texto; a cor (verde/vermelho) respeita a `direction`.
- Footer (ações/anexos/comentários) só renderiza se ao menos um count > 0.

### Modal de Criação/Edição de Indicador (`components/indicators/IndicatorFormPanel.tsx`)
- **Modal centrado** (não mais drawer lateral): overlay `fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4` (fundo escurecido + desfoque; clique no overlay fecha). Card interno `w-[52vw] min-w-[520px] max-w-[780px] max-h-[92vh] rounded-2xl flex flex-col overflow-hidden` (~50% da largura).
- **Layout em 3 faixas**: header fixo (título + X) · corpo rolável (`px-6 py-5 space-y-5 overflow-y-auto flex-1`) · footer sticky (Excluir à esquerda + Salvar à direita).
- **Grupos por seção** via helper `Section({ title })`: **"Informações do indicador"**, **"Fórmula de cálculo"** (só CALCULATED), **"Configuração visual"** (unidade, direção, casas decimais, nível), **"Descrição"**, **"Classificação e responsáveis"**.
- **Descrição/conceito**: textarea **redimensionável** `input-dark w-full resize-y min-h-[96px] max-h-[320px] leading-relaxed`, `maxLength 1000`; salva `description: form.description.trim() || null`.
- Busca de variáveis + casas decimais: ver seção acima. `aliases` (indicatorId→nome amigável) + prévia "Leitura" (`humanizeExpression`).

### Modal de Histórico do Indicador (`components/indicators/IndicatorDetailPanel.tsx`)
- **Dois painéis lado a lado**: overlay `fixed inset-0 z-40 flex justify-end` → `flex h-full` com o painel principal (gráfico/histórico) e o painel lateral do Plano de Ação.
- **Painel principal** (gráfico): `w-[48vw] min-w-[440px] max-w-[820px]`. Título com **seta de direção** (`ArrowDown` azul p/ LOWER_IS_BETTER · `ArrowUp` verde p/ HIGHER_IS_BETTER) + nome; **descrição abaixo do título** (`text-[13px] text-white/50 whitespace-pre-line`). Removidos o subtítulo antigo e os badges de polaridade/unidade.
- **Métricas compactas**: grid de 3 colunas, label+data em uma linha, valor `text-lg font-bold`, Δ como chip inline (sem caixa de tooltip separada).
- **Backdrop ofuscado**: o overlay externo (`fixed inset-0 z-40 flex justify-end`) tem `bg-black/60 backdrop-blur-sm` — os ~50% restantes da tela ficam escurecidos/desfocados p/ foco no histórico. Clique no backdrop fecha (os painéis dão `stopPropagation`).
- **ESC via pilha global LIFO** (`lib/useEscClose.ts`): cada modal registra `useEscClose(onClose)` ao montar; um único listener fecha SEMPRE a camada mais recente (do último modal aberto ao mais antigo, um por tecla). Aplicado em: IndicatorDetailPanel (gráfico + registro condicional do painel Plano de Ação via `useEscClose(fn, showActionPlan)`), IndicatorFormPanel, IndicatorDetailModal, ActionPlanDetail (drawer da página, `!embedded`), NewInitiativeModal, NewActionItemModal, ActionItemDetailModal, NewActionPlanModal, ConfirmDialog. **Novo modal → registrar com `useEscClose`**, não criar keydown próprio.
- **Botão "Plano de Ação"** após as tabs (Visão Geral | Lançamentos), ícone `ClipboardList` → toggle `showActionPlan`. O **painel lateral** tem **largura animada** (`w-0` → `w-[40vw] min-w-[360px] max-w-[600px]`, `transition-all duration-300`); o gráfico à esquerda **continua visível**. Contém header (ícone + "Plano de Ação" + nome + "Nova Iniciativa" + X) e `ActionPlanDetail planId={canonicalPlanId} embedded showFilters autoNewInitiative`. `canonicalPlanId` = plano existente ou recém-criado (`ensureForIndicator`).
- **Rodapé "Frentes de trabalho"** abaixo do gráfico (expander `showFrentes`, **fechado por padrão**): lista `ind.monitoringPoints` (as frentes cadastradas no form) com bullets roxos; vazio → aviso. Chevron `ChevronRight`/`ChevronDown`.
- **HistoryChart** (SVG inline): geometria `step=50`, `barW=step*0.88` (barras largas, gap mínimo), `chartH=172`, `pad=8` (margem lateral mínima — barras quase encostam nas bordas; o gráfico ainda "sangra" via wrapper `-mx-4`), `topPad=62` (2 linhas YoY acima). Fontes ampliadas: rótulos de barra 12 (comparação 13) → **20 no hover**; rótulos YoY fontSize **13**/peso 800 (caixa 18px); meses do eixo 11; "meta" 10. **Hover realça** a barra (`bw=barW+4`, stroke branco `0.55`, `drop-shadow`) **e aumenta muito o rótulo** (→20), `transition 0.12s`. `fmtBar`/`fmtLarge`/`PeriodRow` recebem `decimals` (= `ind.decimalPlaces ?? 2`).

### Painel de Plano de Ação (`components/action-plans/ActionPlanDetail.tsx`)
- **Filtros de ação** (prop `showFilters`, ligada no painel embutido do indicador): barra com **busca textual** (título/descrição/responsável), **Status** e **Prioridade** (multi-seleção). Com filtro ativo, oculta iniciativas sem ações correspondentes, força abrir as que têm match e mostra "X de Y ações" + estado vazio. Escopo já é do indicador (o `canonicalPlanId` é do próprio indicador).
- **`MultiFilter`** (`components/action-plans/MultiFilter.tsx`): dropdown de checkboxes reutilizável (dots/cores por opção, busca opcional) — **extraído** da página de Planos de Ação; `page.tsx` e o painel do indicador importam o mesmo componente + helper `toggleSet`.
- **"Nova Iniciativa"** fica **no topo** da lista (antes das iniciativas), não mais no rodapé.
- **Modais de ação em camada lateral** (`asRightPanel`, passado como `asRightPanel={embedded}`): no contexto do indicador, `NewActionItemModal` e `ActionItemDetailModal` abrem como **camada 2 à direita** (`fixed inset-y-0 right-0 w-[50vw] min-w-[420px] max-w-[760px]`, animação `.slide-in-right` do globals.css), **sem backdrop** — o gráfico à esquerda continua visível; a camada sobrepõe o painel de Plano de Ação. Fora do indicador (página), seguem centrados com backdrop.

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
