"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { ChatErrorBoundary } from "@/components/chat-error-boundary";
import type { WidgetConfig } from "@/lib/types";

/**
 * Full-page chat — the standalone chat URL (e.g. `chat.dayjoy.ai`).
 *
 * Renders the `ChatWidget` in `fullPage` mode (no floating launcher;
 * fills the viewport). Designed to be embedded in an iframe on the
 * `/embed` route, OR visited directly as a standalone URL.
 *
 * The widget is loaded via `next/dynamic` with `ssr: false` so the
 * SSE / fetch logic only runs on the client (avoids SSR hydration
 * warnings about `window` and prevents accidental server-side
 * session creation).
 */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://api.dayjoy.ai";

const ASSISTANT_NAME =
  process.env.NEXT_PUBLIC_ASSISTANT_NAME || "Dayjoy AI";

const ChatWidget = dynamic(
  () => import("@/components/chat-widget").then((m) => m.ChatWidget),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading chat…
      </div>
    ),
  },
);

export default function FullPageChat() {
  // Read the URL search params (when embedded in an iframe via
  // `/embed`) so the parent page can override config without a
  // rebuild.
  const [config, setConfig] = React.useState<WidgetConfig>({
    apiUrl: API_URL,
    assistantName: ASSISTANT_NAME,
    brandColor: "#E07A1F",
    welcomeMessage:
      "Hi! I'm the Dayjoy assistant. How can I help you today?",
    requirePreChat: true,
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const api = params.get("api");
    const name = params.get("name");
    const color = params.get("color");
    const welcome = params.get("welcome");
    const preChat = params.get("preChat");

    setConfig((prev) => ({
      ...prev,
      apiUrl: api || prev.apiUrl,
      assistantName: name || prev.assistantName,
      brandColor: color || prev.brandColor,
      welcomeMessage: welcome || prev.welcomeMessage,
      requirePreChat: preChat === null ? true : preChat !== "false",
    }));
  }, []);

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-background">
      {/* Subtle top bar (hidden when embedded in an iframe). */}
      {!isIframed() && (
        <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-2 backdrop-blur">
          <Link
            href="/embed"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Embed demo
          </Link>
          <a
            href="https://docs.dayjoy.ai/website-chat"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Docs
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <ChatErrorBoundary label="Chat unavailable">
          <ChatWidget
            fullPage
            apiUrl={config.apiUrl}
            assistantName={config.assistantName}
            brandColor={config.brandColor}
            welcomeMessage={config.welcomeMessage}
            requirePreChat={config.requirePreChat}
          />
        </ChatErrorBoundary>
      </div>
    </div>
  );
}

/** Detect whether we're running inside an iframe (embed mode). */
function isIframed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
