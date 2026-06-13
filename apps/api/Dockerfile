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

# ---- Runtime stage ----
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app

# node_modules hoisted (inclui @prisma/client + cliente gerado em .prisma)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/package.json ./

ENV NODE_ENV=production
EXPOSE 3001

# Aplica migrações e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
