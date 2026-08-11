# Deployment Guide — Dayjoy AI Customer Portal

This guide walks you through building, configuring, and deploying the Customer
Portal to Vercel, a Docker host, or any Node.js-capable platform.

## 1. Build

The portal is a standard Next.js 15 standalone app.

```bash
# From the app directory
cd apps/customer-portal

# Install deps (use the workspace root if you're in a monorepo)
pnpm install --frozen-lockfile

# Production build — emits .next/standalone/
pnpm build
```

The `next.config.ts` sets `output: "standalone"`, so the build produces a
self-contained bundle at `.next/standalone/` that includes only the runtime
dependencies. Copy the `public/` folder and `.next/static/` alongside it for
the full deployable artifact:

```bash
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static
```

## 2. Environment variables

All client-exposed variables must be prefixed with `NEXT_PUBLIC_`. The
interceptor in `src/lib/api.ts` reads `NEXT_PUBLIC_API_URL` at request time.

### Required

| Variable | Example | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_API_URL` | `https://api.dayjoy.ai/api` | Backend API base. Must be reachable from the user's browser. |

### Optional

| Variable | Default | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_APP_NAME` | `Dayjoy AI Customer Portal` | Browser title + brand. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | `919999999999` | Phone used for the WhatsApp button's `wa.me` deep link. |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | _(empty)_ | Vapi public key — when set, the voice modal lazy-loads the `@vapi-ai/web` SDK. |
| `NEXT_PUBLIC_VAPI_ASSISTANT_ID` | _(empty)_ | Vapi assistant id used when starting a voice call. |

Copy `.env.example` to `.env.local` for local development, and configure the
same variables in your deployment platform's UI / secrets manager for
production.

### `.env.example`

```bash
# Dayjoy AI Customer Portal — environment template
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_APP_NAME="Dayjoy AI Customer Portal"
NEXT_PUBLIC_WHATSAPP_NUMBER=919999999999
# Optional — enable live voice calls
NEXT_PUBLIC_VAPI_PUBLIC_KEY=
NEXT_PUBLIC_VAPI_ASSISTANT_ID=
```

## 3. Deployment targets

### Option A — Vercel (recommended for the portal)

The Customer Portal is a perfect fit for Vercel's edge network — it's a
stateless Next.js app with no server-side sessions.

1. **Import the project** — In Vercel, "Add New → Project", select the
   Dayjoy AI monorepo. Set the **Root Directory** to `apps/customer-portal`.
2. **Build & output** — Vercel auto-detects Next.js. No custom build command
   is needed; the default `next build` runs.
3. **Environment variables** — Add every variable from section 2 in the
   Vercel project settings. Mark `NEXT_PUBLIC_API_URL` as "Production,
   Preview, and Development".
4. **Deploy** — Push to `main` (or your production branch). Vercel will
   build and assign a `*.vercel.app` URL.
5. **Custom domain** — Add `portal.dayjoy.ai` (or similar) under
   Settings → Domains and configure the DNS CNAME as Vercel instructs.

> ⚠️ The Next.js rewrites in `next.config.ts` proxy `/api/*` to the backend
> in dev. **In production**, point `NEXT_PUBLIC_API_URL` directly at the
> backend's public URL — don't rely on the rewrite, since Vercel's edge
> network should call the API directly for the best latency.

### Option B — Docker

Use the included `Dockerfile` pattern (mirror `apps/admin-dashboard/Dockerfile`).
A minimal multi-stage build:

```dockerfile
# apps/customer-portal/Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3005
ENV PORT=3005
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

Build & run:

```bash
docker build -t dayjoyai/customer-portal:latest .
docker run -p 3005:3005 \
  -e NEXT_PUBLIC_API_URL=https://api.dayjoy.ai/api \
  -e NEXT_PUBLIC_WHATSAPP_NUMBER=919999999999 \
  dayjoyai/customer-portal:latest
```

### Option C — Kubernetes

A Helm chart is provided at `deployment/kubernetes/helm/dayjoyai/`. The
`frontend` template renders a Deployment + Service for any Next.js app — set
`values.yaml`:

```yaml
customerPortal:
  enabled: true
  image: dayjoyai/customer-portal:latest
  replicas: 2
  port: 3005
  env:
    NEXT_PUBLIC_API_URL: https://api.dayjoy.ai/api
    NEXT_PUBLIC_WHATSAPP_NUMBER: "919999999999"
  ingress:
    enabled: true
    host: portal.dayjoy.ai
    tls: true
```

Then `helm upgrade dayjoyai ./deployment/kubernetes/helm/dayjoyai -f values.yaml`.

## 4. Reverse proxy / Caddy

If you front the portal with Caddy (as the monorepo's `Caddyfile` does for
local dev), the snippet below routes `/portal/*` to the app on port 3005:

```caddyfile
portal.dayjoy.ai {
  encode zstd gzip

  @api path /api/*
  handle @api {
    reverse_proxy backend:8000
  }

  handle {
    reverse_proxy customer-portal:3005
  }

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Frame-Options "DENY"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
```

## 5. Post-deploy verification

Run through this checklist after every production deploy:

### Smoke tests

| # | Test | Expected |
|---|------|----------|
| 1 | Visit `/` | Redirects to `/dashboard` (or `/login` if not authenticated) |
| 2 | Visit `/ai-assistant` | Chat window loads; sending "hi" returns a streaming reply |
| 3 | Visit `/ai-assistant/history` | Past conversations appear; click opens detail view |
| 4 | Visit `/support` | Quick-link cards render; "Recent tickets" section shows data |
| 5 | Visit `/support/tickets/new` | Form submits successfully → redirects to ticket detail |
| 6 | Visit `/support/faqs` | Categories filter; FAQ rows expand |
| 7 | Visit `/support/knowledge-base` | Article grid renders; click opens full content |
| 8 | Visit `/notifications` | Notifications list with read/unread styling |
| 9 | Visit `/settings` | All 4 tabs render; theme switch changes appearance; notification prefs save |
| 10 | Open WhatsApp button | Modal opens with deep link + QR code |
| 11 | Open Voice button (without VAPI key) | Modal opens in demo mode |

### Performance budgets

| Metric | Budget | Tool |
|--------|--------|------|
| First Contentful Paint | < 1.5 s | Lighthouse |
| Largest Contentful Paint | < 2.5 s | Lighthouse |
| Time to Interactive | < 3.0 s | Lighthouse |
| Bundle (initial JS) | < 250 KB gzipped | `next build` output |

### Health check

`GET /api/health` (proxied to the backend) should return `200 OK` with the
backend's health envelope. If it doesn't, the portal's API interceptor will
surface a "Network error" toast — investigate the backend before debugging the
portal.

### Rollback

- **Vercel**: "Instant Rollback" button on the Deployments tab.
- **Docker**: `docker run dayjoyai/customer-portal:<previous-tag>`.
- **Kubernetes**: `helm rollback dayjoyai <revision>`.

## 6. Monitoring

The portal ships with the same structured logging + Sentry breadcrumbs as the
admin dashboard. Wire up:

- **Sentry** — set `NEXT_PUBLIC_SENTRY_DSN` and the build will pick up the
  source-map upload step from the monorepo's GitHub Actions workflow.
- **Vercel Analytics** — enable in Vercel project settings (no code change).
- **LogRocket** (optional) — drop the snippet into `src/app/layout.tsx` behind
  a feature flag for session replays during beta.

## 7. Local production preview

To run the production build locally (catches SSR-only issues that dev mode
hides):

```bash
pnpm build
pnpm start  # → http://localhost:3005
```

## 8. Common issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "Network error" toast on every API call | `NEXT_PUBLIC_API_URL` not set or unreachable from browser | Verify the URL is publicly resolvable; check CORS on the backend. |
| Chat hangs on "Connecting…" forever | Backend doesn't support SSE streaming | The client falls back to non-streaming POST; ensure `/ai/conversations/:id/messages` accepts `stream: true`. |
| Theme resets to light after refresh | `next-themes` cannot write to `localStorage` | Check that third-party cookies aren't blocked; the portal uses `attribute="class"`. |
| Voice button shows "Demo mode" | `NEXT_PUBLIC_VAPI_PUBLIC_KEY` not set | Set the env var and rebuild; the SDK lazy-loads on first call. |
| Knowledge Base articles don't render | Article `content` is HTML, not Markdown | The portal renders markdown; convert source documents or add a `remark-html` plugin. |

---

For architecture, AI system overview, and contribution guidelines, see the
root [`README.md`](../../README.md) and [`docs/`](../../docs/) directory.
