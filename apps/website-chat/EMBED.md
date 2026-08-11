# Dayjoy AI — Website Chat Widget Embedding Guide

The Dayjoy AI chat widget is a single-file JavaScript bundle that
adds an AI-powered chat assistant to **any** website in under a
minute — no React, no build step, no npm install required.

## Quick start (auto-init)

Copy this snippet into your website's `<head>` or just before
`</body>`:

```html
<script
  src="https://cdn.dayjoy.ai/chat-widget.js"
  data-api-url="https://api.dayjoy.ai"
  data-assistant-name="Dayjoy AI"
  data-brand-color="#E07A1F"
  data-position="bottom-right"
  data-welcome-message="Hi! I'm the Dayjoy assistant. How can I help you today?"
  data-require-pre-chat="true"
  async
></script>
```

That's it. The launcher button appears in the bottom-right corner;
clicking it opens the chat panel.

## Configuration options

All options can be set via `data-*` attributes on the `<script>`
tag (auto-init) or as keys on the config object passed to
`window.DayjoyChat.init()` (programmatic init).

| `data-*` attribute           | Config key       | Type      | Default                          | Description                                                                  |
| ---------------------------- | ---------------- | --------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `data-api-url`               | `apiUrl`         | `string`  | `https://api.dayjoy.ai`          | Base URL of the Dayjoy backend.                                              |
| `data-assistant-name`        | `assistantName`  | `string`  | `"Dayjoy AI"`                    | Display name shown in the chat header.                                       |
| `data-brand-color`           | `brandColor`     | `string`  | `"#E07A1F"`                      | Hex/rgb/hsl color for the launcher, header, and send button.                 |
| `data-position`              | `position`       | `string`  | `"bottom-right"`                 | Where the launcher appears. One of `"bottom-right"`, `"bottom-left"`.        |
| `data-welcome-message`       | `welcomeMessage` | `string`  | `"Hi! I'm the Dayjoy assistant…"`| First assistant message shown when the chat opens.                           |
| `data-require-pre-chat`      | `requirePreChat` | `boolean` | `"true"`                         | When `"true"`, show a name + email form before the chat starts.              |

## Programmatic init

For sites that need more control (e.g. dynamic config, lazy-loading,
or turning auto-init off), use the programmatic API:

```html
<script src="https://cdn.dayjoy.ai/chat-widget.js"></script>
<script>
  // Optionally disable auto-init:
  window.DayjoyChat.__noAutoInit = true;

  // Later, when ready:
  window.DayjoyChat.init({
    apiUrl: "https://api.dayjoy.ai",
    assistantName: "Dayjoy AI",
    brandColor: "#E07A1F",
    position: "bottom-right",
    welcomeMessage: "Hi! How can I help?",
    requirePreChat: true
  });
</script>
```

The `init()` function returns an object with `open()`, `close()`,
and `toggle()` methods you can call to control the widget
programmatically:

```javascript
const chat = window.DayjoyChat.init({ /* … */ });

// Open the chat from a custom "Contact us" button:
document.getElementById("contact-btn").addEventListener("click", () => {
  chat.open();
});
```

## How it works

The `chat-widget.js` bundle is a tiny (~5 KB gzipped), dependency-free
vanilla-JS loader. When it runs, it:

1. Reads the `data-*` attributes from its own `<script>` tag.
2. Injects a `<div id="dayjoy-chat-root">` container into the page.
3. Renders a circular launcher button (positioned via `position`).
4. When the launcher is clicked, mounts an `<iframe>` pointing at
   `https://chat.dayjoy.ai/embed?…` with the config encoded as
   query-string params. The iframe hosts the full Next.js chat app,
   which keeps the host page isolated from:
   - **CSS bleed** — your site's styles don't leak into the chat.
   - **JS errors** — a third-party script error can't break the chat.
   - **Auth / cookies** — the chat runs in its own origin.
5. Listens for `postMessage` events from the iframe so the chat's
   internal "close" button can also collapse the outer panel.

This architecture means:

- ✅ The widget works on **any** website — React, Vue, jQuery, or
  vanilla HTML.
- ✅ The bundle is tiny and won't slow down your first paint
  (the `<script>` tag is `async`).
- ✅ Updates to the chat UI ship automatically — no rebuild needed
  on your side.
- ✅ You can pin a specific version by changing the URL to
  `https://cdn.dayjoy.ai/chat-widget@v1.2.0.js`.

## Self-hosting

If your security policy requires the bundle to be served from your
own domain, you have two options:

### Option A — Host the loader yourself

Download `chat-widget.js` and serve it from your CDN. Point the
`src` attribute at your URL. The loader will still iframe
`https://chat.dayjoy.ai/embed` for the chat UI.

### Option B — Full self-host (chat UI + bundle)

Run the Next.js app (`apps/website-chat`) on your own infrastructure
and set `WIDGET_ORIGIN` to your domain when running
`pnpm build:widget`:

```bash
WIDGET_ORIGIN=https://chat.yourdomain.com pnpm build:widget
```

The generated `public/chat-widget.js` will iframe your own origin.
Copy the file to your CDN.

## Standalone chat page

In addition to the embedded widget, the app serves a full-page chat
at `/` — useful when you want a dedicated chat URL (e.g.
`chat.dayjoy.ai`) to link to from emails, ads, or QR codes. The
same URL query parameters (`?api=…&name=…&color=…`) override the
defaults.

## Browser support

The widget supports all modern browsers (Chrome, Edge, Firefox,
Safari 14+). Streaming responses use the Fetch API + ReadableStream
(streaming falls back to a single request/response on browsers
without ReadableStream support — currently only very old Safari).

## Accessibility

- The launcher button has `aria-label` and `aria-expanded` attributes.
- The chat panel is a `role="dialog"` with `aria-label`.
- The message list is a `role="log"` with `aria-live="polite"` so
  screen readers announce new messages.
- The launcher is keyboard-focusable; `Enter` and `Space` toggle
  the panel. `Esc` closes an open panel.
- The input is auto-focused when the panel opens.
- All interactive elements meet WCAG AA contrast ratios against
  both light and dark themes.
- The widget respects `prefers-reduced-motion`.

## Privacy & data

- The widget stores the visitor's session id and message history in
  `localStorage` under the `dayjoy-chat-session` key. This lets
  conversations survive page reloads. Clearing site data wipes it.
- The pre-chat form (name + email) is sent to the backend on
  `POST /api/website-chat/init` and stored on the session record.
- The visitor's IP is extracted from `X-Forwarded-For` (set by your
  CDN) and used for rate limiting + analytics. It is not sold or
  shared.
- The widget does **not** set any third-party cookies or load any
  third-party scripts.

## Troubleshooting

### The launcher doesn't appear

- Open your browser's dev console and check for 404s on
  `chat-widget.js`.
- Confirm the script tag is in the `<head>` or `<body>` (not inside
  another element that gets replaced on navigation).
- Verify the host page doesn't have a CSP `script-src` directive
  that blocks `cdn.dayjoy.ai`.

### The chat panel opens but messages don't arrive

- Confirm `data-api-url` points to a reachable backend
  (`curl -X POST $API_URL/api/website-chat/init`).
- Check the browser console for CORS errors. The backend includes
  `Access-Control-Allow-Origin: *` on the public endpoints — if
  you're behind a proxy, make sure it doesn't strip that header.
- The backend must have at least one `AiAgent` row for the default
  tenant. If you see a 404 with "No AI agent found for tenant",
  create an agent via the admin dashboard.

### Streaming doesn't work (responses appear all at once)

- Check that your CDN/proxy doesn't buffer SSE responses. For nginx,
  set `proxy_buffering off;` and `proxy_cache off;` for the
  `/api/website-chat/` location. The backend sets the
  `X-Accel-Buffering: no` header as a hint, but not all proxies
  honor it.
- If streaming is unavailable, the widget automatically falls back
  to the non-streaming endpoint — the UX degrades gracefully.

### The widget looks broken on my site

- The widget runs inside an iframe, so it's isolated from your
  site's CSS. If it still looks wrong, your site may have a global
  stylesheet that targets `iframe` elements (rare). Inspect the
  iframe element in dev tools.
- The launcher button uses `z-index: 2147483000` (max int). If your
  site has a higher z-index on a fixed element, it may cover the
  launcher. Lower your z-index or move the widget to
  `data-position="bottom-left"`.

## Support

- Docs: <https://docs.dayjoy.ai/website-chat>
- Email: <support@dayjoy.ai>
- Status: <https://status.dayjoy.ai>
