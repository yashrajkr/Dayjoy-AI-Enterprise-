# Deployment Guide — Dayjoy Distributor Portal

This guide covers building, configuring, and deploying the Distributor Portal to production. It assumes the Dayjoy backend (`backend/`) is already deployed and reachable.

## 1. Prerequisites

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Node.js | 22.0 | 22.x LTS |
| pnpm | 9.0 | 9.12+ |
| Memory | 1 GB | 2 GB |
| Disk | 500 MB | 1 GB |
| Dayjoy backend | v1.0 | latest |
| Reverse proxy (Caddy / nginx) | — | Caddy 2.7+ |

The portal is a stateless Next.js app — it can be horizontally scaled behind any load balancer. State (sessions, cache) lives in the backend / Redis, not in the portal process.

## 2. Environment variables

Copy `.env.example` to `.env.local` (dev) or set the same keys in your deployment environment (prod).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | `http://localhost:8000/api` | Base URL of the Dayjoy backend. Must be reachable from the browser (CORS-enabled) **and** from the Next.js server (for SSR/rewrites). |
| `NEXT_PUBLIC_APP_NAME` | ❌ | `Dayjoy Distributor Portal` | Shown in document title and sidebar. |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | ❌ | — | Vapi public key for the Voice AI button. The corresponding secret key lives on the backend. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | ❌ | — | WhatsApp Business number in E.164 format (e.g. `+919999999999`) for the "Chat on WhatsApp" CTA. |

Only `NEXT_PUBLIC_*` variables are exposed to the browser. Never put secrets in a `NEXT_PUBLIC_` variable.

### CORS

The backend must allow the portal's origin. In the backend's `.env`:

```bash
ALLOWED_ORIGINS=https://portal.dayjoy.ai,https://distributor.dayjoy.ai
```

## 3. Local development

```bash
cd apps/distributor-portal
pnpm install
cp .env.example .env.local
pnpm dev
# → http://localhost:3000
```

Hot-reload is enabled via `next dev --turbopack`. The portal auto-falls back to mock data when the backend is unreachable, so you can develop UI without a running backend.

## 4. Production build

```bash
pnpm install --frozen-lockfile
pnpm build
```

This produces a self-contained standalone bundle in `.next/standalone/` (the `output: "standalone"` flag in `next.config.ts`). The build also runs ESLint; treat warnings as errors (`--max-warnings 0`).

### Build artifacts

```
.next/
├── standalone/        # Self-contained Node.js server
│   ├── server.js
│   └── node_modules/
└── static/            # Static assets (CSS, JS, images)
```

## 5. Running in production

### Option A — Node.js server (recommended)

```bash
# Copy the standalone bundle + static assets to your deploy target
cp -r .next/standalone /opt/dayjoy-portal
cp -r .next/static /opt/dayjoy-portal/.next/static
cp -r public /opt/dayjoy-portal/public

# Set environment
export NODE_ENV=production
export NEXT_PUBLIC_API_URL=https://api.dayjoy.ai/api
export NEXT_PUBLIC_APP_NAME="Dayjoy Distributor Portal"
export PORT=3000

# Run
cd /opt/dayjoy-portal
node server.js
```

### Option B — Docker

```dockerfile
# Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

Build & run:

```bash
docker build -t dayjoy-distributor-portal .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=https://api.dayjoy.ai/api \
  dayjoy-distributor-portal
```

### Option C — Vercel

The portal is a standard Next.js app and deploys to Vercel with zero config:

```bash
npm i -g vercel
vercel --prod
```

Set the environment variables in the Vercel dashboard.

## 6. Reverse proxy (Caddy)

A minimal Caddyfile that terminates TLS and forwards `/api/*` to the backend and everything else to the portal:

```caddyfile
portal.dayjoy.ai {
    encode gzip zstd

    # API → backend
    handle /api/* {
        reverse_proxy backend.local:8000
    }

    # Everything else → portal
    handle {
        reverse_proxy portal.local:3000
    }

    # Security headers
    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        X-XSS-Protection "1; mode=block"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    }
}
```

The same security headers are also applied by `next.config.ts` at the Next.js level (defense in depth).

## 7. Health check

The portal does not expose its own `/api/health` route (the backend does). For load-balancer health checks, use the root URL — it returns a 307 redirect to `/leads` (or `/dashboard` once Agent 3 ships it):

```bash
curl -sI https://portal.dayjoy.ai/ | head -1
# → HTTP/2 307
```

A 200 from `/` (after redirect) indicates the portal is up.

## 8. Logging & monitoring

- **Application logs**: written to stdout in JSON format. Capture with `docker logs` or your container runtime's log driver.
- **Error tracking**: integrate Sentry by adding `SENTRY_DSN` to the env and uncommenting the Sentry import in `src/app/layout.tsx` (not yet wired by default).
- **Analytics**: integrate PostHog by adding `NEXT_PUBLIC_POSTHOG_KEY` and uncommenting the PostHog provider in `src/components/providers.tsx`.
- **Performance**: Vercel Analytics works out-of-the-box on Vercel. For self-hosted, use the Lighthouse CI workflow in `.github/workflows/` (set up by the platform team).

## 9. Performance budgets

| Metric | Target |
|--------|--------|
| First Contentful Paint (FCP) | < 1.5 s |
| Largest Contentful Paint (LCP) | < 2.5 s |
| Time to Interactive (TTI) | < 3.5 s |
| Cumulative Layout Shift (CLS) | < 0.1 |
| Total JS bundle (gzipped) | < 200 KB |
| Total CSS (gzipped) | < 30 KB |

The portal uses:
- `next/font` for automatic font optimization
- `optimizePackageImports` for `lucide-react`, `recharts`, `framer-motion`
- Turbopack for fast dev builds
- Tailwind CSS 4 (JIT, no unused CSS)
- shadcn/ui (composable, tree-shakeable)

## 10. Scaling

The portal is stateless. Scale horizontally by running multiple instances behind a load balancer. Sticky sessions are **not** required.

| Distributors | Instances | Notes |
|--------------|-----------|-------|
| < 1,000 | 1 | 1 vCPU / 1 GB RAM |
| 1,000–10,000 | 2–3 | 2 vCPU / 2 GB RAM each |
| 10,000–50,000 | 4–8 | 2 vCPU / 2 GB RAM each + CDN |
| > 50,000 | 8+ | 4 vCPU / 4 GB RAM each + CDN + edge cache |

For > 10K distributors, put a CDN (CloudFront, Cloudflare, Vercel Edge) in front and cache static assets aggressively. The portal's static assets are immutable (content-hashed filenames) and can be cached for 1 year.

## 11. Rollback

Each deployment should be tagged with a git SHA. To rollback:

```bash
# Docker
docker pull dayjoy-distributor-portal:<previous-sha>
docker stop dayjoy-distributor-portal && docker rm dayjoy-distributor-portal
docker run -d --name dayjoy-distributor-portal ... dayjoy-distributor-portal:<previous-sha>

# Vercel
vercel --prod --target=<previous-deployment-url>
```

Database migrations are owned by the backend; the portal does not run migrations.

## 12. Post-deploy verification checklist

After deploying, verify:

- [ ] `https://portal.dayjoy.ai/` loads and redirects to `/leads` (or `/dashboard`).
- [ ] Sidebar shows all 5 sections (Overview / Business / Growth / Resources / Account).
- [ ] Login flow works (Agent 3's `/login` page).
- [ ] `/leads` table renders with mock data (or live data if backend is up).
- [ ] `/leads/new` form submits and creates a lead.
- [ ] `/products` grid renders with images.
- [ ] `/orders/new` wizard computes totals correctly.
- [ ] `/ai-assistant` chat sends and receives messages.
- [ ] Theme switcher in topbar cycles Light → Dark → Brand.
- [ ] Mobile viewport (375×812): sidebar opens as a drawer, all cards stack.
- [ ] Lighthouse Performance score ≥ 90 on `/leads`.

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Blank page, console shows CORS error | Backend `ALLOWED_ORIGINS` doesn't include portal origin | Add the portal origin to backend's `.env` and restart |
| 401 redirect loop | Auth token expired and refresh failed | Clear `localStorage` and re-login |
| "Network error" toast on every page | Backend unreachable | Check backend health, network, `NEXT_PUBLIC_API_URL` |
| Page 404s (e.g. `/dashboard`) | Agent 3 hasn't shipped that page yet | Wait for Agent 3, or implement the page |
| Hydration warning | Theme mismatch (server renders light, client has dark in localStorage) | Already handled via `suppressHydrationWarning` on `<html>` |
| Images don't load | Domain not in `next.config.ts` `images.remotePatterns` | Add the domain and rebuild |
| Build fails on `marked` import | `marked` not installed | `pnpm install marked` |

## 14. Maintenance

- **Dependency updates**: run `pnpm update` monthly. Major bumps should be tested in staging first.
- **Security patches**: subscribe to GitHub Dependabot alerts for this repo.
- **Schema changes**: when the backend Prisma schema changes, update `src/types/index.ts` to match. The TypeScript compiler will catch mismatches.
- **Mock data refresh**: periodically refresh `src/lib/mock-data.ts` to match new backend seed data so the offline dev experience stays useful.

---

For questions, contact the Dayjoy Platform team. For bugs, file an issue in the monorepo with the `portal-distributor` label.
