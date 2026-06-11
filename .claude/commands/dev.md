# Agente: dev — Iniciar Ambiente de Desenvolvimento

Você é o agente de inicialização do BSC Copérdia. Sua responsabilidade é garantir que todo o ambiente de desenvolvimento esteja rodando corretamente: banco de dados, API e frontend.

## Sequência de inicialização

Execute os seguintes passos **em ordem**, verificando cada um antes de prosseguir:

### 1. Verificar e iniciar o PostgreSQL
```bash
pg_lsclusters
```
- Se status for `down`, execute: `sudo pg_ctlcluster 16 main start`
- Aguarde 2 segundos e confirme com: `sudo -u postgres psql -c "SELECT 1;"`

### 2. Verificar se a API já está rodando
```bash
curl -s http://localhost:3001/api/v1/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"x","password":"x"}' | head -c 50
```
- Se retornar qualquer JSON, a API já está no ar — pule para o passo 4
- Se falhar, continue para o passo 3

### 3. Iniciar a API NestJS
Primeiro verifique se o build existe:
```bash
ls /home/user/BSC-Coperdia/apps/api/dist/main.js 2>/dev/null || echo "NO_BUILD"
```
Se não existir, compile:
```bash
cd /home/user/BSC-Coperdia/apps/api && /home/user/BSC-Coperdia/node_modules/.bin/nest build
```
Depois inicie:
```bash
node /home/user/BSC-Coperdia/apps/api/dist/main.js &> /tmp/bsc-api.log &
sleep 3
tail -5 /tmp/bsc-api.log
```
Confirme que imprimiu "Nest application successfully started" e "API running on port 3001".

### 4. Verificar se o frontend já está rodando
```bash
curl -s http://localhost:3000 | head -c 100
```
- Se retornar HTML, o frontend já está no ar — pule para o relatório final
- Se falhar, inicie o frontend

### 5. Iniciar o frontend Next.js
```bash
cd /home/user/BSC-Coperdia/apps/web && npx next dev -p 3000 &> /tmp/bsc-web.log &
sleep 8
tail -5 /tmp/bsc-web.log
```
Confirme que imprimiu "Ready in".

### 6. Teste de sanidade final
```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@coperdia.com.br","password":"admin123"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('accessToken','ERRO'))")

echo "Login: $([ ${#TOKEN} -gt 20 ] && echo OK || echo FALHOU)"

# Indicadores
COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/indicators | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
echo "Indicadores no banco: $COUNT"
```

## Relatório Final

Ao concluir, imprima um resumo como este:

```
✅ Ambiente BSC Copérdia inicializado

  PostgreSQL  → localhost:5432   [OK]
  API         → localhost:3001   [OK]
  Frontend    → localhost:3000   [OK]

  Login: admin@coperdia.com.br / admin123
  Indicadores no banco: 4

  Acesse: http://localhost:3000
```

Se qualquer serviço falhar, mostre o erro e sugira a correção específica.
