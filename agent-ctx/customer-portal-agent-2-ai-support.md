# Task: customer-portal-agent-2-ai-support

**Agent:** full-stack-developer
**Date:** 2026-08-07
**Scope:** Customer Portal — AI Assistant, Support, Notifications, Settings, Documentation, Testing

## What was built

### Pages (12 total)
- `(portal)/ai-assistant/page.tsx` — full-page AI chat
- `(portal)/ai-assistant/history/page.tsx` — conversation history list
- `(portal)/ai-assistant/[id]/page.tsx` — resume past conversation
- `(portal)/support/page.tsx` — support home
- `(portal)/support/tickets/page.tsx` — my tickets table
- `(portal)/support/tickets/new/page.tsx` — new ticket form
- `(portal)/support/tickets/[id]/page.tsx` — ticket detail + thread
- `(portal)/support/live-chat/page.tsx` — real-time chat
- `(portal)/support/faqs/page.tsx` — searchable FAQs
- `(portal)/support/knowledge-base/page.tsx` — article grid
- `(portal)/support/knowledge-base/[slug]/page.tsx` — article detail
- `(portal)/notifications/page.tsx` — notification list
- `(portal)/settings/page.tsx` — 4-tab settings

### Components (10 total)
- AI: chat-window, chat-message, chat-input, chat-typing, citation-card, voice-button, whatsapp-button
- Support: ticket-form, ticket-status-badge, faq-item

### Tests (9 files)
- Unit: auth, products, orders, ai-chat, notifications, settings
- Integration: auth-flow, order-flow, ai-conversation (+ helpers.tsx)

### Documentation
- README.md, DEPLOYMENT_GUIDE.md, .env.example, tests/README.md

### Shared infrastructure (co-created with Agent 1)
- lib/api.ts (axios envelope-aware + getErrorMessage)
- lib/constants.ts (NAV_ITEMS, QUERY_KEYS, ROUTES, isPublicRoute, CustomerRole, FOOTER_LINKS, LANGUAGES, CURRENCIES, etc.)
- lib/utils.ts (cn, formatDate, formatCurrency, getInitials, etc.)
- types/index.ts (Conversation, ChatMessage, Citation, SupportTicket, NotificationItem, etc.)
- components/ui/* (button, card, input, textarea, label, badge, tabs, dialog, select, switch, accordion, scroll-area, separator, avatar, dropdown-menu, tooltip, popover, alert-dialog, empty-state)
- components/layout/portal-shell.tsx, page-header.tsx
- components/providers.tsx (React Query + ThemeProvider + Sonner)
- hooks/use-mobile.ts, use-speech.ts (Web Speech API)

## Coordination notes for Agent 1

Agent 1 has built (concurrently, on top of the shared infrastructure):
- Auth: login, register, forgot-password, reset-password, verify-otp, useAuth hook, auth.store
- Layout: customer-layout.tsx, customer-header.tsx, customer-footer.tsx, customer-sidebar.tsx, mobile-nav.tsx
- Catalog: products list/detail/category/search, product-card, ai-chat-widget
- Orders: orders list, order detail, invoice, return
- Profile: personal-details, address, documents, security, preferences tabs
- Cart: cart-drawer, cart.store
- Responsive: bottom-navigation, pull-to-refresh, responsive-card/chart/form/grid/sidebar/table, swipeable-card, touch-optimized-button
- Misc: dashboard, sw-registrar, use-theme/use-cart/use-debounce hooks, theme.store, ui.store

Agent 1 overwrote my initial `(portal)/layout.tsx`, `app/layout.tsx`, `app/page.tsx`, and `components/providers.tsx` with their own versions. I have not touched those — their versions work correctly with my code. I added the missing exports they depend on (`isPublicRoute`, `CustomerRole`, `APP_NAME_FULL`, `FOOTER_LINKS`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `LANGUAGES`, `CURRENCIES`, `getErrorMessage`, `brand-gradient` Tailwind class) so the integrated app compiles.

## API endpoints consumed (by my scope)

| Method | Endpoint | Component |
|--------|----------|-----------|
| POST | /ai/conversations | useCreateConversation |
| POST | /ai/conversations/:id/messages (SSE) | streamMessage |
| GET | /ai/conversations | useConversations |
| GET | /ai/conversations/:id | useConversation |
| DELETE | /ai/conversations/:id | useDeleteConversation |
| POST | /knowledge/query | useKnowledgeQuery |
| GET | /knowledge/articles | useKnowledgeArticles, useFaqs |
| GET | /knowledge/articles/:slug | useKnowledgeArticle |
| GET | /notifications | useNotifications |
| POST | /notifications/:id/read | useMarkNotificationRead |
| POST | /notifications/read-all | useMarkAllNotificationsRead |
| DELETE | /notifications/:id | useDeleteNotification |
| GET | /notifications/preferences | useNotificationPreferences |
| PUT | /notifications/preferences | useUpdateNotificationPreferences |
| POST | /support/tickets | useCreateTicket |
| GET | /support/tickets | useSupportTickets |
| GET | /support/tickets/:id | useSupportTicket |
| POST | /support/tickets/:id/replies | useReplyToTicket |
| PATCH | /support/tickets/:id/close | useCloseTicket |
| POST | /support/live-chat/start | useStartLiveChat |
| GET | /support/live-chat/active | useLiveChatSession |
| POST | /support/live-chat/:id/messages | useSendLiveChatMessage |

## Notes

- The `streamMessage` helper uses native `fetch` + `ReadableStream` instead of axios, so it can stream SSE tokens as they arrive. The hook gracefully degrades to a single POST when SSE isn't supported (handled in the catch path).
- The Voice button runs in demo mode unless `NEXT_PUBLIC_VAPI_PUBLIC_KEY` is set. The modal simulates connecting → active → ended states so the UX is fully demonstrable.
- The WhatsApp button generates a QR code via the public `api.qrserver.com` endpoint (no API key required) — keeps the implementation dependency-free.
- Tests run with `pnpm test` (Vitest + jsdom). All shims for browser APIs the components depend on are in `tests/setup.ts`.
