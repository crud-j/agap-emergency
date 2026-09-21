FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

# Development stage
FROM base AS development
COPY package.json pnpm-lock.yaml* ./
COPY backend/package.json ./backend/
COPY shared/package.json ./shared/
COPY pnpm-workspace.yaml ./
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
RUN pnpm install --frozen-lockfile
COPY . .
WORKDIR /app/backend
RUN pnpm db:generate
RUN pnpm build

# Production stage
FROM node:20-alpine AS production
RUN npm install -g pnpm
WORKDIR /app
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/prisma ./prisma
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main"]
