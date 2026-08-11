# Accessibility Guide — Dayjoy AI Enterprise Portals

> Applies to: `apps/admin-dashboard`, `apps/customer-portal`,
> `apps/distributor-portal`, `apps/employee-portal`, `apps/website-chat`.

**Target:** WCAG 2.1 AA compliance on every Tier-1 page, verified
by axe DevTools + manual VoiceOver / TalkBack audit before every
release.

This guide is the canonical reference for accessibility patterns
in the Dayjoy AI Enterprise portals. Read it once before writing
any new screen.

---

## 1. WCAG 2.1 AA — the four principles (POUR)

Every page must be:

1. **Perceivable** — content is renderable in multiple ways
   (screen reader, magnifier, braille).
2. **Operable** — all interactions are reachable via keyboard,
   voice, switch, or pointer.
3. **Understandable** — content and behaviour are predictable.
4. **Robust** — content works across current and future
   assistive tech.

The success criteria below map to AA (with a couple of AAA items
we adopt as best practice).

---

## 2. Semantic HTML

Use the right element. Don't `<div>` everything.

| Want | Use | Not |
|------|-----|-----|
| Page landmark | `<main>`, `<header>`, `<nav>`, `<footer>`, `<aside>` | `<div role="main">` |
| Heading hierarchy | `<h1>` → `<h2>` → `<h3>` (no skips) | styled `<div>` |
| List | `<ul>` / `<ol>` + `<li>` | `<div>` with bullets |
| Form field | `<input>` + `<label>` | `<div>` with `onClick` |
| Button | `<button type="button">` | `<div role="button">` |
| Link | `<a href="...">` | `<span onClick>` |
| Table | `<table>` + `<thead>` + `<th scope>` | grid of `<div>`s |
| Dialog | Radix `<Dialog>` (focus trap + escape) | custom modal |
| Tooltip | Radix `<Tooltip>` (aria-describedby) | `title` attribute only |

---

## 3. Skip to content link

Every page that has a sidebar / header must start with a skip
link that's visible on focus:

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:shadow-lg"
>
  Skip to content
</a>
<main id="main-content">{children}</main>
```

Keyboard users Tab past the chrome in one keystroke.

---

## 4. Keyboard navigation

### 4.1 Tab order

The tab order must match the visual reading order (top-to-bottom,
left-to-right). Don't fight the DOM with positive `tabindex`.

- `tabindex="0"` — element is focusable in DOM order.
- `tabindex="-1"` — element is focusable only via JS
  (`element.focus()`), not Tab. Use for modal return-focus
  targets.
- `tabindex={1, 2, 3, ...}` — **never use**. It breaks DOM order.

### 4.2 Visible focus

Every interactive element must have a visible focus ring. Our
`globals.css` enforces this:

```css
:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
:focus:not(:focus-visible) {
  outline: none; /* hide for mouse users */
}
```

**Don't** remove `:focus-visible` globally to "clean up" the UI.

### 4.3 Keyboard interactions

| Element | Key | Action |
|---------|-----|--------|
| `<button>` | Enter / Space | Activate |
| `<a>` | Enter | Navigate |
| Dialog | Escape | Close |
| Drawer | Escape | Close |
| Tabs | ← / → | Switch tab |
| Menu | ↑ / ↓ | Move highlight |
| Menu | Escape | Close |
| Combobox | ↑ / ↓ / Enter / Escape | Standard ARIA pattern |

Use Radix primitives (`@radix-ui/react-*`) — they handle this
automatically.

---

## 5. ARIA labels

### 5.1 When to use `aria-label`

Only when the element's text content isn't descriptive enough
(icon-only buttons, etc.):

```tsx
<button aria-label="Close menu">
  <X className="h-4 w-4" />
</button>
```

### 5.2 When to use `aria-labelledby`

When a visible element already labels the control:

```tsx
<h3 id="dialog-title">Edit profile</h3>
<Dialog aria-labelledby="dialog-title">...</Dialog>
```

### 5.3 When to use `aria-describedby`

When a longer description (hint, error) is associated:

```tsx
<label htmlFor="email">Email</label>
<input id="email" aria-describedby="email-hint email-error" />
<p id="email-hint">We'll never share your email.</p>
<p id="email-error" role="alert">Email is required.</p>
```

### 5.4 Don't over-ARIA

If a native HTML element already conveys the semantics, don't
add ARIA. A `<button>` doesn't need `role="button"`. A `<nav>`
doesn't need `role="navigation"`.

---

## 6. Color contrast

WCAG 2.1 AA contrast ratios:

| Text type | Ratio | Example |
|-----------|-------|---------|
| Body text <18pt (<24px) | 4.5:1 | Most text |
| Body text ≥18pt (≥24px) or bold ≥14pt | 3:1 | Large headings |
| UI components + graphical objects | 3:1 | Icons, borders, focus rings |

Use the design tokens from `globals.css` (e.g. `text-foreground`,
`text-muted-foreground`) — they're tuned for AA on both light and
dark themes.

**Don't** use `text-muted-foreground/50` — that drops below 4.5:1.

### 6.1 Don't rely on color alone

| Bad | Good |
|-----|------|
| Red text alone for error | Red text + ⚠ icon + `role="alert"` |
| Green background for "active" | Green + ✓ icon + `<Badge>` |
| Grey for "disabled" | Grey + `aria-disabled` + cursor:not-allowed |

---

## 7. Images + media

### 7.1 Decorative images

`alt=""` (empty string) tells the screen reader to skip:

```tsx
<img src="/decorative-pattern.png" alt="" />
```

### 7.2 Informative images

Concise `alt` describing what the image conveys:

```tsx
<img src="/chart-explainer.png" alt="Revenue grew 23% in Q3" />
```

### 7.3 Functional images

`alt` describing the action:

```tsx
<img src="/search.png" alt="Search" />
```

### 7.4 Next.js `<Image>`

`alt` is required. For decorative:

```tsx
<Image src="/hero.png" alt="" width={1280} height={720} />
```

---

## 8. Forms

Every form must:

1. Have a `<label htmlFor={id}>` for every input.
2. Mark required fields with `*` + `aria-required="true"`.
3. Link error messages via `aria-describedby` + `role="alert"`.
4. Set `aria-invalid="true"` on inputs with errors.
5. Group related fields with `<fieldset>` + `<legend>`.
6. Use `autoComplete` for known field types.
7. Never disable submit buttons silently — show why they're
   disabled via `aria-describedby` or a tooltip.

Use `<ResponsiveFormField>` — it handles 1–4 automatically:

```tsx
<ResponsiveFormField
  label="Email"
  required
  error={errors.email?.message}
  hint="We'll never share your email."
>
  <Input type="email" autoComplete="email" />
</ResponsiveFormField>
```

---

## 9. Error identification

Errors must be:

1. **Visible** in the UI (not just a console log).
2. **Programmatic** — `role="alert"` or `aria-live="assertive"`.
3. **Linked** to the input via `aria-describedby`.
4. **Specific** — "Email is required" not "Invalid input".

```tsx
<input
  id="email"
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? "email-error" : undefined}
/>
{errors.email && (
  <p id="email-error" role="alert" className="text-destructive">
    {errors.email.message}
  </p>
)}
```

---

## 10. Live regions

| Region | Use case | ARIA |
|--------|----------|------|
| Toasts | "Saved!" | Sonner's `<Toaster>` (uses `role="status"`) |
| Form errors | Validation messages | `role="alert"` |
| Loading state | "Loading…" | `aria-live="polite"` + `aria-busy="true"` |
| Pull-to-refresh status | "Refreshing…" | `aria-live="polite"` (in `<PullToRefresh>`) |
| Chat replies | New message arrived | `aria-live="polite"` on the messages container |

Don't use `aria-live="assertive"` for non-critical updates — it
interrupts the user.

---

## 11. Reduced motion

Some users get motion sickness from animations. Respect
`prefers-reduced-motion: reduce`.

Our `globals.css` already does:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

For JS-driven animations (framer-motion), use the hook:

```tsx
import { usePrefersReducedMotion } from "@/lib/mobile";

const reduced = usePrefersReducedMotion();

<motion.div
  animate={{ opacity: 1 }}
  transition={reduced ? { duration: 0 } : { duration: 0.3 }}
/>
```

---

## 12. Touch targets (mobile)

WCAG 2.1 AA + Apple/Google guidelines: **44×44px minimum**.

Our `globals.css` enforces this for all interactive elements on
touch devices (`pointer: coarse`). For icon-only buttons, also
use `<TouchOptimizedButton>` which guarantees the hit area via
an overlay.

---

## 13. Screen reader testing

### 13.1 VoiceOver (macOS / iOS)

- Enable: System Settings → Accessibility → VoiceOver (⌘F5).
- Navigate: ↑↓ to move, → to enter, ← to exit, Ctrl+Opt+Space to activate.
- Test: every interactive element must announce its label + role.
- Test: form errors must announce when they appear.

### 13.2 TalkBack (Android)

- Enable: Settings → Accessibility → TalkBack.
- Navigate: swipe right to move, double-tap to activate.
- Same test cases as VoiceOver.

### 13.3 NVDA (Windows — free)

- Download from nvaccess.org.
- Navigate: ↑↓ to move, Enter to activate, H to jump by heading.
- Same test cases as VoiceOver.

### 13.4 Common VoiceOver/TalkBack issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Button" announced with no label | Missing `aria-label` | Add `aria-label="Save"` |
| Form field announces "Edit, blank" | Missing `<label>` | Add `<label htmlFor>` |
| Modal not announced | Missing `role="dialog"` | Use Radix `<Dialog>` |
| Tab order skips element | `tabindex="-1"` mistakenly | Remove `tabindex="-1"` |
| Heading skipped | `<h1>` → `<h3>` | Use `<h2>` in between |
| List not announced | Used `<div>` instead of `<ul>` | Use real list elements |
| Decorative image announced | Missing `alt=""` | Add `alt=""` |

---

## 14. Automated testing

### 14.1 axe DevTools

Browser extension. Run on every page during dev. Zero violations
on Tier-1 pages.

### 14.2 Lighthouse Accessibility audit

Lighthouse CI runs the a11y audit on every PR. Score must be ≥95.

### 14.3 jest-axe (unit tests)

For component-level tests:

```tsx
import { render } from "@testing-library/react";
import { axe } from "jest-axe";

test("Button has no a11y violations", async () => {
  const { container } = render(<Button>Save</Button>);
  expect(await axe(container)).toHaveNoViolations();
});
```

### 14.4 Playwright a11y checks

```ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("Dashboard has no a11y violations", async ({ page }) => {
  await page.goto("/dashboard");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(v => v.impact === "critical")).toEqual([]);
});
```

---

## 15. Pre-release a11y checklist

Before tagging a release, the release engineer must sign off:

- [ ] axe DevTools shows 0 violations on every Tier-1 page.
- [ ] Lighthouse a11y score ≥95 on every Tier-1 page.
- [ ] VoiceOver walkthrough complete (iPhone 12).
- [ ] TalkBack walkthrough complete (Galaxy S24).
- [ ] NVDA walkthrough complete (Windows, on a sample of pages).
- [ ] Keyboard-only walkthrough — every interactive element
      reachable via Tab, every action activatable via Enter/Space,
      every modal closeable via Escape.
- [ ] Visible focus ring present on every interactive element.
- [ ] All form errors are programmatically linked
      (`aria-describedby`).
- [ ] All images have appropriate `alt` (decorative = `""`).
- [ ] Color contrast ≥4.5:1 for body text, ≥3:1 for large text
      and UI elements.
- [ ] `prefers-reduced-motion: reduce` respected.
- [ ] `prefers-color-scheme: dark` respected (if applicable).
- [ ] Skip-to-content link present and visible on focus.
- [ ] Page has a single `<h1>`, logical heading hierarchy.
- [ ] Document language set (`<html lang="en">`).
- [ ] `<title>` is descriptive and unique per page.

---

## 16. Resources

- [WCAG 2.1 AA quick reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [Inclusive Components](https://inclusive-components.design/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [jest-axe](https://github.com/nickcolley/jest-axe)
- [Playwright a11y testing](https://playwright.dev/docs/accessibility-testing)

---

## 17. Related files

- `src/components/responsive/` — accessible responsive components.
- `src/lib/mobile.ts` — `usePrefersReducedMotion`, `useSafeAreaInsets`.
- `src/app/globals.css` — focus ring, reduced-motion, font-size 16px.
- `docs/RESPONSIVE_DESIGN_GUIDE.md` — layout patterns.
- `docs/MOBILE_TESTING_STRATEGY.md` — device + browser matrix.
