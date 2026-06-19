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
- Cenários foram **removidos** da UI. `scenario.store.ts` mantém apenas `activePeriod`.

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
- Modelo Prisma `Notification` (dedupeKey único p/ upsert + auto-resolução). Tipos: `INCONSISTENCY` (insumo INPUT sem realizado no período mais recente → calculado comprometido) e `OVERDUE_ACTION` (ação do plano em atraso).
- `NotificationsService.getForUser` faz refresh throttled (30s) ao ser lido; detecta/resolve sozinho. Alerta in-app é **independente do SMTP**; e-mail apenas marca `emailSent=true`.
- Visibilidade: ADMIN/CONTROLADORIA/DIRETORIA veem tudo; demais veem `userId null` ou próprios.
- Endpoints: `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`, `POST /notifications/trigger-overdue`.
- Sino: badge de não lidos, dropdown, clique navega (OVERDUE→`/dashboard/action-plans`, INCONSISTENCY→`/dashboard/indicators`) e marca como lido.

### Padrões do IndicatorCard (`components/indicators/IndicatorCard.tsx`)
- Largura fixa `w-[260px]`. Sem botões Info/lixeira/delete no card (removidos).
- Direção: `ArrowUp` verde (HIGHER_IS_BETTER) / `ArrowDown` azul (LOWER_IS_BETTER), antes do nome.
- Unidade: badge roxo destacado no canto superior direito (`unitLabel()`).
- Valores numéricos via `formatNumber()` (sem símbolo de unidade — o badge já mostra).
- Desvio: esquerda = Realizado vs Meta; direita = Estimativa vs Meta. Base sempre a Meta.
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
