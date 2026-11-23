# syntax=docker/dockerfile:1
# Debian (glibc), not Alpine: the ONNX runtime used by the on-server profile photo check
# (onnxruntime-node) ships glibc binaries only.
FROM node:22-bookworm-slim AS base
# openssl: the Prisma CLI's schema engine (prisma migrate deploy) needs it; the slim image has none.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# pnpm version comes from "packageManager" in the root package.json (one place for it).
# pnpm-workspace.yaml uses pnpm 11 settings (allowBuilds), which older pnpm ignores.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY package.json ./
RUN corepack enable && corepack install

# Development stage
FROM base AS development
COPY package.json pnpm-lock.yaml* ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY pnpm-workspace.yaml ./
# The backend's postinstall runs `prisma generate`, which needs the schema and config.
COPY backend/prisma.config.ts ./backend/
COPY backend/prisma ./backend/prisma
# No --mount=type=cache: Railway validates every stage, not only the one it builds,
# and rejects cache mounts whose id is not prefixed with its service id.
RUN pnpm install --frozen-lockfile
COPY . .
WORKDIR /app/backend
RUN pnpm db:generate
CMD ["pnpm", "start:dev"]

# Build stage
FROM base AS build
COPY package.json pnpm-lock.yaml* ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY pnpm-workspace.yaml ./
# The backend's postinstall runs `prisma generate`, which needs the schema and config.
COPY backend/prisma.config.ts ./backend/
COPY backend/prisma ./backend/prisma
# No --mount=type=cache (see the development stage).
RUN pnpm install --frozen-lockfile
COPY . .
# The backend imports @agap/shared from shared/dist (gitignored, not built on install).
RUN pnpm --filter @agap/shared build
WORKDIR /app/backend
RUN pnpm db:generate
RUN pnpm build

# Production stage
# Copies the whole workspace. pnpm's node_modules entries are links into
# /app/node_modules/.pnpm and /app/shared, so copying backend/node_modules alone
# breaks them. Dev dependencies stay, which keeps the Prisma CLI and ts-node for
# `prisma migrate deploy` (Railway pre-deploy) and the seed. Bigger image; a slimmer
# `pnpm deploy --prod` build is a later follow-up (deployment plan, Phase 7).
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/backend
# Downloaded once on first start (~150 MB). Mount a volume here to keep it across deploys.
ENV PROFILE_PHOTO_MODEL_DIR=/app/.cache/models
EXPOSE 3000
CMD ["node", "dist/main"]
