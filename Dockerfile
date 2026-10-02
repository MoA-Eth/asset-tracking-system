# Asset Tracking System: one image that serves the web app and the API.
#
#   docker compose up -d --build
#
# See docs/DEPLOYMENT.md, "Docker".

# ── Build: compile the API and the web app ────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Prisma needs OpenSSL to pick the right database engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# Dependencies first, so they are only reinstalled when a lock file changes
COPY backend/package.json backend/package-lock.json backend/
RUN npm ci --prefix backend
COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm ci --prefix frontend

COPY backend backend
COPY frontend frontend
RUN cd backend && npx prisma generate && npm run build
RUN npm run build --prefix frontend

# ── Run ───────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app/backend

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

# The Prisma command line and tsx stay in the image: the start-up step uses them to
# prepare the database and to create the first administrator
COPY --from=build /app/backend/node_modules node_modules
COPY --from=build /app/backend/package.json package.json
COPY --from=build /app/backend/tsconfig.json tsconfig.json
COPY --from=build /app/backend/prisma prisma
COPY --from=build /app/backend/src src
COPY --from=build /app/backend/dist dist
COPY --from=build /app/frontend/dist /app/frontend/dist
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# Scanned slips are written here; mount a volume on it so they outlive the container
RUN mkdir -p uploads/slips && chown -R node:node uploads && chmod +x /usr/local/bin/entrypoint.sh
VOLUME /app/backend/uploads

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "dist/server.js"]
