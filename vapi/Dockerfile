# vapi/Dockerfile — Vapi Voice AI module (TypeScript / NestJS-style)
# Multi-stage build

FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.json ./
COPY vapi/ ./vapi/
COPY packages/ ./packages/
COPY shared/ ./shared/

RUN pnpm install --frozen-lockfile --filter vapi... --filter @dayjoy/*
RUN pnpm --filter vapi build
RUN pnpm --filter vapi prune --prod

FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 dayjoy && useradd --system --uid 1001 --gid dayjoy --create-home dayjoy
WORKDIR /app

COPY --from=builder --chown=dayjoy:dayjoy /app/node_modules ./node_modules
COPY --from=builder --chown=dayjoy:dayjoy /app/vapi/node_modules ./vapi/node_modules
COPY --from=builder --chown=dayjoy:dayjoy /app/vapi/dist ./vapi/dist
COPY --from=builder --chown=dayjoy:dayjoy /app/vapi/package.json ./vapi/package.json
COPY --from=builder --chown=dayjoy:dayjoy /app/packages ./packages

USER dayjoy
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=5 \
  CMD curl -f http://localhost:3001/health || exit 1
CMD ["node", "vapi/dist/main.js"]
