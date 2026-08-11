# ============================================
# Dayjoy Voice AI — Production Dockerfile
# ============================================
#
# Multi-stage build:
#   1. `builder`  — installs deps + compiles TypeScript → dist/
#   2. `production` — slim runtime with only dist/ + node_modules/
#
# The image runs as non-root user `nodejs` (UID 1001) per security
# policy. Healthcheck hits /health/ready so Kubernetes can use the
# same endpoint for livenessProbe + readinessProbe.

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@9

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/
COPY vapi/package.json ./vapi/
COPY shared/package.json ./shared/
COPY packages ./packages

# Install deps (frozen lockfile for reproducible builds)
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build (backend is the runtime entrypoint; vapi is consumed via path-alias)
RUN pnpm --filter backend build
RUN pnpm --filter vapi build || true  # vapi may not have its own build step

# ---------- Stage 2: production ----------
FROM node:20-alpine AS production

WORKDIR /app

# Install curl for healthcheck + pnpm for runtime
RUN apk add --no-cache curl && \
    npm install -g pnpm@9

# Copy built artifacts + production node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/vapi/dist ./vapi-dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/vapi ./vapi
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/prisma ./prisma

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs
USER nodejs

EXPOSE 3001
EXPOSE 9090

# Healthcheck — same endpoint as K8s readinessProbe
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health/ready || exit 1

# Run the compiled backend (which wires VapiController via the root module)
CMD ["node", "dist/main.js"]
