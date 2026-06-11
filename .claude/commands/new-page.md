# Agente: new-page — Criar Nova Página Next.js

Você é o agente de scaffolding de páginas frontend do BSC Copérdia. Cria páginas Next.js seguindo rigorosamente o estilo visual e padrões de código do projeto.

## Entrada esperada
- **Nome/rota** da página (ex: "reports", "dashboard/kpis")
- **Descrição** do que a página exibe
- **Endpoint da API** que ela consome (se houver)

Se o usuário não forneceu o nome, pergunte.

## Padrões visuais obrigatórios

### Tema dark
```
bg-[#0d0f17]   → fundo da página (já aplicado pelo layout)
bg-[#1a1f2e]   → cards e painéis
border-white/10 → bordas sutis
text-white/80   → texto principal
text-white/40   → texto secundário
text-white/25   → texto muito sutil
```

### Estrutura padrão de página
```tsx
'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { /* ícones lucide-react */ } from 'lucide-react';
import { /* api client */ } from '../../../lib/api';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

export default function NomePage() {
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['chave-unica'],
    queryFn: () => algumApi.list().then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Título da Página</h1>
          <p className="text-sm text-white/40 mt-0.5">Subtítulo descritivo</p>
        </div>
        {/* botão de ação principal */}
      </div>

      {/* Conteúdo principal */}
    </div>
  );
}
```

### Componentes de UI reutilizáveis
- **Card**: `bg-[#1a1f2e] border border-white/10 rounded-2xl p-4`
- **Input**: use classe `input-dark` (definida em globals.css)
- **Botão primário**: `px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm text-white font-medium`
- **Botão secundário**: `px-4 py-2 rounded-xl border border-white/10 text-sm text-white/60 hover:bg-white/5`
- **Badge**: `text-[10px] px-2 py-0.5 rounded-full border` + cor específica
- **Tabela**: `table w-full` com `divide-y divide-white/5` nas linhas
- **Modal**: overlay `bg-black/60 backdrop-blur-sm` + card `bg-[#1a1f2e] border border-white/10 rounded-2xl`
- **Loading skeleton**: `animate-pulse bg-[#1a1f2e] rounded-2xl`

### Cores de status (padrão do projeto)
```
Sucesso/Ativo:   bg-emerald-500/10 text-emerald-400 border-emerald-500/20
Atenção:         bg-amber-500/10   text-amber-400   border-amber-500/20
Erro/Crítico:    bg-red-500/10     text-red-400     border-red-500/20
Info/Neutro:     bg-blue-500/10    text-blue-400    border-blue-500/20
Inativo:         bg-white/5        text-white/30    border-white/10
Ação/Primário:   bg-purple-500/10  text-purple-400  border-purple-500/20
```

## Passos de implementação

### 1. Criar o arquivo da página
Caminho: `apps/web/src/app/dashboard/{rota}/page.tsx`

### 2. Criar componentes auxiliares (se necessário)
Caminho: `apps/web/src/components/{categoria}/NomeComponente.tsx`

### 3. Adicionar endpoint na api.ts (se necessário)
Adicionar em `apps/web/src/lib/api.ts` seguindo o padrão existente:
```typescript
export const nomeApi = {
  list: () => api.get('/rota'),
  get: (id: string) => api.get(`/rota/${id}`),
  create: (data: any) => api.post('/rota', data),
  update: (id: string, data: any) => api.patch(`/rota/${id}`, data),
  remove: (id: string) => api.delete(`/rota/${id}`),
};
```

### 4. Adicionar item na Sidebar
Se for uma nova seção principal, adicionar em `apps/web/src/components/ui/Sidebar.tsx`:
```typescript
{ label: 'Nome', href: '/dashboard/{rota}', icon: IconeLucide },
```

## Verificação
Após criar, verifique se o Next.js compila sem erros:
```bash
# O servidor já está rodando, verifique os logs
tail -20 /tmp/bsc-web.log
```

## Relatório Final
- Arquivo criado: `apps/web/src/app/dashboard/{rota}/page.tsx`
- Componentes criados (se houver)
- Modificações em `api.ts` e `Sidebar.tsx`
- URL de acesso: `http://localhost:3000/dashboard/{rota}`
