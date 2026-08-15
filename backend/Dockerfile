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

# Copy all source directories. `backend/app.module.ts` imports from
# the sibling `vapi/`, `rag/`, and `whatsapp-ai/` packages (VapiModule,
# RagModule/EvaluationModule/RagSecurityModule, WhatsAppModule) — these
# were previously NOT copied into the build context, so `nest build`
# (with this project's `rootDir: ".."`) could never resolve those
# imports. The build only "succeeded" because the build step below is
# best-effort (`|| true`); the resulting image had an incomplete/
# broken `dist/` and could never actually boot.
COPY backend/ ./backend/
COPY vapi/ ./vapi/
COPY rag/ ./rag/
COPY whatsapp-ai/ ./whatsapp-ai/
COPY packages/ ./packages/
COPY shared/ ./shared/
COPY database/ ./database/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma Client (best-effort). Pinned to the CLI version that
# matches the installed `@prisma/client` (^6.0.0, resolves to 6.19.3) —
# the hoisted root `prisma` devDependency is 7.9.1, whose schema
# validation rejects this project's `datasource { url = env(...) }`
# syntax (Prisma 7 requires moving that to `prisma.config.ts`). Using
# the bare `npx prisma` here reproduces that failure and (being
# best-effort) would silently ship an image with no generated client,
# crashing on the first database call at runtime.
RUN npx prisma@6.19.3 generate --schema database/prisma/schema.prisma 2>&1 || true

# Build backend (allow pre-existing TypeScript errors elsewhere in the
# monorepo to pass — `tsc` still emits JS for files without errors;
# this codebase has long-standing type errors in unrelated modules
# that are out of scope here). What must NOT be tolerated is the build
# failing to produce the actual entrypoint — fail the image build loudly
# in that case instead of silently shipping a container with no
# `main.js` (the previous `mkdir -p dist` masked exactly this failure
# mode).
WORKDIR /app/backend
RUN pnpm run build 2>&1 || true
RUN test -f dist/backend/main.js || (echo "FATAL: build did not produce dist/backend/main.js" >&2 && exit 1)

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

# Start backend. `nest build` compiles with `rootDir: ".."` (set in
# backend/tsconfig.json so the sibling `vapi/`/`rag/`/`whatsapp-ai/`
# imports resolve), which places the emitted entrypoint at
# `dist/backend/main.js`, NOT `dist/main.js` — the previous path here
# pointed at a file that never existed, so the container would have
# failed to start immediately even with a correctly-built image.
CMD ["node", "backend/dist/backend/main.js"]
