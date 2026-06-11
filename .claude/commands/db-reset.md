# Agente: db-reset — Resetar Banco de Dados

Você é o agente de reset de banco de dados do BSC Copérdia. Sua responsabilidade é limpar completamente o banco, reaplicar todas as migrações e popular com os dados de seed.

**ATENÇÃO**: Este comando **apaga todos os dados** do banco. Confirme com o usuário antes de prosseguir se o contexto não deixar claro que ele já sabe disso.

## Passos

### 1. Garantir que o PostgreSQL está rodando
```bash
sudo pg_ctlcluster 16 main start 2>/dev/null; sleep 1
sudo -u postgres psql -c "SELECT 1;" 2>&1 | grep -q "1 row" && echo "PG OK" || echo "PG FALHOU"
```

### 2. Reset completo com Prisma
```bash
cd /home/user/BSC-Coperdia/apps/api
npx prisma migrate reset --force 2>&1
```
Este comando: apaga o banco, recria, aplica todas as migrações.

Se falhar por problema de conexão, tente recriar o banco manualmente:
```bash
sudo -u postgres psql -c "DROP DATABASE IF EXISTS bsc_coperdia;"
sudo -u postgres psql -c "CREATE DATABASE bsc_coperdia OWNER postgres;"
npx prisma migrate deploy
```

### 3. Gerar o Prisma Client
```bash
npx prisma generate 2>&1 | tail -3
```

### 4. Rodar o seed
```bash
npx ts-node --esm prisma/seed.ts 2>&1
```
Confirme que imprimiu "✅ Seed concluído!".

### 5. Verificar dados inseridos
```bash
sudo -u postgres psql -d bsc_coperdia -c "
SELECT 
  (SELECT count(*) FROM users) as usuarios,
  (SELECT count(*) FROM indicators) as indicadores,
  (SELECT count(*) FROM indicator_maps) as mapas,
  (SELECT count(*) FROM action_plans) as planos,
  (SELECT count(*) FROM scenarios) as cenarios;
"
```

### 6. Recompilar e reiniciar a API (se estiver rodando)
```bash
pkill -f "node.*dist/main" 2>/dev/null; sleep 1
cd /home/user/BSC-Coperdia/apps/api
/home/user/BSC-Coperdia/node_modules/.bin/nest build 2>&1 | tail -3
node /home/user/BSC-Coperdia/apps/api/dist/main.js &> /tmp/bsc-api.log &
sleep 3
grep -q "successfully started" /tmp/bsc-api.log && echo "API OK" || echo "API com problema"
```

## Relatório Final

```
✅ Banco de dados resetado com sucesso

  Usuários:     2  (admin@coperdia.com.br / admin123)
  Indicadores:  4  (PMR, PME, PMP, NCG)
  Mapas:        5
  Planos:       1
  Cenários:     1  (Cenário Base 2026)

  API reiniciada → localhost:3001
```
