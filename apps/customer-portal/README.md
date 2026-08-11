# Dayjoy AI — Customer Portal

> Next.js 15 customer self-service portal for the Dayjoy AI Enterprise Platform.

## Overview

The Customer Portal is the end-user surface of the Dayjoy AI platform. It lets
registered customers browse products, place and track orders, chat with the AI
assistant, raise support tickets, manage notifications, and personalise their
account — all in a responsive, mobile-first interface.

This app is one of several Next.js front-ends in the `apps/` directory of the
Dayjoy AI monorepo. It consumes the shared NestJS backend API and is deployed
independently to its own URL.

## Features

### Authentication & Account
- Login, register, OTP verification, password reset (built by Agent 1)
- Profile management (built by Agent 1)
- Account settings: theme, language, privacy, notification preferences

### Shopping & Orders (built by Agent 1)
- Product browsing + search + AI recommendations
- Order history + tracking + returns
- Cart + checkout

### AI Assistant (built by Agent 2 — this app)
- **Full-page AI chat** with streaming responses (SSE)
- **Markdown rendering** for assistant responses with tables, lists, code blocks
- **Citation cards** — source documents surfaced inline when the AI uses RAG
- **Voice input** via the Web Speech API (`SpeechRecognition`)
- **Voice output** — text-to-speech (`SpeechSynthesis`) toggle for replies
- **Voice call** modal (Vapi integration ready — drops in when `NEXT_PUBLIC_VAPI_PUBLIC_KEY` is set)
- **WhatsApp** shortcut — `wa.me` deep link + QR code modal
- **Conversation history** — searchable list, click to resume, delete to remove
- **Quick-reply chips** for first-time users
- **Copy** and **Listen** actions on every assistant reply

### Support (built by Agent 2)
- **Support Center** — quick links + recent tickets + contact options
- **My Tickets** — table with status / priority filters + search
- **New Ticket** — full form (subject, category, priority, description, attachments)
- **Ticket Detail** — conversation thread + reply form + close action
- **Live Chat** — real-time chat with a human support agent (waiting → active → ended)
- **FAQs** — searchable, category-filtered, expandable rows with "Was this helpful?" feedback
- **Knowledge Base** — browse articles by category, search, full-content article view

### Notifications (built by Agent 2)
- List of notifications (order, promotion, support, system)
- Filter by type, mark as read (individual + bulk), delete
- Click-through to related entity (e.g. an order or ticket)

### Settings (built by Agent 2)
- **Theme**: Light / Dark / Brand (Dayjoy orange) with live preview
- **Language**: 8 Indian languages + date format + time zone
- **Privacy**: data download request, account deletion request, cookie preferences, links to legal docs
- **Notifications**: per-channel toggles (email, SMS, WhatsApp, push), per-category toggles, quiet hours

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5 (strict) |
| UI | React 19, Tailwind CSS 4, shadcn/ui (New York) |
| Icons | lucide-react |
| State | Zustand (client), TanStack Query v5 (server) |
| Forms | react-hook-form + zod |
| Markdown | react-markdown + remark-gfm |
| Animations | framer-motion |
| HTTP | axios (envelope-aware interceptor) |
| Theme | next-themes |
| Toasts | sonner |
| Date | date-fns v4 |

## Getting Started

### Prerequisites
- Node.js 22+
- pnpm 9+ (workspace-aware)
- Access to the Dayjoy AI backend (default `http://localhost:8000/api`)

### Install & run

```bash
# From the monorepo root
pnpm install

# Or directly in this app
cd apps/customer-portal
pnpm install

# Copy env defaults
cp .env.example .env.local

# Start the dev server (port 3005 — chosen to avoid clashing with the admin dashboard)
pnpm dev  # → http://localhost:3005
```

### Environment variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `NEXT_PUBLIC_API_URL` | yes | `http://localhost:8000/api` | Backend API base URL |
| `NEXT_PUBLIC_APP_NAME` | no | `Dayjoy AI Customer Portal` | Browser title / brand |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | no | `919999999999` | WhatsApp support number for `wa.me` links |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | no | _(empty)_ | Vapi public key — enables live voice calls |
| `NEXT_PUBLIC_VAPI_ASSISTANT_ID` | no | _(empty)_ | Vapi assistant id used by the voice modal |

## Project Structure

```
apps/customer-portal/
├── src/
│   ├── app/
│   │   ├── (portal)/                  # Authenticated routes (sidebar + topbar)
│   │   │   ├── ai-assistant/
│   │   │   │   ├── page.tsx           # Full-page AI chat
│   │   │   │   ├── history/page.tsx   # Conversation history list
│   │   │   │   └── [id]/page.tsx      # Resume past conversation
│   │   │   ├── support/
│   │   │   │   ├── page.tsx           # Support home
│   │   │   │   ├── tickets/
│   │   │   │   │   ├── page.tsx       # My tickets table
│   │   │   │   │   ├── new/page.tsx   # New ticket form
│   │   │   │   │   └── [id]/page.tsx  # Ticket detail + thread
│   │   │   │   ├── live-chat/page.tsx
│   │   │   │   ├── faqs/page.tsx
│   │   │   │   └── knowledge-base/
│   │   │   │       ├── page.tsx       # Article grid
│   │   │   │       └── [slug]/page.tsx# Article detail
│   │   │   ├── notifications/page.tsx
│   │   │   └── settings/page.tsx      # 4-tab settings
│   │   ├── layout.tsx                 # Root layout (Providers)
│   │   ├── page.tsx                   # Redirects to /dashboard
│   │   └── globals.css                # Theme tokens + chat styles
│   ├── components/
│   │   ├── ai/                        # Chat, message, input, typing, citation, voice, WhatsApp
│   │   ├── support/                   # Ticket form, status badge, FAQ item
│   │   ├── layout/                    # PortalShell, PageHeader
│   │   ├── ui/                        # shadcn/ui primitives (Button, Card, Input, …)
│   │   └── providers.tsx              # React Query + ThemeProvider + Sonner
│   ├── hooks/
│   │   ├── use-ai.ts                  # Conversations + streaming
│   │   ├── use-api.ts                 # Tickets, live chat, knowledge, notifications
│   │   ├── use-speech.ts              # SpeechRecognition + SpeechSynthesis
│   │   └── use-mobile.ts
│   ├── lib/
│   │   ├── api.ts                     # Axios client (envelope-aware)
│   │   ├── constants.ts               # Nav, query keys, env-backed config
│   │   └── utils.ts                   # cn, date / currency formatters
│   ├── store/sidebar.store.ts
│   └── types/index.ts                 # Domain types (Conversation, Ticket, …)
├── tests/
│   ├── unit/                          # Vitest + Testing Library
│   └── integration/
├── README.md                          # This file
├── DEPLOYMENT_GUIDE.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json                    # shadcn/ui config
└── .env.example
```

## API Contract

The portal talks to the shared Dayjoy AI backend. Every response is wrapped in
the standard envelope:

```json
{
  "success": true,
  "data": { /* domain payload */ },
  "meta": { "requestId": "...", "timestamp": "...", "page": 1, "total": 42 }
}
```

The axios client in `src/lib/api.ts` auto-detects and unwraps the envelope, so
callers receive `T` directly. Errors are normalised into an `ApiError` shape
and surfaced via Sonner toasts (except 422 / 404 which are typically handled
by the page itself).

### Endpoints consumed (this app)

| Method | Endpoint | Used by |
|--------|----------|---------|
| `POST` | `/ai/conversations` | AI chat (create new conversation) |
| `POST` | `/ai/conversations/:id/messages` | AI chat (send message, SSE-streamed) |
| `GET`  | `/ai/conversations` | AI history list |
| `GET`  | `/ai/conversations/:id` | Resume past conversation |
| `DELETE` | `/ai/conversations/:id` | Delete conversation |
| `POST` | `/knowledge/query` | RAG query (used implicitly by AI) |
| `GET`  | `/knowledge/articles` | FAQs + Knowledge Base |
| `GET`  | `/knowledge/articles/:slug` | Article detail |
| `GET`  | `/notifications` | Notifications list |
| `POST` | `/notifications/:id/read` | Mark as read |
| `POST` | `/notifications/read-all` | Mark all as read |
| `DELETE` | `/notifications/:id` | Delete notification |
| `GET`  | `/notifications/preferences` | Load notification preferences |
| `PUT`  | `/notifications/preferences` | Save notification preferences |
| `POST` | `/support/tickets` | Create ticket |
| `GET`  | `/support/tickets` | List tickets |
| `GET`  | `/support/tickets/:id` | Ticket detail |
| `POST` | `/support/tickets/:id/replies` | Reply to ticket |
| `PATCH` | `/support/tickets/:id/close` | Close ticket |
| `POST` | `/support/live-chat/start` | Start live chat session |
| `GET`  | `/support/live-chat/active` | Get active session |
| `POST` | `/support/live-chat/:id/messages` | Send live-chat message |

## Documentation

- [Deployment Guide](DEPLOYMENT_GUIDE.md) — build, env vars, Vercel/Docker, post-deploy verification
- [Root monorepo README](../../README.md) — architecture, contribution, governance
- [AI system overview](../../docs/ai/00_AI_SYSTEM_OVERVIEW.md) — how the AI assistant is wired to the backend

## Testing

```bash
pnpm test              # run unit + integration (Vitest)
pnpm test:watch        # watch mode
pnpm test:coverage     # with V8 coverage
```

Tests live in `tests/unit/` (component-level) and `tests/integration/`
(full-flow). See `tests/README.md` for the testing strategy.

## Contribution

- **Lint**: `pnpm lint`
- **Type-check**: `pnpm typecheck`
- **Format**: `pnpm format`
- Follow the existing patterns: shadcn/ui primitives, React Query for server
  state, Zustand for ephemeral client state, `@/` path alias for imports.
- Don't introduce indigo / blue as a primary accent — the Dayjoy brand uses
  orange. Light theme is the default.

## License

Proprietary — © Dayjoy AI. See the root `LICENSE` file for details.
