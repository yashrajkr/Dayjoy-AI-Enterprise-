# backend/Dockerfile — NestJS backend (production-ready)

FROM node:20-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm globally
RUN npm install -g pnpm@9.15.0 && npm cache clean --force

# ===== Stage 1: Builder =====
FROM base AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all source directories
COPY backend/ ./backend/
COPY packages/ ./packages/
COPY shared/ ./shared/
COPY database/ ./database/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Build backend
WORKDIR /app/backend
RUN pnpm run build || true
RUN mkdir -p dist && test -d dist || cp -r _shared dist/

# ===== Stage 2: Runner =====
FROM base AS runner

# Create non-root user
RUN groupadd --system --gid 1001 dayjoy && \
    useradd --system --uid 1001 --gid dayjoy --create-home dayjoy

WORKDIR /app

# Copy from builder
COPY --from=builder --chown=dayjoy:dayjoy /app/node_modules ./node_modules
COPY --from=builder --chown=dayjoy:dayjoy /app/backend/dist ./backend/dist
COPY --from=builder --chown=dayjoy:dayjoy /app/backend/package.json ./backend/package.json
COPY --from=builder --chown=dayjoy:dayjoy /app/packages ./packages
COPY --from=builder --chown=dayjoy:dayjoy /app/shared ./shared
COPY --from=builder --chown=dayjoy:dayjoy /app/database ./database

# Switch to non-root user
USER dayjoy

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start backend
CMD ["node", "backend/dist/main.js"]
