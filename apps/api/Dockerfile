# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Dependências (node_modules é hoisted para a raiz no monorepo)
COPY package*.json ./
COPY apps/api/package.json ./apps/api/
RUN npm install --legacy-peer-deps

# Código + Prisma
COPY tsconfig.base.json ./
COPY apps/api ./apps/api

WORKDIR /app/apps/api
RUN npx prisma generate
RUN /app/node_modules/.bin/nest build
# Compila o seed para JS (evita ts-node em produção: ERR_UNKNOWN_FILE_EXTENSION)
RUN npx tsc prisma/seed.ts --outDir dist-seed --module commonjs --target es2019 --esModuleInterop --skipLibCheck --resolveJsonModule

# ---- Runtime stage ----
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app

# node_modules hoisted (inclui @prisma/client + cliente gerado em .prisma)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/dist-seed ./dist-seed
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/package.json ./

ENV NODE_ENV=production
EXPOSE 3001

# Aplica migrações e semeia o banco SE estiver vazio (ambos idempotentes e
# NÃO-fatais: uma falha aqui não pode impedir o boot da API, senão o health
# check falha e o Railway mantém o build ANTIGO no ar).
CMD ["sh", "-c", "(npx prisma migrate deploy || echo '⚠️  migrate failed, continuing') && (SEED_ONLY_IF_EMPTY=true node dist-seed/seed.js || echo '⚠️  seed step failed, continuing') && node dist/main.js"]
