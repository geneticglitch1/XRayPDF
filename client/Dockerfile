# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `prebuild` stages the pdf.js worker and the Tesseract core/WASM out of
# node_modules into public/, so the app serves them from its own origin
# instead of a CDN. Nothing here needs env vars: the app has no database, no
# auth and no server-side processing, so there is nothing to configure.
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Docker sets HOSTNAME to the container id, and Next's standalone server binds
# to it verbatim — which makes the app unreachable on localhost inside the
# container (breaking the healthcheck). Pin it to all interfaces.
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Next standalone server + assets. public/ carries the OCR model and WASM, so
# it is the bulk of the image.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# No entrypoint script: there are no migrations to run and no volume to set up.
CMD ["node", "server.js"]
