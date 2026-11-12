# syntax=docker/dockerfile:1
# Debian (glibc), not Alpine: the ONNX runtime used by the on-server profile photo check
# (onnxruntime-node) ships glibc binaries only.
FROM node:22-bookworm-slim AS base
RUN npm install -g pnpm@9
WORKDIR /app

# Development stage
FROM base AS development
COPY package.json pnpm-lock.yaml* ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY pnpm-workspace.yaml ./
RUN --mount=type=cache,id=agap-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
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
RUN --mount=type=cache,id=agap-pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
WORKDIR /app/backend
RUN pnpm db:generate
RUN pnpm build

# Production stage
FROM node:22-bookworm-slim AS production
RUN npm install -g pnpm
WORKDIR /app
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/prisma ./prisma
ENV NODE_ENV=production
# Downloaded once on first start (~150 MB). Mount a volume here to keep it across deploys.
ENV PROFILE_PHOTO_MODEL_DIR=/app/.cache/models
EXPOSE 3000
CMD ["node", "dist/main"]
