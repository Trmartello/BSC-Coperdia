# Agente: build-check — Verificar Build Completo

Você é o agente de verificação de qualidade do BSC Copérdia. Verifica se o código TypeScript compila sem erros em ambos os projetos (API e Frontend).

## Passos

### 1. Verificar tipos da API (NestJS)
```bash
echo "=== API Build ==="
cd /home/user/BSC-Coperdia/apps/api
/home/user/BSC-Coperdia/node_modules/.bin/nest build 2>&1
```
- Se retornar sem erros → ✅
- Se retornar erros TypeScript → liste-os e corrija um por um

### 2. Verificar tipos do Frontend (Next.js)
```bash
echo "=== Frontend Type Check ==="
cd /home/user/BSC-Coperdia/apps/web
npx tsc --noEmit 2>&1
```
- Se retornar sem saída → ✅
- Se retornar erros → liste-os e corrija

### 3. Verificar se API sobe após build
```bash
pkill -f "node.*dist/main" 2>/dev/null; sleep 1
node /home/user/BSC-Coperdia/apps/api/dist/main.js &> /tmp/bsc-build-check.log &
sleep 3
grep -q "successfully started" /tmp/bsc-build-check.log && echo "✅ API inicia ok" || echo "❌ API falhou ao iniciar"
cat /tmp/bsc-build-check.log | grep -i "error" | head -5
```

### 4. Verificar imports ausentes no frontend
```bash
cd /home/user/BSC-Coperdia/apps/web
grep -r "from '.*'" src/ --include="*.tsx" --include="*.ts" | \
  grep -v "node_modules" | \
  python3 -c "
import sys, re
imports = set()
for line in sys.stdin:
    m = re.search(r\"from '([^']+)'\", line)
    if m:
        mod = m.group(1)
        if not mod.startswith('.') and not mod.startswith('@/'):
            imports.add(mod)
# Apenas externos ao projeto
external = [i for i in imports if not i.startswith('next') and not i.startswith('react')]
print('Imports externos detectados:')
for i in sorted(external)[:20]:
    print(f'  {i}')
"
```

### 5. Verificar consistência da api.ts
Confira se todos os módulos do backend têm cliente correspondente em `api.ts`:
```bash
echo "Módulos backend:"
ls /home/user/BSC-Coperdia/apps/api/src/modules/

echo "Clientes em api.ts:"
grep "^export const.*Api" /home/user/BSC-Coperdia/apps/web/src/lib/api.ts
```

## Correção automática de erros comuns

### Erro: "Property has no initializer"
Confirme que `apps/api/tsconfig.json` tem:
```json
"strictPropertyInitialization": false
```

### Erro: "Cannot find module X"
```bash
cd /home/user/BSC-Coperdia && npm install X --legacy-peer-deps
```

### Erro: "Type 'any' is not assignable"
Adicione tipagem explícita ou use `as any` temporariamente.

## Relatório Final

```
╔══════════════════════════════════╗
║  BSC Copérdia — Build Check      ║
╠══════════════════════════════════╣
║  API TypeScript    ✅  0 erros   ║
║  Web TypeScript    ✅  0 erros   ║
║  API inicializa    ✅  OK        ║
╠══════════════════════════════════╣
║  Resultado:  PRONTO PARA DEPLOY  ║
╚══════════════════════════════════╝
```
