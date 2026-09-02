# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# openssl must be present in every stage that touches Prisma: the CLI picks its
# query-engine build from the detected libssl version, so a build stage without
# it would bake in an engine the runtime stage then tries to re-download.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client (output: src/generated/prisma) before building.
RUN npx prisma generate
# Dummy build-time env only satisfies module-load guards during `next build`;
# real values are injected at runtime via compose. No secrets baked in.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXTAUTH_SECRET="build"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV GOOGLE_CLIENT_ID="build"
ENV GOOGLE_CLIENT_SECRET="build"
RUN npm run build

# The Prisma CLI is only needed to apply migrations at container start. Rather
# than drag the whole 600MB dev tree into the runtime image (or hand-pick
# packages and miss transitive deps like valibot), install just the CLI at the
# exact lockfile version into an isolated prefix, and copy that tree in.
FROM base AS migrator
COPY package-lock.json ./
RUN PRISMA_VERSION="$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version")" \
  && rm -f package-lock.json \
  && npm init -y > /dev/null \
  && npm install --no-audit --no-fund --omit=dev \
       "prisma@${PRISMA_VERSION}" dotenv
# NOTE: the Studio dependency stack (effect, electric-sql, lodash, ...) looks
# prunable but is not — the CLI requires @prisma/studio-core/data/bff eagerly
# at startup, even for `migrate deploy`. Removing it breaks the entrypoint.

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV STORAGE_DIR=/app/storage
# Docker sets HOSTNAME to the container id, and Next's standalone server binds
# to it verbatim — which makes the app unreachable on localhost inside the
# container (breaking the healthcheck). Pin it to all interfaces.
ENV HOSTNAME=0.0.0.0

# openssl must match the build stages so Prisma resolves the same engine build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Next standalone server + assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Local Tesseract traineddata (no runtime CDN fetch)
COPY --from=builder /app/tessdata ./tessdata

# Prisma schema + migrations + CLI so the entrypoint can run `migrate deploy`.
# The CLI tree is merged into the standalone server's node_modules so that
# prisma.config.ts can resolve "prisma/config" and "dotenv/config" from /app.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=migrator /app/node_modules ./node_modules

COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/storage \
  && chown -R nextjs:nodejs /app/storage /app/node_modules/@prisma

# Persist uploads + results outside the image layers
VOLUME ["/app/storage"]

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
