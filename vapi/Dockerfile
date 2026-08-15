# vapi/Dockerfile — Voice AI service (production-optimized)

FROM node:20-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ===== Stage 1: Dependencies =====
FROM base AS dependencies

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prefer-offline

# ===== Stage 2: Builder =====
FROM dependencies AS builder

WORKDIR /app

COPY vapi/ ./vapi/
COPY packages/ ./packages/
COPY shared/ ./shared/

RUN pnpm --filter vapi run build

# ===== Stage 3: Runtime =====
FROM base AS runtime

RUN groupadd --system --gid 1001 dayjoy && \
    useradd --system --uid 1001 --gid dayjoy --create-home dayjoy

WORKDIR /app

COPY --from=dependencies --chown=dayjoy:dayjoy /app/node_modules ./node_modules
COPY --from=builder --chown=dayjoy:dayjoy /app/vapi/dist ./vapi/dist
COPY --from=builder --chown=dayjoy:dayjoy /app/vapi/package.json ./vapi/package.json
COPY --from=builder --chown=dayjoy:dayjoy /app/packages ./packages
COPY --from=builder --chown=dayjoy:dayjoy /app/shared ./shared

USER dayjoy
ENV NODE_ENV=production \
    NODE_PATH=/app/node_modules \
    PATH=/app/node_modules/.bin:$PATH

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=5 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "vapi/dist/main.js"]
