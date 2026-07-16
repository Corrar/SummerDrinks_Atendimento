# Backend Summer Drinks — imagem para Render/Fly/etc (processo persistente:
# Express + Socket.IO + OutboxWorker rodam no mesmo Node, sem serverless).
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Dependências de runtime apenas (sem devDeps: tsc, vitest, tsx...)
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY db ./db
COPY scripts ./scripts
# Health check batendo /health (endpoint definido em src/app.ts)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health || exit 1
EXPOSE 3000
CMD ["node", "dist/server.js"]
