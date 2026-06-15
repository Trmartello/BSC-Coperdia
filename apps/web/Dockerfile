# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/web/package.json ./apps/web/
RUN npm install --legacy-peer-deps

COPY tsconfig.base.json ./
COPY apps/web ./apps/web

# NEXT_PUBLIC_* é embutido em tempo de build — passar via --build-arg no Railway
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /app/apps/web
RUN npx next build

# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app

# Saída standalone do Next (server.js fica em apps/web/server.js no monorepo)
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
