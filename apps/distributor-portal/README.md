# Dayjoy Distributor Portal

> The distributor-facing portal for the Dayjoy AI Enterprise Platform — built with Next.js 15, React 19, TypeScript, Tailwind CSS 4, and shadcn/ui.

This portal is where Dayjoy distributors live: managing leads, customers, products, orders, training, knowledge, AI-assisted sales coaching, and personal/business profile — all in one place.

## ✨ Features

### Business workflows
- **Leads** — table & kanban pipeline (NEW → CONTACTED → QUALIFIED → CONVERTED → LOST), search/filter, create-with-AI-score, detail page with activity timeline, add-note, **AI next-best-action suggestion**, and one-click convert-to-customer.
- **Customers** — searchable card grid with LTV/order/last-order stats, detail page with order history, AI conversation history, and add-note. Deep-link "create order for this customer".
- **Products** — distributor catalog grid (image, MRP, distributor price, commission %, stock, rating), detail page with image gallery, AI "Generate product pitch" button, and links to related training modules.
- **Orders** — list with status filter, create-order wizard (search customers → add products → review summary with live commission calc → place), order detail with timeline, tracking, and invoice download.

### Growth & learning
- **AI Business Assistant** — chat interface with distributor-focused quick actions ("Generate pitch", "Suggest follow-up", "Analyze team performance", "How to reach next tier"), voice (Vapi) and WhatsApp channel buttons, plus a conversation history page.
- **Training Center** — module grid by category (Onboarding / Product / Sales / Business Plan / Leadership), progress tracking, video player, document viewer, quiz with pass/fail, and prev/next navigation.
- **Knowledge Base** — articles grouped by category (Policies, Compensation Plan, SOPs, FAQs, Product Info), full markdown rendering, "Was this helpful?" feedback, related articles, and "Ask AI about this" deep-link.

### Communication & docs
- **Announcements** — pinned/regular list, category filter, read/unread state, and a detail dialog with full body.
- **Events** — upcoming + past events (Webinar / Training / Meeting / Launch) with RSVP, capacity tracking, "Join" link, and past-event recording playback.
- **Notifications** — list with type filter, mark-read/mark-all-read, deep-links to source pages.
- **Documents** — categorized list (Invoices / Commission Statements / Tax / Certificates / Agreements) with download + upload (dialog with category + file picker).

### Account
- **Profile** — 5 tabs (Personal, Business, Bank, Documents, Security) covering name/photo/DOB/address, distributor code/tier/sponsor/PAN/GST, bank account for payouts, KYC document upload with verification status, change password, 2FA setup, and active session management.
- **Settings** — 4 tabs (Theme [Light/Dark/Brand], Language & region [7 Indian languages + date format + timezone], Notifications [channel × category matrix], Privacy [profile visibility + data export + account deletion]).

## 🏗 Architecture

```
apps/distributor-portal/
├── src/
│   ├── app/
│   │   ├── (portal)/              # Authenticated route group
│   │   │   ├── layout.tsx         # Wraps every page in sidebar + topbar
│   │   │   ├── leads/             # Leads list + new + [id]
│   │   │   ├── customers/         # Customers list + [id]
│   │   │   ├── products/          # Products list + [id]
│   │   │   ├── orders/            # Orders list + new + [id]
│   │   │   ├── ai-assistant/      # Chat + history
│   │   │   ├── training/          # List + [id]
│   │   │   ├── knowledge/         # List + [slug]
│   │   │   ├── announcements/
│   │   │   ├── events/
│   │   │   ├── notifications/
│   │   │   ├── documents/
│   │   │   ├── profile/
│   │   │   └── settings/
│   │   ├── layout.tsx             # Root layout (Providers + theme + fonts)
│   │   ├── page.tsx               # Redirects to /leads
│   │   └── globals.css            # Tailwind 4 + design tokens (light/dark/brand)
│   ├── components/
│   │   ├── ui/                    # shadcn/ui primitives (button, card, dialog, etc.)
│   │   └── layout/                # PortalLayout, Sidebar, Topbar, PageHeader
│   ├── lib/
│   │   ├── api.ts                 # Axios client with envelope unwrapping + 401 redirect
│   │   ├── constants.ts           # Nav sections, enums, tier rates, AI quick actions
│   │   ├── services.ts            # Per-domain service layer (API-first, mock fallback)
│   │   ├── mock-data.ts           # In-memory fixtures for offline dev
│   │   └── utils.ts               # cn(), formatters, status colors
│   └── types/index.ts             # All TypeScript domain types
├── tests/                         # Vitest unit tests (7 files)
├── package.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
└── .env.example
```

### API-first with mock fallback

Every service in `src/lib/services.ts` first attempts the real backend API. On any error (network, 401, 404, 5xx) it transparently falls back to the in-memory mock dataset, so every page renders end-to-end without a live backend. This lets the portal ship today against the backend's progress and switch to API-only by removing the `catch` blocks once the backend is fully wired.

### Concurrency model

This app is built by two parallel agents:

| Agent | Scope |
|-------|-------|
| **Agent 3** (foundation) | Auth, dashboard, team, sales, earnings, commissions, middleware, useAuth hook |
| **Agent 4** (this agent) | Leads, customers, products, orders, AI assistant, training, knowledge, announcements, events, notifications, documents, profile, settings, README, tests |

Both agents work on the same `apps/distributor-portal/` directory. The shared shell (`Sidebar`, `Topbar`, `PortalLayout`, `Providers`, `lib/api.ts`, `lib/utils.ts`, `lib/constants.ts`, UI primitives) was created by this agent (Agent 4) because the app did not yet exist when this agent started. Agent 3 may freely override or extend any of these shared files — they are coordinated, not owned.

The sidebar's `NAV_SECTIONS` already includes Agent 3's routes (`/dashboard`, `/team`, `/sales`, `/earnings`, `/commissions`). Until Agent 3 ships those pages, navigating to them will 404 — this is expected and intentional.

## 🚀 Quick start

### Prerequisites
- Node.js ≥ 22
- pnpm ≥ 9
- The Dayjoy backend running locally (`cd ../../backend && pnpm dev`) — optional; the portal falls back to mock data when the backend is unavailable.

### Install
```bash
cd apps/distributor-portal
pnpm install
```

### Configure
```bash
cp .env.example .env.local
# Edit .env.local:
#   NEXT_PUBLIC_API_URL=http://localhost:8000/api
#   NEXT_PUBLIC_APP_NAME=Dayjoy Distributor Portal
#   NEXT_PUBLIC_VAPI_PUBLIC_KEY=...     (optional, for voice AI)
#   NEXT_PUBLIC_WHATSAPP_NUMBER=+91...  (optional, for WhatsApp AI CTA)
```

### Develop
```bash
pnpm dev
# → http://localhost:3000
```

The root URL (`/`) redirects to `/leads` until Agent 3 ships the dashboard, at which point it should be flipped to `redirect("/dashboard")` in `src/app/page.tsx`.

### Lint & type-check
```bash
pnpm lint
pnpm typecheck
```

### Test
```bash
pnpm test             # one-shot
pnpm test:watch       # watch mode
pnpm test:coverage    # with V8 coverage report
```

## 🎨 Design system

- **Theme**: Light by default (distributor portal is a productivity surface for long working hours). Dark and Brand (Dayjoy warm orange) variants available via `next-themes`.
- **Color tokens**: HSL CSS variables in `globals.css` (`--primary`, `--background`, `--card`, `--muted`, `--success`, `--warning`, `--destructive`, `--info`, `--border`, `--ring`).
- **Typography**: Geist Sans (`--font-geist`).
- **Components**: shadcn/ui (New York style) with Radix primitives — see `src/components/ui/`.
- **Icons**: `lucide-react`.
- **Charts**: `recharts` (used by Agent 3's dashboard/earnings pages).
- **Animations**: `framer-motion` for page-header transitions and kanban card animations.
- **Responsive**: mobile-first. Sidebar becomes a drawer on `< md` screens.
- **Accessibility**: semantic HTML (`<main>`, `<header>`, `<nav>`, `<footer>`), ARIA labels on icon buttons, `aria-current="page"` on active nav items, `role="log"` + `aria-live="polite"` on AI chat.

## 🔌 Backend integration

The portal talks to the NestJS backend at `NEXT_PUBLIC_API_URL`. Wire format (NestJS envelope):

```jsonc
// success
{ "success": true, "data": <T>, "meta": { "requestId": "...", "page": 1, ... } }

// error
{ "success": false, "error": { "code": "NOT_FOUND", "message": "...", "details": null } }
```

The Axios response interceptor auto-detects the envelope, unwraps `data`, and surfaces errors via Sonner toasts. On 401 it clears auth storage and redirects to `/login`.

### Endpoints used

| Method | Path | Used by |
|--------|------|---------|
| GET/POST | `/leads`, `/leads/:id`, `/leads/:id/notes`, `/leads/:id/convert` | Leads pages |
| GET/POST | `/customers`, `/customers/:id`, `/customers/:id/orders`, `/customers/:id/conversations`, `/customers/:id/notes` | Customers pages |
| GET | `/products`, `/products/:id` | Products pages |
| POST | `/ai/product-pitch`, `/ai/lead-score`, `/ai/leads/:id/next-action` | AI features |
| GET/POST | `/orders`, `/orders/:id` | Orders pages |
| GET/POST | `/ai/conversations`, `/ai/conversations/:id/messages` | AI Assistant |
| GET/POST | `/training/modules`, `/training/modules/:id`, `/training/modules/:id/complete`, `/training/modules/:id/quiz` | Training pages |
| GET/POST | `/knowledge/articles`, `/knowledge/articles/:slug`, `/knowledge/articles/:id/feedback` | Knowledge pages |
| GET/POST | `/announcements`, `/announcements/:id/read` | Announcements |
| GET/POST | `/events`, `/events/:id/rsvp` | Events |
| GET/POST | `/notifications`, `/notifications/:id/read`, `/notifications/read-all` | Notifications |
| GET/POST | `/documents` | Documents |
| GET/PATCH | `/distributors/me`, `/distributors/me/bank`, `/distributors/me/documents` | Profile |
| POST | `/auth/change-password` | Profile → Security |
| GET/PATCH | `/users/me` | (Agent 3) Dashboard |

## 🧪 Testing

7 Vitest spec files (no E2E — that's owned by a separate testing track):

| File | Covers |
|------|--------|
| `auth.test.ts` | Storage keys, token presence, settings persistence |
| `dashboard.test.ts` | Nav structure, app metadata, tier ladder |
| `leads.test.ts` | Pipeline stages, sources, service shape (CRUD + AI scoring + next-action) |
| `orders.test.ts` | Order statuses, service shape, commission math, free-shipping threshold |
| `ai-assistant.test.ts` | Quick actions, conversation service, message contract |
| `team.test.ts` | Team navigation, tier ladder commission rates |
| `commissions.test.ts` | Tier rates, commission math, currency formatting |

Run them with `pnpm test`. The tests use the mock-data fixtures, so they pass without a live backend.

## 📦 Build & deploy

See [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md) for the full production build, env-var, and deployment instructions.

## 📄 License

Proprietary. © Dayjoy AI.
