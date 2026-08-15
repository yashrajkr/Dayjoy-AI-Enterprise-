# backend/Dockerfile — NestJS backend (production-optimized)
# Multi-stage build with layer caching optimization

FROM node:20-slim AS base

# Install system dependencies once
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl openssl python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install pnpm globally
RUN npm install -g pnpm@9.15.0 && npm cache clean --force

# ===== Stage 1: Dependencies Layer =====
FROM base AS dependencies

WORKDIR /app

# Copy workspace config files (minimal, cacheable layer)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Install dependencies only
RUN pnpm install --frozen-lockfile --prefer-offline

# ===== Stage 2: Source & Build =====
FROM dependencies AS builder

WORKDIR /app

# Copy source code
COPY backend/ ./backend/
COPY packages/ ./packages/
COPY shared/ ./shared/
COPY database/ ./database/

# Build backend
RUN pnpm --filter backend run build

# ===== Stage 3: Runtime =====
FROM base AS runtime

# Create non-root user for security
RUN groupadd --system --gid 1001 dayjoy && \
    useradd --system --uid 1001 --gid dayjoy --create-home dayjoy

WORKDIR /app

# Copy node_modules from dependencies stage (faster, pruned)
COPY --from=dependencies --chown=dayjoy:dayjoy /app/node_modules ./node_modules

# Copy compiled backend
COPY --from=builder --chown=dayjoy:dayjoy /app/backend/dist ./backend/dist
COPY --from=builder --chown=dayjoy:dayjoy /app/backend/package.json ./backend/package.json

# Copy shared dependencies
COPY --from=builder --chown=dayjoy:dayjoy /app/packages ./packages
COPY --from=builder --chown=dayjoy:dayjoy /app/shared ./shared
COPY --from=builder --chown=dayjoy:dayjoy /app/database ./database

# Setup environment
USER dayjoy
ENV NODE_ENV=production \
    NODE_PATH=/app/node_modules:/app/backend/node_modules \
    PATH=/app/node_modules/.bin:$PATH

EXPOSE 3000

# Health check
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start backend
CMD ["node", "backend/dist/main.js"]
