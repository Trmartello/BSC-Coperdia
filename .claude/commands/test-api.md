# Agente: test-api — Testar Endpoints da API

Você é o agente de testes da API do BSC Copérdia. Executa uma bateria de testes nos principais endpoints e reporta o status de cada um.

## Executar todos os testes

### 1. Autenticação
```bash
echo "=== AUTH ==="
# Login com credenciais válidas
RESP=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@coperdia.com.br","password":"admin123"}')
TOKEN=$(echo $RESP | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
echo "Login admin: $([ ${#TOKEN} -gt 20 ] && echo ✅ || echo ❌)"

# Login com senha errada
BAD=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@coperdia.com.br","password":"errada"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('statusCode',0))" 2>/dev/null)
echo "Rejeita senha errada: $([ "$BAD" = "401" ] && echo ✅ || echo ❌ ) (status: $BAD)"
```

### 2. Indicadores
```bash
echo "=== INDICATORS ==="
INDS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/indicators)
COUNT=$(echo $INDS | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "Listar indicadores: $([ $COUNT -gt 0 ] && echo ✅ || echo ❌) ($COUNT encontrados)"

IND_ID=$(echo $INDS | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)
SINGLE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/v1/indicators/$IND_ID" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('code',''))" 2>/dev/null)
echo "Buscar por ID: $([ -n "$SINGLE" ] && echo ✅ || echo ❌) (code: $SINGLE)"

CHAIN=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/v1/indicators/$IND_ID/impact-chain" \
  | python3 -c "import sys,json; print(type(json.load(sys.stdin)).__name__)" 2>/dev/null)
echo "Impact chain: $([ "$CHAIN" = "list" ] && echo ✅ || echo ❌)"
```

### 3. Mapas
```bash
echo "=== MAPS ==="
CATS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/maps/categories \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "Listar categorias: $([ $CATS -gt 0 ] && echo ✅ || echo ❌) ($CATS encontradas)"

MAPS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/maps \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "Listar mapas: $([ $MAPS -gt 0 ] && echo ✅ || echo ❌) ($MAPS encontrados)"

MAP_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/maps \
  | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])" 2>/dev/null)
MAP_DETAIL=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/v1/maps/$MAP_ID" \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('name',''))" 2>/dev/null)
echo "Buscar mapa por ID: $([ -n "$MAP_DETAIL" ] && echo ✅ || echo ❌) ($MAP_DETAIL)"
```

### 4. Planos de Ação
```bash
echo "=== ACTION PLANS ==="
PLANS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/action-plans \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "Listar planos: $([ "$PLANS" != "" ] && echo ✅ || echo ❌) ($PLANS encontrados)"

DASH=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/action-plans/dashboard \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(type(d).__name__)" 2>/dev/null)
echo "Dashboard planos: $([ "$DASH" = "dict" ] && echo ✅ || echo ❌)"
```

### 5. Usuários
```bash
echo "=== USERS ==="
USERS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/users \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "Listar usuários: $([ $USERS -gt 0 ] && echo ✅ || echo ❌) ($USERS encontrados)"
```

### 6. Cenários
```bash
echo "=== SCENARIOS ==="
SCENS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/scenarios \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
echo "Listar cenários: $([ "$SCENS" != "" ] && echo ✅ || echo ❌) ($SCENS encontrados)"
```

### 7. Settings
```bash
echo "=== SETTINGS ==="
SYS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/settings \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('system',{}).get('version',''))" 2>/dev/null)
echo "System info: $([ -n "$SYS" ] && echo ✅ || echo ❌) (v$SYS)"
```

### 8. Proteção de rotas
```bash
echo "=== PROTEÇÃO ==="
UNAUTH=$(curl -s http://localhost:3001/api/v1/indicators \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('statusCode',0))" 2>/dev/null)
echo "Rejeita sem token: $([ "$UNAUTH" = "401" ] && echo ✅ || echo ❌) (status: $UNAUTH)"
```

## Relatório Final

Após rodar todos os testes, produza um sumário:

```
╔════════════════════════════════════╗
║  BSC Copérdia — API Health Check   ║
╠════════════════════════════════════╣
║  Auth         ✅  2/2 testes       ║
║  Indicators   ✅  3/3 testes       ║
║  Maps         ✅  3/3 testes       ║
║  Action Plans ✅  2/2 testes       ║
║  Users        ✅  1/1 testes       ║
║  Scenarios    ✅  1/1 testes       ║
║  Settings     ✅  1/1 testes       ║
║  Segurança    ✅  1/1 testes       ║
╠════════════════════════════════════╣
║  Total:  14/14 ✅  API saudável    ║
╚════════════════════════════════════╝
```

Se houver falhas, liste cada uma com o erro recebido e sugestão de diagnóstico.
