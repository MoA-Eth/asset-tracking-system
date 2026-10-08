# ── Stage 1: Build the Node.js API ───────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app/backend

# Prisma needs OpenSSL to pick the right database engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# ── Stage 2: Run ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app/backend

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# The Prisma command line and tsx stay in the image: start-up uses them to prepare the
# database and create the first administrator, and the upgrade scripts run with them
COPY --from=builder /app/backend/node_modules node_modules
COPY --from=builder /app/backend/package.json package.json
COPY --from=builder /app/backend/tsconfig.json tsconfig.json
COPY --from=builder /app/backend/prisma prisma
COPY --from=builder /app/backend/src src
COPY --from=builder /app/backend/dist dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Scanned slips are written here; a volume keeps them when the container is replaced
RUN mkdir -p uploads/slips && chown -R node:node uploads && chmod +x /usr/local/bin/docker-entrypoint.sh
VOLUME /app/backend/uploads

# Reported by /api/health. Set last, so a new version doesn't rebuild the layers above.
ARG APP_VERSION=dev
ARG APP_COMMIT=dev
ENV APP_VERSION=$APP_VERSION \
    APP_COMMIT=$APP_COMMIT

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
