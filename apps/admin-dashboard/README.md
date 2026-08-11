# Dayjoy AI Enterprise — Admin Dashboard

> Next.js 15 · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui · Recharts · Framer Motion

The admin console for the Dayjoy AI Enterprise Platform — manage AI assistants,
knowledge base, CRM, products, orders, analytics, automation, telephony,
WhatsApp, and system configuration from a single, dark-themed, instrument-panel
UI.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [Getting Started](#getting-started)
- [Features](#features)
- [Architecture](#architecture)
- [API Integration](#api-integration)
- [State Management](#state-management)
- [Theming](#theming)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)

---

## Overview

The Admin Dashboard is the primary UI surface for operators, admins,
distributors, and developers working with the Dayjoy AI Platform. It is a
single Next.js 15 (App Router) application mounted under
`apps/admin-dashboard/` and exposed at the platform root domain.

The UI is built on the **shadcn/ui "new-york"** component system, customized
with a dark-first design language ("AI operating system, not a document")
using the project's named palette: Void / Graphite / Slate / Azure / Indigo /
Cyan.

## Tech Stack

| Layer            | Technology                                            |
| ---------------- | ----------------------------------------------------- |
| Framework        | Next.js 15 (App Router, Turbopack dev)                |
| UI               | React 19, Tailwind CSS 4, shadcn/ui (Radix primitives)|
| State            | Zustand (client), TanStack React Query 5 (server)     |
| Forms            | React Hook Form + Zod                                 |
| Charts           | Recharts                                              |
| Animation        | Framer Motion                                         |
| Tables           | TanStack React Table 8                                |
| Command Palette  | cmdk                                                  |
| Date Pickers     | react-day-picker v9 + date-fns                        |
| 3D               | Three.js (AI orb + particle field)                    |
| Icons            | Lucide React                                          |
| HTTP             | Axios (typed client in `lib/api.ts`)                  |
| Testing          | Vitest (unit) + Playwright (e2e)                      |
| Lint / Format    | ESLint 9 (next config) + Prettier                     |

## Folder Structure

```
apps/admin-dashboard/
├── src/
│   ├── app/                          Next.js App Router pages
│   │   ├── layout.tsx                Root layout (fonts, providers)
│   │   ├── page.tsx                  Landing / redirect to /dashboard
│   │   ├── globals.css               Tailwind 4 + design tokens
│   │   ├── login/                    Login page
│   │   ├── oauth/authorize/          OAuth2 authorize page
│   │   └── (dashboard)/              Authenticated dashboard (25 sections)
│   │       ├── layout.tsx            Sidebar + topbar shell
│   │       ├── dashboard/            KPIs, charts, recent activity
│   │       ├── executive-cockpit/    Executive overview
│   │       ├── ai/                   AI management (assistants, prompts, memory)
│   │       ├── ai-console/           AI chat console
│   │       ├── ai-ops/               AI operations dashboard
│   │       ├── agents/               Agent management + monitor
│   │       ├── workflows/            Workflow management
│   │       ├── knowledge/            RAG knowledge base
│   │       ├── marketplace/          Plugin marketplace
│   │       ├── plugins/              Plugin management
│   │       ├── plugin-analytics/     Plugin analytics
│   │       ├── connectors/           Connector management
│   │       ├── mcp/                  Model Context Protocol
│   │       ├── developer/            Developer portal
│   │       ├── voice/                Voice AI dashboard
│   │       ├── telephony/            Telephony dashboard
│   │       ├── whatsapp/             WhatsApp dashboard
│   │       ├── customers/            CRM
│   │       ├── products/             Products + Orders
│   │       ├── analytics/            Analytics dashboards (11 sub-pages)
│   │       ├── system/               System config (10 settings pages)
│   │       ├── settings/             User settings
│   │       └── admin/                Admin settings
│   ├── components/
│   │   ├── ui/                       shadcn/ui primitives (35 files)
│   │   ├── common/                   Reusable composite components
│   │   │   ├── data-table.tsx        TanStack-React-Table-backed list
│   │   │   ├── kpi-card.tsx          KPI tile with trend
│   │   │   ├── status-badge.tsx      Color-coded status pill
│   │   │   ├── loading.tsx           Spinner / skeleton variants
│   │   │   ├── empty-state.tsx       Zero-data placeholder
│   │   │   ├── error-state.tsx       Error placeholder with retry
│   │   │   ├── confirm-dialog.tsx    AlertDialog-backed confirm flow
│   │   │   ├── page-container.tsx    Standard page gutter + max-width
│   │   │   ├── permission-guard.tsx  RBAC-based conditional render
│   │   │   └── index.ts              Barrel export
│   │   ├── charts/                   Recharts wrappers + Heatmap/Gauge
│   │   │   ├── line-chart.tsx
│   │   │   ├── bar-chart.tsx
│   │   │   ├── pie-chart.tsx
│     │   │   ├── area-chart.tsx
│   │   │   ├── gauge-chart.tsx
│   │   │   ├── heatmap.tsx
│   │   │   └── index.ts
│   │   ├── forms/                    React-Hook-Form-backed field primitives
│   │   │   ├── form-field.tsx        FormItem / FormInput / FormSelect / ...
│   │   │   ├── form-dialog.tsx       Dialog wired for create/edit
│   │   │   ├── search-input.tsx      Debounced search input
│   │   │   ├── date-range-picker.tsx Preset chips + calendar popover
│   │   │   ├── filter-bar.tsx        Reusable filter row
│   │   │   └── index.ts
│   │   ├── layout/                   Sidebar, topbar, page-header, transition
│   │   ├── features/                 Feature-specific composite components
│   │   ├── dashboard/                Dashboard-only composite components
│   │   ├── three/                    Three.js AI orb + particle field
│   │   ├── providers.tsx             React Query + Toast providers
│   │   └── ai-orb.tsx                AI orb (2D fallback)
│   ├── hooks/                        Custom hooks (use-permissions, ...)
│   ├── lib/                          Utilities, constants, typed API client
│   ├── store/                        Zustand stores
│   ├── services/                     API service layer (per-resource)
│   ├── types/                        TypeScript types (DTOs, models)
│   └── public/                       Static assets (logos, favicons)
├── package.json                      Dependencies (workspace package)
├── components.json                   shadcn/ui config (new-york style)
├── tailwind.config.ts                Theme tokens (aurora, glow, glass, ...)
├── tsconfig.json                     Path aliases (`@/*`)
├── next.config.ts                    Next.js config
├── vitest.config.ts                  Unit test config
├── Dockerfile                        Production container
├── README.md                         ← you are here
├── COMPONENT_GUIDE.md                Component docs (props, variants, examples)
├── FOLDER_GUIDE.md                   Folder structure guide
└── DEPLOYMENT_GUIDE.md               Build + deploy guide
```

## Getting Started

### Prerequisites

- **Node.js** 22+
- **pnpm** 9+ (workspace root)
- Dayjoy AI backend running (defaults to `http://localhost:8000`)

### Install

From the monorepo root:

```bash
pnpm install
```

Or scoped to this workspace:

```bash
cd apps/admin-dashboard
pnpm install
```

### Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
# Backend API base URL (no trailing slash)
NEXT_PUBLIC_API_URL=http://localhost:8000

# Voice widget URL (for embedded voice sessions)
NEXT_PUBLIC_VOICE_WIDGET_URL=http://localhost:3004

# WhatsApp business number (display only)
NEXT_PUBLIC_WHATSAPP_NUMBER=+91XXXXXXXXXX
```

### Dev

```bash
pnpm dev
# → http://localhost:3003
```

(Next.js runs on port 3003 to avoid clashing with the backend on 3000/8000.)

### Build

```bash
pnpm build
pnpm start
```

### Test

```bash
pnpm test          # unit tests (Vitest)
pnpm e2e           # e2e tests (Playwright)
pnpm e2e:ui        # interactive Playwright UI
```

### Lint & Format

```bash
pnpm lint          # ESLint
pnpm lint:fix      # ESLint --fix
pnpm format        # Prettier write
pnpm typecheck     # tsc --noEmit
```

## Features

- [x] JWT authentication + role-based access control (RBAC)
- [x] Main dashboard with KPIs + charts + activity feed
- [x] Executive cockpit with cross-domain health
- [x] AI Management — assistants, prompts, memory, tools, MCP
- [x] Knowledge Management — documents, search, retrieval analytics
- [x] CRM — customers, distributors, employees, leads
- [x] Products + Orders
- [x] Conversation Center — voice, chat, WhatsApp
- [x] Analytics — 11 dashboards (voice, chat, AI ops, RAG, CRM, …)
- [x] Automation — workflow builder, runs, scheduled jobs
- [x] Notifications — center, templates, broadcasts
- [x] System Config — 10 settings pages (LLM, API keys, env, …)
- [x] User management + audit log + monitoring
- [x] Light / Dark / Brand themes
- [x] Responsive (mobile, tablet, desktop)
- [x] Permission-based navigation + page guards
- [x] Command palette (cmdk) for global search
- [x] Reusable DataTable, KPI tiles, StatusBadge, chart wrappers

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser (Next.js Client)               │
│                                                              │
│   ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐ │
│   │ App Router  │──>│  Providers   │──>│  Page Components │ │
│   │ (RSC + 'use │   │ (QueryClient,│   │ (Server + Client)│ │
│   │  client')   │   │  Toaster,…)  │   │                  │ │
│   └─────────────┘   └──────────────┘   └────────┬─────────┘ │
│                                                  │           │
│                       ┌──────────────────────────┘           │
│                       ▼                                      │
│   ┌──────────────────────────────────────────────────────┐  │
│   │  components/{ui, common, charts, forms, layout,      │  │
│   │              features, three}                         │  │
│   └──────────────────────────────────────────────────────┘  │
│                       │                                      │
│                       ▼                                      │
│   ┌─────────────────┐   ┌──────────────┐   ┌─────────────┐  │
│   │ Zustand stores  │   │ React Query  │   │  Hooks      │  │
│   │ (auth, ui, ...) │   │ (server)     │   │ (use-...)   │  │
│   └─────────────────┘   └──────┬───────┘   └─────────────┘  │
│                                 │                            │
└─────────────────────────────────┼────────────────────────────┘
                                  │ HTTPS (Bearer JWT)
                                  ▼
                         ┌──────────────────┐
                         │  Dayjoy API      │
                         │  (NestJS, :8000) │
                         └──────────────────┘
```

**Data flow:** Pages compose `components/{ui,common,charts,forms}` for layout
and visuals. Server data flows through React Query → `lib/api.ts` (typed Axios
client with auth-token interceptor + 401 redirect). Client UI state (sidebar
collapse, theme, selected tenant) lives in Zustand stores. The
`PermissionGuard` component gates UI elements behind RBAC checks via the
`usePermissions` hook.

## API Integration

The frontend talks to the Dayjoy backend exclusively through `lib/api.ts` — a
typed Axios instance with:

- **Auth token interceptor** — reads JWT from `localStorage` and sets
  `Authorization: Bearer <token>` on every request.
- **Request ID generation** — every request gets an `X-Request-Id` header so
  logs can be correlated across services.
- **401 redirect** — on auth failure, clears the token and redirects to
  `/login`.
- **Typed methods** — every endpoint has a typed signature so pages get
  end-to-end type safety from React Query → Axios → NestJS controller.

```ts
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

const { data } = useQuery({
  queryKey: ["customers", { page, search }],
  queryFn: () => api.customers.list({ page, search }),
});
```

For page-local mutations (create/update/delete), use `useMutation` with the
relevant invalidation in `onSuccess`.

## State Management

| Concern                          | Tool                 | Notes                                                      |
| -------------------------------- | -------------------- | ---------------------------------------------------------- |
| Server state (lists, detail)     | TanStack React Query | `staleTime: 60s`, `refetchOnWindowFocus: false`, `retry: 1`|
| Auth session                     | Zustand              | Persists token + user in `localStorage`                    |
| UI state (sidebar, theme)        | Zustand              | Hydrated from `localStorage` on mount                      |
| Form state                       | React Hook Form      | Validated with Zod resolvers                              |
| Ephemeral local state            | `useState`           | Filter chips, dialog open/close                            |

## Theming

The dashboard ships **dark-first** (the default `:root` block) with a `.light`
class variant toggled by `next-themes`. The named palette — Void, Graphite,
Slate, Azure, Indigo, Cyan — is defined in `src/app/globals.css` and surfaced
as Tailwind tokens in `tailwind.config.ts`.

Useful utility classes already wired up:

- `glass-card`, `glass-panel` — translucent surfaces with backdrop blur
- `bg-aurora`, `text-gradient-aurora` — the brand gradient
- `shadow-glow`, `shadow-glow-cyan` — brand-tinted glows
- `shimmer-text`, `animate-pulse-dot` — animated accents

Switch theme via the topbar toggle (handled by `next-themes`).

## Testing

- **Unit**: Vitest + Testing Library, co-located as `*.test.tsx`.
  Pattern: render a component, query with role-based selectors, assert on
  text/attributes. See `components/ui/button.test.tsx`.
- **E2E**: Playwright under `e2e/`. Smoke tests cover login → dashboard →
  one page per top-level section.
- **Coverage**: `pnpm test:coverage` → V8 report in `coverage/`.

## Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for the full build, Docker, and
Vercel walk-through. The short version:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start    # or: docker build -t dayjoy-admin . && docker run -p 3000:3000 dayjoy-admin
```

## Documentation

- [Component Guide](COMPONENT_GUIDE.md) — every UI/common/charts/forms
  component with props, variants, and usage examples.
- [Folder Guide](FOLDER_GUIDE.md) — what lives where, and why.
- [Deployment Guide](DEPLOYMENT_GUIDE.md) — build, Docker, Vercel, post-deploy
  verification checklist.

---

Built for the Dayjoy AI Enterprise Platform. The UI is opinionated; the API
contract is not — see `shared/types/` for the source of truth on DTOs.
