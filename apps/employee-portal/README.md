# Dayjoy AI — Employee Portal

> Next.js 15 employee work management portal — tasks, tickets, CRM, attendance, reports, analytics, team, and AI assistant.

Part of the [Dayjoy AI Enterprise](../../README.md) monorepo. Consumes the
shared NestJS backend (`backend/`), RAG service (`rag/`), Vapi voice
(`vapi/`), and WhatsApp AI (`whatsapp-ai/`).

## Features

- **Dashboard** with KPIs, quick links, and AI Assistant entry point
- **Tasks** — daily task queue (list, kanban, detail) _(Agent 5)_
- **Tickets** — support tickets with conversation thread _(Agent 5)_
- **CRM** — customers, distributors, leads _(Agent 5)_
- **Knowledge Base** — search & browse _(Agent 5)_
- **AI Assistant** — draft responses, summarise, find info _(Agent 5)_
- **Internal Chat** — real-time team chat _(Agent 5)_
- **Notifications** — notification center with channel/category preferences _(Agent 5)_
- **Attendance** — check-in/out, monthly calendar, history, leave management
- **Reports** — sales, tickets, performance (CSV export)
- **Analytics** — productivity, resolution time, conversion, CSAT, team comparison
- **Team Management** — member list (managers), detail with tasks, tickets, performance, attendance, activity timeline
- **Profile** — Personal / Employment / Documents / Security tabs
- **Settings** — Theme / Language / Notifications / Privacy tabs

## Tech stack

- **Framework**: Next.js 15 (App Router, Turbopack) + React 19
- **Language**: TypeScript 5 (strict)
- **Styling**: Tailwind CSS 4 with custom design tokens (light/dark/brand themes)
- **UI**: shadcn/ui (New York style) + Lucide icons + Framer Motion
- **Data fetching**: TanStack Query v5
- **State**: Zustand _(client)_ + TanStack Query _(server)_
- **Charts**: Recharts 2
- **Forms**: React Hook Form + Zod
- **Auth**: NextAuth.js v4 _(planned — Agent 5 owns)_
- **Toasts**: Sonner + legacy Radix toaster

## Getting started

```bash
cd apps/employee-portal
pnpm install
cp .env.example .env.local
pnpm dev   # → http://localhost:3007
```

> The portal runs on port **3007** to avoid clashing with the admin
> dashboard (3000), backend (8000), and other apps in the monorepo.

### Prerequisites

- Node.js ≥ 22
- pnpm ≥ 9
- (Optional) NestJS backend running on `http://localhost:8000` — without
  it, the portal falls back to deterministic mock data so every page is
  still navigable.

## Project structure

```
apps/employee-portal/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx              # Root layout (fonts, providers)
│  │  ├─ globals.css             # Tailwind 4 + design tokens
│  │  └─ (portal)/               # Authenticated route group
│  │     ├─ layout.tsx           # PortalLayout (sidebar + topbar)
│  │     ├─ page.tsx             # Dashboard
│  │     ├─ attendance/          # ✦ Agent 6 — attendance + leave
│  │     ├─ reports/             # ✦ Agent 6 — sales, tickets, performance
│  │     ├─ analytics/           # ✦ Agent 6 — analytics dashboard
│  │     ├─ team/                # ✦ Agent 6 — team list + member detail
│  │     ├─ profile/             # ✦ Agent 6 — profile (4 tabs)
│  │     ├─ settings/            # ✦ Agent 6 — settings (4 tabs)
│  │     ├─ tasks/               # Agent 5 — task management
│  │     ├─ tickets/             # Agent 5 — ticket management
│  │     ├─ crm/                 # Agent 5 — customers, distributors, leads
│  │     ├─ knowledge/           # Agent 5 — knowledge base
│  │     ├─ ai/                  # Agent 5 — AI assistant
│  │     ├─ chat/                # Agent 5 — internal chat
│  │     └─ notifications/       # Agent 5 — notification center
│  ├─ components/
│  │  ├─ ui/                     # shadcn/ui primitives (button, card, …)
│  │  ├─ layout/                 # sidebar, topbar, page-header, portal-layout
│  │  ├─ charts/                 # productivity, resolution, conversion, …
│  │  └─ providers.tsx           # React Query + theme + toasters
│  ├─ hooks/                     # use-toast (and more from Agent 5)
│  ├─ lib/
│  │  ├─ api.ts                  # Axios client w/ envelope unwrap
│  │  ├─ constants.ts            # NAV_ITEMS, QUERY_KEYS, STORAGE_KEYS
│  │  ├─ utils.ts                # cn, formatDate, formatCurrency, downloadCSV
│  │  └─ mock-data.ts            # Deterministic mock data (dev fallback)
│  └─ types/
│     └─ api.types.ts            # ApiResponse, ApiError, PaginatedResponse
├─ tests/                        # Vitest + Testing Library
├─ public/
├─ package.json
├─ tsconfig.json
├─ tailwind.config.ts
├─ next.config.ts
├─ vitest.config.ts
└─ components.json
```

✦ = Agent 6 deliverables. Other folders are owned by Agent 5
(auth, dashboard, tasks, CRM, tickets, knowledge, AI, chat, notifications).

## Scripts

| Script                | Description                                  |
| --------------------- | -------------------------------------------- |
| `pnpm dev`            | Start dev server on port 3007 (Turbopack)    |
| `pnpm build`          | Production build (standalone output)         |
| `pnpm start`          | Run the production build                     |
| `pnpm lint`           | ESLint (max-warnings 0)                      |
| `pnpm typecheck`      | `tsc --noEmit`                               |
| `pnpm test`           | Vitest (jsdom)                               |
| `pnpm test:watch`     | Vitest in watch mode                         |
| `pnpm test:coverage`  | Vitest with V8 coverage                      |

## Theming

The portal ships with three themes via `next-themes`:

| Theme  | Description                                  |
| ------ | -------------------------------------------- |
| `dark` | Default — "AI OS" instrument-panel aesthetic |
| `light`| Brighter daytime alternative                 |
| `brand`| Dayjoy warm orange (corporate identity)      |

Switch from **Settings → Theme**. The choice is persisted via
`next-themes` and applied as a class on `<html>`.

## Mock data

When the backend isn't running, `src/lib/mock-data.ts` provides
deterministic fallbacks so every page renders. This is **not** a
substitute for the real backend — it exists so a reviewer can navigate
the portal during concurrent frontend development.

Key mock functions:

- `getAttendanceMonth(date)` — per-day attendance records for a month
- `getAttendanceToday()` — today's check-in/out status
- `getLeaveBalance()` / `getLeaveRequests()` / `applyLeave()`
- `getSalesReport(start, end)` + `summariseSales(rows)`
- `getTicketReport(start, end)` + `summariseTickets(rows)`
- `getPerformanceReport()` — metrics, trend, goal progress
- `getAnalyticsKPIs()`, `getProductivityTrend()`, `getConversionTrend()`, …
- `getTeam()` / `getTeamMember(id)` / `getTeamMemberActivity(id)`
- `getSavedReports()`

Each feature page calls these via TanStack Query's `queryFn`. When the
real backend is available, replace the `queryFn` body with the
corresponding `api.get(...)` call from `@/lib/api`.

## Conventions

- **API envelope**: the backend returns
  `{ success, data, error, meta }`. The Axios interceptor in
  `lib/api.ts` auto-unwraps `data`, so callers receive `T` directly.
- **Pagination**: `api.paginated<T>(url, params)` returns
  `{ data: T[], meta: { page, limit, total, totalPages } }`.
- **Query keys**: defined centrally in `lib/constants.ts` (`QUERY_KEYS`).
  Invalidation fans out by prefix.
- **File naming**: kebab-case for files, PascalCase for components.
- **Status colours**: use `getStatusColor(status)` from `lib/utils.ts`
  for consistent status visualisation.

## Backend API contracts

The portal consumes these endpoints (all under `/api`):

| Endpoint                         | Page                          |
| -------------------------------- | ----------------------------- |
| `POST /auth/login`               | Login _(Agent 5)_             |
| `GET  /auth/me`                  | Sidebar / topbar _(Agent 5)_  |
| `GET  /tasks`                    | Tasks _(Agent 5)_             |
| `GET  /tickets`                  | Tickets _(Agent 5)_           |
| `GET  /customers`                | CRM _(Agent 5)_               |
| `GET  /distributors`             | CRM _(Agent 5)_               |
| `GET  /leads`                    | CRM _(Agent 5)_               |
| `GET  /attendance/month`         | **Attendance**                |
| `POST /attendance/check-in`      | **Attendance**                |
| `POST /attendance/check-out`     | **Attendance**                |
| `GET  /leave/balance`            | **Attendance → Leave**        |
| `GET  /leave`                    | **Attendance → Leave**        |
| `POST /leave`                    | **Attendance → Leave**        |
| `GET  /reports/sales`            | **Reports → Sales**           |
| `GET  /reports/tickets`          | **Reports → Tickets**         |
| `GET  /reports/performance`      | **Reports → Performance**     |
| `GET  /analytics/dashboard`      | **Analytics**                 |
| `GET  /team`                     | **Team**                      |
| `GET  /team/:id`                 | **Team → Member detail**      |
| `GET  /users/me`                 | **Profile**                   |
| `PATCH /users/me`                | **Profile → Personal**        |
| `POST /users/me/password`        | **Profile → Security**        |
| `GET  /notifications/preferences`| **Settings → Notifications**  |
| `PATCH /notifications/preferences`| **Settings → Notifications** |

## License

UNLICENSED — © Dayjoy AI Enterprise.
