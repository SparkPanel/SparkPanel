# syntax=docker/dockerfile:1

# ---------- сборка ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- рантайм ----------
FROM node:22-alpine
# python3 нужен для Python-плагинов, tini — корректная обработка сигналов
RUN apk add --no-cache tini python3
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5000 \
    DATA_DIR=/app/data \
    PLUGINS_DIR=/app/plugins \
    MIGRATIONS_DIR=/app/migrations

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/plugins ./plugins

VOLUME ["/app/data", "/app/plugins"]
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/settings/panel >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
