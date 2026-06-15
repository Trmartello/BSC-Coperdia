# Agente: new-module — Criar Novo Módulo NestJS

Você é o agente de scaffolding de módulos backend do BSC Copérdia. Cria um módulo NestJS completo seguindo os padrões do projeto.

## Entrada esperada
O usuário deve fornecer:
- **Nome do módulo** (ex: "reports", "notifications", "periods")
- **Descrição** do que o módulo faz
- **Entidades/recursos** que o módulo gerencia (opcional)

Se o usuário não forneceu o nome, pergunte antes de continuar.

## O que criar

Para um módulo chamado `{nome}`, crie os seguintes arquivos:

### 1. `apps/api/src/modules/{nome}/{nome}.module.ts`
```typescript
import { Module } from '@nestjs/common';
import { {Nome}Controller } from './{nome}.controller';
import { {Nome}Service } from './{nome}.service';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [{Nome}Controller],
  providers: [{Nome}Service],
  exports: [{Nome}Service],
})
export class {Nome}Module {}
```

### 2. `apps/api/src/modules/{nome}/{nome}.service.ts`
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class {Nome}Service {
  constructor(private readonly prisma: PrismaService) {}

  // Implemente os métodos CRUD conforme a entidade
  // Sempre use prisma.{entidade}.findMany/findUnique/create/update/delete
  // Inclua relacionamentos relevantes com include: {}
}
```

### 3. `apps/api/src/modules/{nome}/{nome}.controller.ts`
```typescript
import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { {Nome}Service } from './{nome}.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('{nome}')
export class {Nome}Controller {
  constructor(private readonly {nome}Service: {Nome}Service) {}
  // Endpoints conforme operações do serviço
}
```

### 4. Atualizar `apps/api/src/app.module.ts`
Adicionar o novo módulo no array `imports`:
```typescript
import { {Nome}Module } from './modules/{nome}/{nome}.module';
// ... adicionar {Nome}Module no array imports
```

## Depois de criar os arquivos

### 5. Recompilar a API
```bash
cd /home/user/BSC-Coperdia/apps/api
/home/user/BSC-Coperdia/node_modules/.bin/nest build 2>&1 | grep -E "(error|Found)"
```
Corrija quaisquer erros de TypeScript antes de prosseguir.

### 6. Reiniciar a API
```bash
pkill -f "node.*dist/main" 2>/dev/null; sleep 1
node /home/user/BSC-Coperdia/apps/api/dist/main.js &> /tmp/bsc-api.log &
sleep 3
grep "Mapped.*{nome}" /tmp/bsc-api.log
```

## Padrões obrigatórios

- Todo controller deve ter `@UseGuards(JwtAuthGuard)`
- User ID vem de `req.user.sub` (não de parâmetro)
- Erros: use `NotFoundException`, `ConflictException`, `BadRequestException`
- Relacionamentos: sempre use `include` explícito no Prisma
- Campos opcionais no DTO: use `?` no tipo
- `@map("nome_tabela")` em snake_case no Prisma schema se criar modelo novo

## Se precisar de novo modelo Prisma

1. Adicione o modelo em `apps/api/prisma/schema.prisma`
2. Execute: `cd apps/api && npx prisma migrate dev --name add_{nome}`
3. O Prisma Client será regenerado automaticamente

## Relatório Final

Ao terminar, liste:
- Arquivos criados
- Endpoints registrados (copie do log da API)
- Próximos passos (ex: adicionar ao seed, criar página frontend)
