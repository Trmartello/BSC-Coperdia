FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/web/package.json ./apps/web/
RUN npm install --legacy-peer-deps

COPY apps/web ./apps/web
COPY tsconfig.base.json ./

WORKDIR /app/apps/web
RUN npx next build

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
