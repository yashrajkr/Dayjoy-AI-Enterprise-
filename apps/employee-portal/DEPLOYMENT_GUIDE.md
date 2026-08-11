# Deployment Guide — Employee Portal

Production deployment guide for the Dayjoy AI Employee Portal.

## 1. Prerequisites

### Runtime

- **Node.js** ≥ 22 (LTS recommended)
- **pnpm** ≥ 9
- A running backend (`backend/`) on `http://localhost:8000` (or your
  production URL). The portal will not function in production without
  the real backend — the mock data layer is dev-only.

### External services

- **NestJS backend** — auth, tasks, tickets, CRM, attendance, reports,
  analytics, team, notifications (`backend/`)
- **RAG service** (`rag/`) — consumed by the AI Assistant (Agent 5)
- **Vapi** (`vapi/`) — consumed by voice features (out of portal scope)
- **PostgreSQL** — primary database for the backend
- **Redis** — backend caching / rate limiting

## 2. Environment variables

Copy `.env.example` → `.env.local` (dev) or `.env.production` (prod):

```bash
# Backend API URL — must be reachable from the browser.
NEXT_PUBLIC_API_URL=https://api.dayjoy.ai/api

# App name shown in the header / browser tab.
NEXT_PUBLIC_APP_NAME=Dayjoy AI Employee Portal

# (Optional) Sentry DSN for error tracking.
NEXT_PUBLIC_SENTRY_DSN=
```

> Only `NEXT_PUBLIC_*` variables are exposed to the browser. Never put
> secrets (JWT signing keys, DB passwords) here — those belong on the
> backend.

## 3. Local development

```bash
# From the monorepo root:
pnpm install

# Start the backend (terminal 1):
pnpm --filter backend dev

# Start the employee portal (terminal 2):
cd apps/employee-portal
pnpm dev   # → http://localhost:3007
```

The portal runs on port **3007** to avoid clashing with other apps:

| App                | Port |
| ------------------ | ---- |
| Admin dashboard    | 3000 |
| Employee portal    | 3007 |
| Backend (NestJS)   | 8000 |
| RAG service        | 8001 |
| Vapi webhook       | 8002 |

## 4. Building for production

```bash
cd apps/employee-portal
pnpm install --frozen-lockfile
pnpm build
```

The build outputs a **standalone** bundle (configured in
`next.config.ts → output: "standalone"`) to `.next/standalone/`. This is
the recommended deployment shape for Docker / Kubernetes.

### Build artefacts

```
.next/standalone/    # Self-contained Node.js server
.next/static/        # Static assets (JS, CSS, images)
public/              # Public assets copied as-is
```

## 5. Running the production build

```bash
NODE_ENV=production \
NEXT_PUBLIC_API_URL=https://api.dayjoy.ai/api \
node .next/standalone/apps/employee-portal/server.js
```

The standalone server listens on `$PORT` (default 3000). In production
set `PORT=3007` to match the dev convention.

## 6. Docker

The portal doesn't ship a Dockerfile (the admin-dashboard's `Dockerfile`
is the reference). A minimal Dockerfile:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/employee-portal/package.json ./apps/employee-portal/
RUN pnpm install --frozen-lockfile --filter dayjoyai-employee-portal...

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter dayjoyai-employee-portal build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3007
COPY --from=builder /app/apps/employee-portal/.next/standalone ./
COPY --from=builder /app/apps/employee-portal/.next/static ./apps/employee-portal/.next/static
COPY --from=builder /app/apps/employee-portal/public ./apps/employee-portal/public
EXPOSE 3007
CMD ["node", "apps/employee-portal/server.js"]
```

Build & run:

```bash
docker build -t dayjoyai/employee-portal:latest -f apps/employee-portal/Dockerfile .
docker run -p 3007:3007 -e NEXT_PUBLIC_API_URL=https://api.dayjoy.ai/api dayjoyai/employee-portal:latest
```

## 7. Reverse proxy (Caddy)

A typical Caddyfile entry:

```caddy
portal.dayjoy.ai {
    reverse_proxy employee-portal:3007
}

api.dayjoy.ai {
    reverse_proxy backend:8000
}
```

The portal calls the backend via relative paths (`/api/...`) which are
rewritten by `next.config.ts → rewrites()` to the backend URL. In
production, prefer routing through the reverse proxy so the browser
sees same-origin API calls (avoids CORS).

## 8. Health checks

- **Portal**: `GET /` returns 200 (renders the dashboard placeholder)
- **Backend**: `GET /api/health` returns `{ status: "ok", ... }`
- **RAG**: `GET /healthz` (see `rag/`)

## 9. CI / CD

Suggested GitHub Actions workflow (lives in `.github/workflows/`):

```yaml
name: employee-portal
on:
  push:
    paths: ["apps/employee-portal/**"]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter dayjoyai-employee-portal lint
      - run: pnpm --filter dayjoyai-employee-portal typecheck
      - run: pnpm --filter dayjoyai-employee-portal test
      - run: pnpm --filter dayjoyai-employee-portal build
      - uses: docker/build-push-action@v5
        with:
          context: .
          file: apps/employee-portal/Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}/employee-portal:latest
```

## 10. Rollback

Containerised deployments:

```bash
# Roll back to previous tag
docker pull ghcr.io/org/employee-portal:v1.0.0
docker stop employee-portal && docker rm employee-portal
docker run -d --name employee-portal -p 3007:3007 \
  -e NEXT_PUBLIC_API_URL=https://api.dayjoy.ai/api \
  ghcr.io/org/employee-portal:v1.0.0
```

For Kubernetes: `kubectl rollout undo deployment/employee-portal`.

## 11. Monitoring

- **Errors**: Sentry (`NEXT_PUBLIC_SENTRY_DSN`)
- **Uptime**: hit `GET /` from your uptime monitor
- **Logs**: structured JSON from `node server.js`; ship to your log
  aggregator (Loki, ELK, CloudWatch).
- **Metrics**: the backend exposes Prometheus metrics at `/metrics` —
  the portal itself does not (it's a static SPA).

## 12. Common issues

| Symptom                                | Likely cause                                            |
| -------------------------------------- | ------------------------------------------------------- |
| Blank page, console shows 401          | Auth token expired — log in again                       |
| API calls return CORS errors           | Backend `CORS_ORIGIN` doesn't include the portal URL    |
| Pages load but data is "—"             | Backend not running; portal falls back to mock data     |
| Charts don't render                    | `recharts` needs `ResizeObserver` polyfill in jsdom only|
| Build fails on `optimization`          | Upgrade `next` to ≥ 15.0.0                              |
| `tsc --noEmit` errors on `params`      | Use `use(params)` for async dynamic params (Next 15)    |
