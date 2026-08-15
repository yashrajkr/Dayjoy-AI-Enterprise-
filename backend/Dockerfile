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
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# Copy all source directories (backend imports rag/, vapi/, and whatsapp-ai/
# as sibling modules via ../rag, ../vapi, ../whatsapp-ai — see backend/tsconfig.json paths)
COPY backend/ ./backend/
COPY packages/ ./packages/
COPY shared/ ./shared/
COPY database/ ./database/
COPY rag/ ./rag/
COPY vapi/ ./vapi/
COPY whatsapp-ai/ ./whatsapp-ai/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma Client (schema lives outside backend/, so it is never
# picked up by @prisma/client's automatic postinstall detection).
# Pinned to 6.x: the schema uses the Prisma 6 `datasource.url` syntax, which
# the Prisma 7 CLI (devDependency at the repo root) rejects.
RUN npx prisma@6.19.3 generate --schema database/prisma/schema.prisma

# Build backend
WORKDIR /app/backend
RUN pnpm run build

# ===== Stage 2: Runner =====
FROM base AS runner

# Create non-root user
RUN groupadd --system --gid 1001 dayjoy && \
    useradd --system --uid 1001 --gid dayjoy --create-home dayjoy

WORKDIR /app

# Copy from builder
COPY --from=builder --chown=dayjoy:dayjoy /app/node_modules ./node_modules
COPY --from=builder --chown=dayjoy:dayjoy /app/backend/node_modules ./backend/node_modules
COPY --from=builder --chown=dayjoy:dayjoy /app/backend/dist ./backend/dist
COPY --from=builder --chown=dayjoy:dayjoy /app/backend/package.json ./backend/package.json
COPY --from=builder --chown=dayjoy:dayjoy /app/packages ./packages
COPY --from=builder --chown=dayjoy:dayjoy /app/shared ./shared
COPY --from=builder --chown=dayjoy:dayjoy /app/database ./database

# Switch to non-root user
USER dayjoy

WORKDIR /app

ENV NODE_ENV=production
ENV NODE_PATH=/app/node_modules:/app/backend/node_modules
ENV PATH=/app/node_modules/.bin:$PATH

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=5 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start backend - tsconfig rootDir is the repo root (".."), so tsc mirrors
# the repo layout under dist/: backend/dist/backend/main.js, plus the
# compiled rag/vapi/whatsapp-ai sibling sources it pulled in.
CMD ["node", "backend/dist/backend/main.js"]
