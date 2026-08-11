# Task: customer-portal-agent-1-foundation

**Agent:** full-stack-developer
**Scope:** `apps/customer-portal/` — Customer Portal foundation (project setup, lib, types, stores, hooks, UI components, layout, providers, auth, dashboard, profile, products, orders)
**Date:** 2025

## What I built

A complete, production-ready Customer Portal Next.js 15 + React 19 app at
`apps/customer-portal/`. The portal consumes the shared Dayjoy backend APIs
(auth, products, orders, customers, AI, notifications, knowledge, support)
and does NOT modify any backend, RAG, VAPI, or sibling-app code.

### 1. Project setup
- `package.json` (`@dayjoy/customer-portal`, dev on port 3005)
- `next.config.ts` (standalone output, API rewrite proxy to backend, security
  headers, image remote patterns, radix transpilePackages)
- `tsconfig.json` (strict, `noUncheckedIndexedAccess`, `@/*` path alias)
- `tailwind.config.ts` (warm Dayjoy-orange brand palette, light+dark, custom
  animations)
- `postcss.config.mjs`, `components.json`, `.eslintrc.json`, `.gitignore`,
  `next-env.d.ts`
- `src/app/globals.css` — design tokens (warm cream/white light theme + dark
  mode, dayjoy orange primary, success/warning/info/destructive semantic
  colors, thin scrollbars, reduced-motion support)
- `src/app/layout.tsx` — root layout (Geist font, metadata, viewport,
  Providers wrapper)

### 2. `src/lib/`
- `api.ts` — typed Axios client with JWT Bearer interceptor, X-Request-ID
  tracing, ApiResponse envelope auto-unwrap, 401→/login redirect, error
  toasts via sonner, `api.get/post/put/patch/delete` + `api.paginated`
- `utils.ts` — `cn`, formatDate/DateTime/RelativeTime, formatCurrency
  (INR locale), formatNumber/Percent, slugify, getInitials, getStatusColor,
  titleCase, buildQueryString, safeJsonParse
- `constants.ts` — APP_NAME, NAV_ITEMS (Dashboard/Products/Orders/AI
  Assistant/Support/Notifications/Profile/Settings), FOOTER_LINKS,
  QUERY_KEYS, STORAGE_KEYS, ROUTES, PUBLIC_ROUTES, CURRENCIES, LANGUAGES

### 3. `src/types/` (6 files)
- `api.types.ts` — ApiResponse, PaginatedResponse, PaginationParams, ApiError
- `auth.types.ts` — User, AuthTokens, AuthSession, LoginDto, RegisterDto,
  ForgotPasswordDto, ResetPasswordDto, VerifyOtpDto + response types
- `product.types.ts` — Product, ProductDetail, ProductCategory,
  ProductFilters, ProductSortOption, CartItem, ProductRecommendation, reviews,
  specs, pricing, availability
- `order.types.ts` — Order, OrderItem, OrderTotals, ShippingAddress,
  PaymentInfo, OrderTrackingEvent, OrderInvoice, CreateOrderDto, OrderReturn,
  ReturnRequestItem, OrderFilters
- `customer.types.ts` — Customer, CustomerAddress, CustomerDocument,
  CustomerSession, CustomerPreferences, UpdatePersonalDetailsDto,
  CreateAddressDto, ChangePasswordDto, UpdatePreferencesDto
- `notification.types.ts` — Notification, NotificationType,
  NotificationPreferences

### 4. `src/store/` (4 Zustand stores)
- `auth.store.ts` — user, tokens, isAuthenticated, isLoading, isHydrating;
  persisted to localStorage
- `theme.store.ts` — light/dark/system mode, persisted
- `cart.store.ts` — items, addItem/removeItem/updateQuantity/clearCart,
  drawer open state, derived itemCount/subtotal; persisted
- `ui.store.ts` — mobileNavOpen, sidebarCollapsed; persisted

### 5. `src/hooks/` (5 hooks)
- `use-auth.ts` — React Query mutations for login/register/forgot/reset/
  verifyOtp/resend/refresh/logout, `/auth/me` rehydration, hasRole guard
- `use-cart.ts` — selector wrapper over cart store
- `use-debounce.ts` — debounced value (used by search)
- `use-theme.ts` — bridges next-themes + Zustand theme store
- `use-mobile.ts` — viewport breakpoint detection

### 6. `src/components/ui/` (20 shadcn/ui components)
button, card, input, textarea, label, badge, dialog, dropdown-menu, tabs,
toast, toaster, avatar, separator, select, checkbox, switch, table, skeleton,
progress, empty-state, sheet, slider, radio-group

### 7. `src/components/layout/` (5 components)
- `customer-header.tsx` — sticky top bar: brand, search, theme toggle,
  notifications dropdown, cart icon with badge, profile menu (avatar, links,
  sign-out)
- `customer-footer.tsx` — link columns, contact info, social icons,
  sticky-bottom copyright (mt-auto)
- `customer-sidebar.tsx` — collapsible desktop rail with section nav
- `mobile-nav.tsx` — slide-in drawer for <md breakpoint
- `customer-layout.tsx` — header + sidebar + main + footer shell
  (min-h-screen flex flex-col so footer sticks to bottom)

### 8. `src/components/providers.tsx`
React Query (QueryClient with sensible defaults) + next-themes ThemeProvider
(light default, system) + Radix Toaster + Sonner Toaster.

### 9. Auth pages (5) + root redirect
- `src/app/page.tsx` — redirects to /dashboard or /login
- `src/app/login/page.tsx` — email+password RHF+Zod form, remember-me,
  forgot-password + register links, redirect param support
- `src/app/register/page.tsx` — firstName/lastName/email/phone/password/
  confirm + terms checkbox, live password-strength checklist, strong-password
  Zod validation, auto-login or OTP-verify redirect
- `src/app/forgot-password/page.tsx` — email form → success state
- `src/app/reset-password/page.tsx` — new password + confirm with
  strength checks, reads token from query
- `src/app/verify-otp/page.tsx` — 6-digit OTP with paste support,
  auto-advance, backspace nav, resend cooldown
- `src/components/auth/auth-shell.tsx` — split-screen brand hero + form layout

### 10. `(portal)` layout + Dashboard
- `src/app/(portal)/layout.tsx` — client-side auth guard wrapping
  CustomerLayout; redirects to /login if unauthenticated
- `src/app/(portal)/dashboard/page.tsx` — personalised greeting, 4 stat
  cards (total/active orders, reward points, lifetime spend), recent orders
  list, notifications preview, AI assistant quick-access card, AI
  recommended products grid

### 11. Profile pages (5 tabs)
- `src/app/(portal)/profile/page.tsx` — tabbed layout
- `personal-details-tab.tsx` — editable form + avatar upload
- `address-tab.tsx` — address list, add/edit dialog, set-default, delete
- `documents-tab.tsx` — document list, upload, download, delete
- `security-tab.tsx` — change password, 2FA toggle, active sessions revoke
- `preferences-tab.tsx` — language, currency, notification channels,
  marketing opt-ins, newsletter

### 12. Products pages (4)
- `src/app/(portal)/products/page.tsx` — grid + filter sidebar (category,
  price slider, availability, brands, rating) + sort + pagination + mobile
  filter sheet + debounced search
- `src/app/(portal)/products/[id]/page.tsx` — image gallery, price/rating,
  quantity selector, add-to-cart, trust badges, tabs (description/specs/
  reviews/AI insights), related products, "Ask AI" dialog
- `src/app/(portal)/products/search/page.tsx` — faceted search results
- `src/app/(portal)/products/category/[slug]/page.tsx` — category-filtered list
- `src/components/products/product-card.tsx`, `ai-chat-widget.tsx`

### 13. Orders pages (4)
- `src/app/(portal)/orders/page.tsx` — history table (desktop) + cards
  (mobile), status filter pills, search by order number
- `src/app/(portal)/orders/[id]/page.tsx` — items, totals, shipping/payment
  info, tracking timeline, invoice/return/reorder actions
- `src/app/(portal)/orders/[id]/invoice/page.tsx` — printable invoice
  (print-hidden toolbar, Print + Download PDF)
- `src/app/(portal)/orders/[id]/return/page.tsx` — return request form
  (select items, qty, reason, pickup notes)

### Bonus (nav completeness)
- `src/app/(portal)/notifications/page.tsx` — list + mark-read / mark-all-read
- `src/app/(portal)/assistant/page.tsx` — full AI chat with conversation list
- `src/app/(portal)/support/page.tsx` — KB search + support ticket form
- `src/app/(portal)/settings/page.tsx` — quick links + appearance + localization
- `src/app/(portal)/checkout/page.tsx` — cart checkout (address select,
  payment method, order summary, place order)
- `src/components/cart/cart-drawer.tsx` — slide-in cart panel

## Patterns followed (from admin-dashboard reference)
- Axios client with ApiResponse envelope unwrap + 401 redirect
- shadcn/ui (new-york style) with cva variants
- React Query for all server state; Zustand (persisted) for client state
- React Hook Form + Zod for every form
- framer-motion for subtle transitions
- next-themes for light/dark
- sonner for toasts (used by api.ts interceptor)

## Notes for downstream agents
- This portal is a SEPARATE Next.js app at port 3005 (own package.json,
  configs, node_modules). It is NOT the main `/home/z/my-project` Next app.
- It consumes the shared backend via `NEXT_PUBLIC_API_URL` (defaults to
  `http://localhost:8000/api`) and proxies `/api/*` in dev via next.config
  rewrites.
- Auth is client-side (Zustand-persisted tokens + `/auth/me` rehydration +
  401 interceptor redirect). A server-side middleware can be added later.
- The customer-portal `src/` directory also contains files from OTHER agents
  (responsive/*, ai/*, support/* sub-routes, types/index.ts barrel,
  portal-shell.tsx, sidebar.store.ts, accordion/alert-dialog/popover/
  scroll-area/tooltip UI components, use-ai/use-api/use-speech hooks,
  mobile.ts/performance.ts libs, offline page, sw-registrar). Those are
  out of my scope; my deliverables are self-consistent and import only from
  my own modules. Coordination may be needed if a unified `next build` is
  run, since the other agents use a different type barrel (`@/types`
  index.ts) and may reference my hooks/stores with different expectations.
