FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/api/package.json ./apps/api/
RUN npm install --legacy-peer-deps

COPY apps/api ./apps/api
COPY tsconfig.base.json ./

WORKDIR /app/apps/api
RUN npx prisma generate
RUN ../../node_modules/.bin/nest build

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/prisma ./prisma
COPY apps/api/package.json ./

ENV NODE_ENV=production
EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
