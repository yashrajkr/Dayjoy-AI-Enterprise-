"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Check, Copy, MessageSquare, Sparkles, Zap } from "lucide-react";
import { ChatErrorBoundary } from "@/components/chat-error-boundary";

const ChatWidget = dynamic(
  () => import("@/components/chat-widget").then((m) => m.ChatWidget),
  { ssr: false },
);

/**
 * Embed demo page.
 *
 * Demonstrates how the chat widget looks when embedded on a sample
 * website. Shows:
 *   - A faux marketing site layout (hero + features + footer)
 *   - The `ChatWidget` mounted in floating mode
 *   - The embed code snippet with a copy-to-clipboard button
 *
 * This is also the URL the standalone `chat-widget.js` loader
 * iframes into arbitrary host pages.
 */

const EMBED_CODE = `<script
  src="https://cdn.dayjoy.ai/chat-widget.js"
  data-api-url="https://api.dayjoy.ai"
  data-assistant-name="Dayjoy AI"
  data-brand-color="#E07A1F"
  data-position="bottom-right"
  data-welcome-message="Hi! I'm the Dayjoy assistant. How can I help you today?"
  data-require-pre-chat="true"
  async>
</script>`;

const PROGRAMMATIC_CODE = `<script src="https://cdn.dayjoy.ai/chat-widget.js"></script>
<script>
  window.DayjoyChat.init({
    apiUrl: "https://api.dayjoy.ai",
    assistantName: "Dayjoy AI",
    brandColor: "#E07A1F",
    position: "bottom-right",
    welcomeMessage: "Hi! How can I help?",
    requirePreChat: true
  });
</script>`;

export default function EmbedDemoPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <SampleSite />
      <EmbedInstructions />

      {/* Floating widget — actual embed demonstration. */}
      <ChatErrorBoundary label="Chat unavailable">
        <ChatWidget
          apiUrl={
            process.env.NEXT_PUBLIC_API_URL || "https://api.dayjoy.ai"
          }
          assistantName="Dayjoy AI"
          brandColor="#E07A1F"
          position="bottom-right"
          welcomeMessage="Hi! I'm the Dayjoy assistant. Try asking about our products, or click a quick reply below."
          requirePreChat={false}
        />
      </ChatErrorBoundary>
    </div>
  );
}

/** Faux marketing site to give the demo context. */
function SampleSite() {
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              D
            </div>
            <span className="text-sm font-semibold">Dayjoy AI</span>
          </div>
          <nav className="hidden gap-6 text-sm text-muted-foreground sm:flex">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="hover:text-foreground">
              Pricing
            </a>
            <a href="#docs" className="hover:text-foreground">
              Docs
            </a>
          </nav>
          <a
            href="#"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Get started
          </a>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Embeddable AI Chat
        </div>
        <h1 className="mx-auto max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          Add a Dayjoy AI assistant to any website in{" "}
          <span className="text-primary">30 seconds</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Drop in one script tag. Your customers get instant answers,
          product help, and human handoff — powered by the same RAG
          pipeline that backs your voice and WhatsApp channels.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Open full chat
          </a>
          <a
            href="#embed"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-border px-5 text-sm font-medium hover:bg-accent"
          >
            View embed code
          </a>
        </div>
      </section>

      <section
        id="features"
        className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-3"
      >
        <FeatureCard
          icon={<Zap className="h-5 w-5" aria-hidden="true" />}
          title="Streaming replies"
          body="Tokens appear word-by-word — answers feel instant, even on slow networks."
        />
        <FeatureCard
          icon={<MessageSquare className="h-5 w-5" aria-hidden="true" />}
          title="Pre-chat form"
          body="Capture name + email before the chat starts. Skip it for anonymous Q&A."
        />
        <FeatureCard
          icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
          title="Citations + feedback"
          body="Surface RAG citations under each reply. Visitors thumbs-up / down for QA."
        />
      </section>
    </>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function EmbedInstructions() {
  return (
    <section
      id="embed"
      className="border-t border-border bg-card/40 py-16"
    >
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Embed the widget
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Copy this snippet into your website&apos;s{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            &lt;head&gt;
          </code>{" "}
          or just before{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            &lt;/body&gt;
          </code>
          . The widget loads asynchronously and won&apos;t block your page.
        </p>

        <CodeBlock title="Auto-init (recommended)" code={EMBED_CODE} />

        <h3 className="mt-10 text-lg font-semibold">
          Programmatic init
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Need more control? Disable auto-init and call{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            window.DayjoyChat.init()
          </code>{" "}
          yourself.
        </p>
        <CodeBlock title="Programmatic" code={PROGRAMMATIC_CODE} />

        <div className="mt-10 rounded-xl border border-primary/20 bg-primary/5 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Try it now
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The floating chat button in the bottom-right corner of
            this page is a live, fully-functional widget. Click it to
            start a conversation.
          </p>
        </div>
      </div>
    </section>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (e.g. in iframes without
      // `clipboard-write` permission). Fallback to a textarea trick.
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* noop */
      } finally {
        document.body.removeChild(ta);
      }
    }
  }, [code]);

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-[#0d1117] text-sm shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2">
        <span className="text-xs font-medium text-white/70">{title}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/10"
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-white/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}
