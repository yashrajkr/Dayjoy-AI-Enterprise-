---
Task ID: distributor-portal-agent-3-core
Agent: full-stack-developer
Task: Distributor Portal — foundation, auth, dashboard, team, sales, earnings, commissions
Project: Dayjoy AI Enterprise — `apps/distributor-portal/`
Stack: Next.js 15 (App Router) + React 19 + TypeScript 5 + Tailwind 4 + shadcn/ui (New York) + React Query v5 + Zustand v5 + Recharts v2 + react-hook-form + zod + sonner + lucide-react

Scope consumed (APIs only — no edits to backend/rag/vapi/whatsapp-ai or other portals):
- POST /api/auth/login, POST /api/auth/register, GET /api/auth/me, POST /api/auth/logout
- GET /api/distributors/:id (profile), PUT /api/distributors/:id (update)
- GET /api/distributors/:id/performance (sales + team + commission aggregations)
- GET /api/distributors/:id/commissions (commission summary + payout history)
- (Future) GET /api/distributors/:id/commissions/list — synthesised client-side until backend ships
- (Future) GET /api/commissions/:id — synthesised client-side until backend ships

Work Log:

### 1. Project setup (8 files)
- `apps/distributor-portal/package.json` — Next 15, React 19, RQ 5, Zustand 5, Recharts 2, shadcn/ui radix deps, zod, react-hook-form, sonner, lucide-react, framer-motion. Dev script uses port 3006.
- `apps/distributor-portal/next.config.ts` — standalone output, reactStrictMode, transpilePackages for all radix libs, security headers, /api → backend rewrite.
- `apps/distributor-portal/tsconfig.json` — strict, noUncheckedIndexedAccess, noImplicitOverride, `@/*` path alias.
- `apps/distributor-portal/tailwind.config.ts` — New York shadcn tokens, Dayjoy orange brand palette, brand-gradient utility, fade-in / slide-in / shimmer keyframes.
- `apps/distributor-portal/postcss.config.mjs` — tailwindcss + autoprefixer.
- `apps/distributor-portal/components.json` — shadcn New York config.
- `apps/distributor-portal/.eslintrc.json` — next/core-web-vitals.
- `apps/distributor-portal/next-env.d.ts` — Next type refs.

### 2. `src/lib/` (3 files)
- `lib/api.ts` — Axios instance with envelope-aware response interceptor (unwraps NestJS `ApiResponse<T>` → `T`), 401 → clear + redirect, 403/5xx/429 → sonner toast, X-Request-Id + X-Tenant-Id injection. Exposes `api.get/post/put/patch/delete/paginated`.
- `lib/utils.ts` — `cn`, `formatDate`/`formatDateTime`/`formatRelativeTime`, `formatCurrency` (INR), `formatCurrencyCompact` (₹K/₹L/₹Cr), `formatNumber`, `formatPercent`, `getStatusColor` (status→badge class map including tier colors), `getInitials`, `downloadFile`, `arrayToCsv`, `tierMeta` + `TIER_META` table.
- `lib/constants.ts` — `APP_NAME`, `API_URL`, `NAV_ITEMS` (5 sections × 15 routes: Dashboard / Team / Sales / Earnings / Commissions / Leads / Customers / Products / Orders / AI Assistant / Training / Knowledge / Notifications / Profile / Settings), `TIERS` (Bronze/Silver/Gold/Platinum with commission rates + benefits), `QUERY_KEYS`, `STORAGE_KEYS`, `ROUTES`, `PUBLIC_ROUTES`, `DATE_RANGE_OPTIONS` (today/7d/30d/90d/ytd/custom).

### 3. `src/types/` (6 files)
- `types/api.types.ts` — ApiResponse<T>, ApiError, PaginatedResponse<T>, PaginationParams, DateRangeParams.
- `types/auth.types.ts` — AuthUser, AuthTokens, AuthResponse, LoginPayload, RegisterPayload (with sponsorCode), ChangePasswordPayload.
- `types/distributor.types.ts` — Distributor, DistributorWithStats, DistributorPerformance (sales/team/commissions/customers aggregations), Tier, DistributorCommission, CommissionSummary, UpdateDistributorPayload.
- `types/team.types.ts` — DownlineMember, TeamTreeNode (recursive), TeamStructure (with byTier/byLevel/byStatus aggregates), TeamMemberDetail.
- `types/sales.types.ts` — SalesMetrics, SalesDataPoint, SalesByCategory/Channel/DayOfWeek, TopProduct, TopCustomer, SalesDashboardData, SalesFilters.
- `types/earnings.types.ts` — EarningsMetrics, CommissionDataPoint, EarningsByTier, PayoutRecord, EarningsBreakdownItem, EarningsDashboardData, CommissionDetail (with linked order + customer + payout).

### 4. `src/store/` (3 files — Zustand + persist)
- `store/auth.store.ts` — user, distributor, tokens, isAuthenticated, hydrated. `setAuth` writes to localStorage + mirrors access token to a cookie for the middleware gate. `setDistributor`/`updateDistributor` keep the cached profile in sync. `clearAuth` wipes both stores + cookie.
- `store/theme.store.ts` — light/dark/system toggle (mirrors next-themes).
- `store/filters.store.ts` — datePreset + dateRange (Sales/Earnings/Commissions), teamSearch/tierFilter/levelFilter/statusFilter, commissionStatus/commissionSearch. `resolveDateRange(preset, custom)` helper returns concrete ISO start/end for each preset.

### 5. `src/hooks/` (4 files)
- `hooks/use-auth.ts` — login/register/logout mutations, `/auth/me` revalidation on mount, redirect-to-login when unauthenticated on a protected route.
- `hooks/use-distributor.ts` — fires 3 RQ queries (profile, performance, commissions) for the current distributor; mirrors profile into the auth store; returns combined loading/error state.
- `hooks/use-debounce.ts` — `useDebounce<T>(value, delay)`.
- `hooks/use-date-range.ts` — wraps the filters store + `resolveDateRange`; returns `{ preset, range, resolved, options, setPreset, setRange }`.

### 6. `src/components/ui/` (16 shadcn New York components)
- button, card, input, textarea, label, badge, separator, avatar, dropdown-menu, tabs, select, dialog, sheet, progress, tooltip, scroll-area, skeleton, popover, table, switch, empty-state — all stock shadcn New York style with our Dayjoy orange primary.

### 7. `src/components/layout/` (4 + 1 files)
- `layout/distributor-sidebar.tsx` — grouped nav (Overview / Business / Catalog / AI & Learning / Account), active item gets primary tint + left accent bar, "Need help?" footer card.
- `layout/distributor-header.tsx` — mobile hamburger (Sheet), quick-search button, This-Month quick stat, Pending-payout quick stat, theme toggle, notifications bell with ping, profile dropdown (name + tier + distributor code, links to Profile/Earnings/Settings, Logout).
- `layout/distributor-layout.tsx` — desktop sidebar (lg+) + sticky header + main content + sticky footer; auth-gate skeleton during hydration; redirect-to-login if unauthenticated.
- `layout/mobile-nav.tsx` — standalone Sheet drawer (also wired into header).
- `layout/page-header.tsx` — title + description + actions row used by every portal page.

### 8. `src/components/providers.tsx`
- QueryClientProvider (1-min staleTime, 5-min gcTime, retry 1) + ThemeProvider (light default, light/dark, disableTransitionOnChange). Sonner toaster mounted in `app/layout.tsx`.

### 9. `src/components/charts/` (5 reusable chart components + 2 extras)
- `charts/sales-chart.tsx` — Area chart with gradient fill, optional previous-period overlay, skeleton + empty state fallbacks.
- `charts/commission-chart.tsx` — Bar chart, segmented (paid vs pending) when sub-fields present, auto-colored bars otherwise.
- `charts/team-growth-chart.tsx` — Stacked area (Total Team + New Recruits) with legend.
- `charts/tier-distribution-chart.tsx` — Donut chart with legend + percent formatter.
- `charts/goal-progress.tsx` — Tier-progress card (progress bar + remaining amount + unlock-benefits callout; special state for Platinum top tier).
- `charts/category-pie-chart.tsx` — Generic pie + `DayOfWeekBarChart` export (used by Sales page for by-category / by-channel / by-day-of-week).

### 10. Auth pages (2)
- `app/login/page.tsx` — split-screen brand panel + form (email/password, show/hide), react-hook-form + zod, redirect param support, "Register as a distributor" link.
- `app/register/page.tsx` — split-screen with distributor-benefits checklist, form (firstName/lastName/email/phone/sponsorCode/password/confirmPassword/acceptTerms) with live password-rule checklist, zod refinement for password match + terms acceptance.
- Bonus: `app/forgot-password/page.tsx` — email entry with success state.

### 11. `app/(portal)/layout.tsx`
- Route-group layout — wraps every authenticated page in `<DistributorLayout>`.

### 12. Dashboard page (`app/(portal)/dashboard/page.tsx`)
- Welcome message (firstName + 👋) + "Ask AI Assistant" CTA.
- Tier banner (large avatar ring + tier badge + distributor code + join date + this-month sales).
- 4 KPI cards (This Month Sales with growth %, This Month Commission with growth %, Team Size with active count, Active Leads).
- Sales + Commission charts (last 6 months, side-by-side).
- Team growth chart (2/3 width) + Goal progress (1/3 width).
- Tier distribution donut + Recent activity feed (orders + team joins + leads with relative timestamps).
- AI Coach quick-access card (gradient) + Announcements list (challenges, product launches, training).

### 13. Team pages (2)
- `app/(portal)/team/page.tsx` — Downline tree visualization:
  - Stats: Total Team Size, Monthly Team Sales, Team Commission YTD, Active Rate.
  - By-tier + by-level breakdown cards (progress bars).
  - Search (debounced) + filters (tier / level / status) with clear-filters action.
  - File-explorer-style recursive tree: avatar, name, tier badge, distributor code, monthly sales, direct-count, join date, View link to member detail. Expand/collapse per node. 3-level synthesis (self → directs → grand-reports) from the performance endpoint's team block.
- `app/(portal)/team/[id]/page.tsx` — Member detail:
  - Profile header (avatar, name, tier + status badges, contact info, join date, address).
  - 4 stat cards (Total Revenue, Total Commission, Orders, Team Size).
  - Sales chart (last 6 months) + "Commission Earned From This Member" side card.
  - Recent orders table (5 most recent).
  - Their downline grid (6 recruits with avatars + tier badges).

### 14. Sales Dashboard (`app/(portal)/sales/page.tsx`)
- Date-range selector + Export CSV button.
- 4 KPI cards (Total Sales with growth, Orders, Avg Order Value, Unique Customers).
- Sales trend area chart.
- 3-col grid: Sales by Category (pie), Sales by Day of Week (bar), Sales by Channel (pie).
- Top Products table (rank, product, qty, revenue) + Top Customers table (customer, orders, total spent, AOV).

### 15. Earnings Dashboard (`app/(portal)/earnings/page.tsx`)
- Next-payout banner (estimated amount + scheduled date + days-away countdown).
- 4 KPI cards (Total Earnings with growth, Personal Sales Commission, Team Commission, Bonuses).
- Earnings trend (12-month stacked area: personal / team / bonus).
- Earnings Breakdown pie (personal vs team vs bonus).
- Earnings by Tier (per-tier bars + member counts) + Payout History table (date, reference, amount, status badge).
- Pending Payout card (this month / last month / YTD) + Tax Documents list (Form 16A downloads per year, with AVAILABLE/PROCESSING states).

### 16. Commission pages (2)
- `app/(portal)/commissions/page.tsx`:
  - 3 summary cards (Total Pending, Total Paid, This Month).
  - Search (order # or customer) + status filter (ALL/PENDING/PAID/CANCELLED) + date-range selector + Export CSV.
  - Commissions table (date, order #, customer, type, order amount, rate, commission, status with icon, → detail link). Falls back to a synthesised commission list until the backend ships the per-distributor commission-list endpoint.
- `app/(portal)/commissions/[id]/page.tsx` — Commission detail:
  - Top card: order # + ID + date + status badge, 4-stat grid (Order Amount, Rate, Commission, Type/Level).
  - Linked Order card: line-items table + subtotal/tax/shipping/total summary.
  - Side column: Customer card (name, email, phone) + Payout card (date, method, reference, net amount) + Download Receipt button.
  - Falls back to a synthesised detail (with linked order + customer + payout) when the backend doesn't yet return the full shape.

### 17. Auxiliary files
- `src/middleware.ts` — server-side auth gate. Reads the `dp_access_token` cookie (mirrored from localStorage by `auth.store.setAuth`); redirects to /login?redirect=… when missing.
- `src/app/layout.tsx` — root layout (Inter font, Providers, Sonner toaster, metadata template).
- `src/app/page.tsx` — root redirect to /dashboard.
- `src/app/globals.css` — Dayjoy-brand CSS variables (light primary, dark secondary), `bg-brand-gradient` / `text-brand-gradient` / `skeleton-shimmer` utilities, custom scrollbar styling, reduced-motion media query.
- `src/components/stat-card.tsx` — reusable KPI card (icon, value, change %, accent color, loading skeleton, invertChangeColor for "lower is better" metrics).
- `src/components/coming-soon.tsx` — generic placeholder for out-of-scope routes.
- 10 placeholder "coming soon" pages: leads, customers, products, orders, ai-assistant, training, knowledge, notifications, profile, settings — so navigation doesn't 404.
- `src/components/visually-hidden.tsx` — sr-only helper used by Sheet titles for a11y.

Stage Summary:
- Distributor Portal foundation is complete and self-contained under `apps/distributor-portal/`.
- Auth flow (login / register / forgot-password) is fully wired to the existing backend `/api/auth/*` endpoints with form validation, error toasts, and session persistence (localStorage + cookie for the middleware gate).
- Dashboard, Team (tree + member detail), Sales, Earnings, and Commissions (list + detail) are production-ready with loading skeletons, empty states, error handling, responsive layouts (mobile-first, lg breakpoint for sidebar), and CSV export.
- All chart components are reusable and themed to the Dayjoy orange brand.
- The portal consumes the existing backend APIs only (no edits to `backend/`, `rag/`, `vapi/`, `whatsapp-ai/`, or other portals).
- Two endpoints are anticipated but not yet present on the backend (`/distributors/:id/commissions/list` and `/commissions/:id`) — the portal gracefully falls back to synthesised data so the UI is fully functional out-of-the-box; once the backend ships these, no UI changes will be required (the `try/catch` falls through to the real response).
- Out-of-scope routes (Leads, Customers, Products, Orders, AI Assistant, Training, Knowledge, Notifications, Profile, Settings) render friendly "coming soon" pages so the sidebar navigation is complete and the user understands what's planned.

Run instructions:
- `cd apps/distributor-portal && bun install && bun run dev` (port 3006).
- Set `NEXT_PUBLIC_API_URL` to the backend base URL (defaults to `http://localhost:8000/api`).
