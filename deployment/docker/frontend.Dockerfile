# Frontend Dockerfile — Production-grade multi-stage build
# Optimized: standalone output, small image, non-root user

# ===== Stage 1: Dependencies =====
FROM node:26-alpine AS deps

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

# ===== Stage 2: Builder =====
FROM node:26-alpine AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set production environment
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# Build with standalone output
RUN pnpm build

# ===== Stage 3: Runtime =====
FROM node:26-alpine AS runtime

# Install curl for health checks
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

WORKDIR /app

# Copy standalone build output (much smaller than full node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

USER nextjs

EXPOSE 3000

ENV PORT=3000 \
    HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
