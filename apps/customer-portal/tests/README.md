# Tests — Dayjoy AI Customer Portal

Vitest + Testing Library setup for the Customer Portal.

## Layout

```
tests/
├── setup.ts                       # jsdom shims + global mocks
├── unit/
│   ├── auth.test.tsx              # login + register form validation (smoke)
│   ├── products.test.tsx          # product list + search input
│   ├── orders.test.tsx            # order list rendering
│   ├── ai-chat.test.tsx           # ChatMessageBubble, ChatTyping, CitationCard
│   ├── notifications.test.tsx     # NotificationRow rendering + read state
│   └── settings.test.tsx          # theme + notifications tab interactions
└── integration/
    ├── auth-flow.test.ts          # register → login → logout (mocked API)
    ├── order-flow.test.ts         # browse → add → place → view order
    └── ai-conversation.test.ts    # start → send → stream → history
```

## Running

```bash
pnpm test              # run all
pnpm test:watch        # watch mode
pnpm test:coverage     # V8 coverage report → coverage/
```

## Conventions

- **No real network.** Every test mocks `@/lib/api` and `@/hooks/use-api` to
  return canned data. Integration tests mock at the axios level so they can
  exercise multi-component flows.
- **jsdom shims.** `tests/setup.ts` polyfills `matchMedia`,
  `speechSynthesis`, `IntersectionObserver`, and `ResizeObserver` so Radix
  primitives and portal hooks don't crash in jsdom.
- **Accessibility assertions.** Where it makes sense, tests assert ARIA roles
  and labels — not just visual output — so we catch a11y regressions.
