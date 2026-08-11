# whatsapp-ai/Dockerfile — WhatsApp Business API module (TypeScript / NestJS-style)
# Multi-stage build

FROM node:20-slim AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.json ./
COPY whatsapp-ai/ ./whatsapp-ai/
COPY packages/ ./packages/
COPY shared/ ./shared/

RUN pnpm install --frozen-lockfile --filter whatsapp-ai... --filter @dayjoy/*
RUN pnpm --filter whatsapp-ai build
RUN pnpm --filter whatsapp-ai prune --prod

FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 dayjoy && useradd --system --uid 1001 --gid dayjoy --create-home dayjoy
WORKDIR /app

COPY --from=builder --chown=dayjoy:dayjoy /app/node_modules ./node_modules
COPY --from=builder --chown=dayjoy:dayjoy /app/whatsapp-ai/node_modules ./whatsapp-ai/node_modules
COPY --from=builder --chown=dayjoy:dayjoy /app/whatsapp-ai/dist ./whatsapp-ai/dist
COPY --from=builder --chown=dayjoy:dayjoy /app/whatsapp-ai/package.json ./whatsapp-ai/package.json
COPY --from=builder --chown=dayjoy:dayjoy /app/packages ./packages

USER dayjoy
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=5 \
  CMD curl -f http://localhost:3002/health || exit 1

# ---------------------------------------------------------------------------
# AUDIT FIX (P0): `whatsapp-ai/` is NOT a standalone service.
#
# There is no `whatsapp-ai/main.ts`, no `whatsapp-ai/package.json`, and no
# `whatsapp-ai/tsconfig.json`. The directory ships only `whatsapp.module.ts`
# and sub-modules — they are imported by `backend/app.module.ts`
# (`import { WhatsAppModule } from '../whatsapp-ai/whatsapp.module'`) and
# compiled into `backend/dist/whatsapp-ai/*.js` by `backend/tsconfig.json`
# (`rootDir: ".."`, `include: ["../whatsapp-ai/**/*.ts"]`).
#
# The backend process (port 3000) already serves the WhatsApp webhook routes
# (GET/POST /api/whatsapp/webhook). There is no separate port-3002 process
# to run. The previous CMD `node whatsapp-ai/dist/main.js` referenced a file
# that no build step ever produces.
#
# TODO(audit): either
#   (a) remove this Dockerfile + the `whatsapp-ai` service from
#       docker-compose.yml (the backend already handles WhatsApp), or
#   (b) add a `whatsapp-ai/main.ts` that bootstraps a standalone NestJS app
#       + a `whatsapp-ai/package.json` with a `build` script, then restore
#       `CMD ["node", "whatsapp-ai/dist/main.js"]`.
#
# Until then, fail fast with a clear message instead of crashing with
# "Cannot find module 'whatsapp-ai/dist/main.js'".
# ---------------------------------------------------------------------------
CMD ["sh", "-c", "echo 'ERROR: whatsapp-ai is not a standalone service — it is a NestJS module imported by backend/app.module.ts. See whatsapp-ai/Dockerfile for the audit-fix note.' >&2; exit 1"]
