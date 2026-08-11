"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  MessageCircle,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
  AlertCircle,
  RefreshCw,
  WifiOff,
  Check,
  Loader2,
  User as UserIcon,
  Mail,
} from "lucide-react";
import { useChat } from "@/components/use-chat";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_QUICK_REPLIES,
  DEFAULT_WIDGET_CONFIG,
  type ConnectionStatus,
  type Message,
  type QuickReply,
  type WidgetConfig,
  type WidgetPosition,
} from "@/lib/types";

/** Props accepted by the embeddable widget. */
export interface ChatWidgetProps extends Partial<WidgetConfig> {
  /** Override the quick-reply suggestions. */
  quickReplies?: QuickReply[];
  /** Override CSS class on the launcher button. */
  className?: string;
  /** Open the widget by default (e.g. on a dedicated chat page). */
  defaultOpen?: boolean;
  /** Render in "full-page" mode — no launcher, fills the parent. */
  fullPage?: boolean;
  /** Called when the widget is opened (analytics hook). */
  onOpen?: () => void;
  /** Called when the widget is closed (analytics hook). */
  onClose?: () => void;
}

/** Internal pre-chat form state. */
interface PreChatFormState {
  name: string;
  email: string;
  submitted: boolean;
}

/** Default brand color (matches `DEFAULT_WIDGET_CONFIG`). */
const DEFAULT_BRAND = DEFAULT_WIDGET_CONFIG.brandColor;

/**
 * Dayjoy AI — Embeddable Chat Widget.
 *
 * Renders a floating launcher button + slide-up chat panel. Works in
 * two modes:
 *
 *   1. **Floating widget** (default): a circular button in the
 *      bottom-right (or bottom-left) corner; clicking opens the panel.
 *   2. **Full-page mode** (`fullPage={true}`): no launcher — the chat
 *      fills its parent container. Used by the `/` route.
 *
 * Both modes share the same header, message list, typing indicator,
 * quick replies, input composer, and error handling.
 */
export function ChatWidget(props: ChatWidgetProps) {
  const {
    apiUrl = DEFAULT_WIDGET_CONFIG.apiUrl,
    assistantName = DEFAULT_WIDGET_CONFIG.assistantName,
    brandColor = DEFAULT_BRAND,
    position = DEFAULT_WIDGET_CONFIG.position,
    welcomeMessage = DEFAULT_WIDGET_CONFIG.welcomeMessage,
    requirePreChat = DEFAULT_WIDGET_CONFIG.requirePreChat,
    inputPlaceholder = DEFAULT_WIDGET_CONFIG.inputPlaceholder,
    quickReplies = DEFAULT_QUICK_REPLIES,
    className,
    defaultOpen = false,
    fullPage = false,
    onOpen,
    onClose,
  } = props;

  const chat = useChat({
    apiUrl,
    assistantName,
    welcomeMessage,
    requirePreChat,
  });

  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const [unread, setUnread] = React.useState(0);
  const [preChat, setPreChat] = React.useState<PreChatFormState>({
    name: "",
    email: "",
    submitted: false,
  });

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const launcherRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  /** Open the widget (and initialize the session if needed). */
  const open = React.useCallback(() => {
    setIsOpen(true);
    setUnread(0);
    onOpen?.();
    // Lazy-init the session on first open (when no pre-chat required).
    if (!requirePreChat && !chat.sessionId && !chat.isInitializing) {
      void chat.init();
    }
  }, [chat, requirePreChat, onOpen]);

  /** Close the widget. */
  const close = React.useCallback(() => {
    setIsOpen(false);
    onClose?.();
    // Return focus to the launcher for keyboard users.
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, [onClose]);

  /** Toggle open/closed. */
  const toggle = React.useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  /** Auto-scroll to the bottom on new messages. */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Only autoscroll if the user is near the bottom (within 100px);
    // otherwise let them read scrolled-up history.
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [chat.messages]);

  /** Increment unread when closed + a new assistant message arrives. */
  const prevMsgCount = React.useRef(chat.messages.length);
  React.useEffect(() => {
    const grew = chat.messages.length > prevMsgCount.current;
    if (grew && !isOpen) {
      const last = chat.messages[chat.messages.length - 1];
      if (last?.role === "assistant" && !last.streaming) {
        setUnread((u) => u + 1);
      }
    }
    prevMsgCount.current = chat.messages.length;
  }, [chat.messages, isOpen]);

  /** Focus the input when the panel opens. */
  React.useEffect(() => {
    if (isOpen && !requirePreChat) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen, requirePreChat]);

  /** Esc closes the panel (keyboard accessibility). */
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  /** Notify the parent iframe (if any) when the panel closes. */
  React.useEffect(() => {
    if (!isOpen && typeof window !== "undefined" && window.parent) {
      try {
        window.parent.postMessage(
          { source: "dayjoy-chat", type: "close" },
          "*",
        );
      } catch {
        /* noop */
      }
    }
  }, [isOpen]);

  /** Submit the pre-chat form. */
  const submitPreChat = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!preChat.name.trim() || !preChat.email.trim()) return;
      setPreChat((s) => ({ ...s, submitted: true }));
      await chat.init({ name: preChat.name, email: preChat.email });
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [preChat, chat],
  );

  /** Send a message + reset the input. */
  const [draft, setDraft] = React.useState("");
  const handleSend = React.useCallback(
    async (content?: string) => {
      const text = (content ?? draft).trim();
      if (!text || chat.isThinking || chat.isStreaming) return;
      setDraft("");
      // Reset textarea height.
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
      }
      await chat.sendMessage(text);
    },
    [draft, chat],
  );

  /** Handle Enter to send, Shift+Enter for newline. */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  /** Auto-grow the textarea. */
  const handleInput = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    },
    [],
  );

  /** Show the pre-chat form when required + not yet submitted. */
  const showPreChatForm =
    requirePreChat && !preChat.submitted && isOpen;

  // ---------------------------------------------------------------
  // Full-page mode — no launcher, fills the parent.
  // ---------------------------------------------------------------
  if (fullPage) {
    return (
      <div
        className={cn(
          "flex h-[100dvh] w-full flex-col bg-background",
          className,
        )}
        role="application"
        aria-label={`${assistantName} chat`}
      >
        <ChatHeader
          assistantName={assistantName}
          brandColor={brandColor}
          connectionStatus={chat.connectionStatus}
          onReset={chat.reset}
          sessionId={chat.sessionId}
        />
        <div
          ref={scrollRef}
          className="chat-scroll flex-1 overflow-y-auto px-4 py-6"
          role="log"
          aria-live="polite"
          aria-label="Conversation"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {chat.messages.length === 0 && !chat.isInitializing && (
              <EmptyState
                assistantName={assistantName}
                welcomeMessage={welcomeMessage}
              />
            )}
            {chat.isInitializing && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting…
              </div>
            )}
            {chat.messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                brandColor={brandColor}
                onFeedback={chat.submitFeedback}
                onRetry={chat.retryLast}
              />
            ))}
            {(chat.isThinking || chat.isStreaming) && (
              <TypingIndicator brandColor={brandColor} />
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
        {chat.error && (
          <ErrorBanner
            message={chat.error}
            onRetry={chat.retryLast}
          />
        )}
        <div className="border-t border-border bg-card px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <Composer
              draft={draft}
              placeholder={inputPlaceholder}
              disabled={chat.isThinking || chat.isStreaming}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onSend={() => handleSend()}
              brandColor={brandColor}
              inputRef={inputRef}
            />
            {chat.messages.length <= 1 && (
              <QuickReplies
                replies={quickReplies}
                onPick={(r) => handleSend(r)}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Floating widget mode — launcher + panel.
  // ---------------------------------------------------------------
  const isBottomLeft = position === "bottom-left";
  const launcherSideClass = isBottomLeft ? "left-5" : "right-5";
  const panelSideClass = isBottomLeft ? "left-5" : "right-5";

  return (
    <>
      {/* Launcher button */}
      <motion.button
        ref={launcherRef}
        type="button"
        onClick={toggle}
        aria-label={isOpen ? `Close ${assistantName} chat` : `Open ${assistantName} chat`}
        aria-expanded={isOpen}
        className={cn(
          "fixed bottom-5 z-[2147483000] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2",
          launcherSideClass,
          className,
        )}
        style={{ backgroundColor: brandColor }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isOpen ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span
              key="open"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <MessageCircle className="h-6 w-6" aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
        {unread > 0 && !isOpen && (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow"
            aria-label={`${unread} unread message${unread === 1 ? "" : "s"}`}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label={`${assistantName} chat window`}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={cn(
              "fixed bottom-24 z-[2147483000] flex h-[min(620px,calc(100dvh-120px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl",
              panelSideClass,
            )}
          >
            <ChatHeader
              assistantName={assistantName}
              brandColor={brandColor}
              connectionStatus={chat.connectionStatus}
              onClose={close}
              onReset={chat.reset}
              sessionId={chat.sessionId}
            />

            {showPreChatForm ? (
              <PreChatForm
                value={preChat}
                onChange={setPreChat}
                onSubmit={submitPreChat}
                brandColor={brandColor}
                assistantName={assistantName}
              />
            ) : (
              <>
                <div
                  ref={scrollRef}
                  className="chat-scroll flex-1 overflow-y-auto bg-background px-3 py-4"
                  role="log"
                  aria-live="polite"
                  aria-label="Conversation"
                >
                  <div className="flex flex-col gap-3">
                    {chat.isInitializing && (
                      <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Connecting…
                      </div>
                    )}
                    {chat.messages.map((m) => (
                      <MessageBubble
                        key={m.id}
                        message={m}
                        brandColor={brandColor}
                        onFeedback={chat.submitFeedback}
                        onRetry={chat.retryLast}
                      />
                    ))}
                    {(chat.isThinking || chat.isStreaming) && (
                      <TypingIndicator brandColor={brandColor} />
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {chat.error && (
                  <ErrorBanner
                    message={chat.error}
                    onRetry={chat.retryLast}
                  />
                )}

                <div className="border-t border-border bg-card px-3 py-2.5">
                  {chat.messages.length <= 1 && !chat.isInitializing && (
                    <QuickReplies
                      replies={quickReplies}
                      onPick={(r) => handleSend(r)}
                    />
                  )}
                  <Composer
                    draft={draft}
                    placeholder={inputPlaceholder}
                    disabled={chat.isThinking || chat.isStreaming}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    onSend={() => handleSend()}
                    brandColor={brandColor}
                    inputRef={inputRef}
                  />
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------

interface ChatHeaderProps {
  assistantName: string;
  brandColor: string;
  connectionStatus: ConnectionStatus;
  onClose?: () => void;
  onReset?: () => void;
  sessionId?: string | null;
}

function ChatHeader({
  assistantName,
  brandColor,
  connectionStatus,
  onClose,
  onReset,
  sessionId,
}: ChatHeaderProps) {
  const statusMeta = getStatusMeta(connectionStatus);
  return (
    <div
      className="glass-card flex items-center gap-3 border-b border-border px-4 py-3"
      style={{ borderTopColor: brandColor }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: brandColor }}
        aria-hidden="true"
      >
        {assistantName.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {assistantName}
          </p>
          <span
            className={cn(
              "chat-status-pulse relative inline-block h-2 w-2 rounded-full",
              statusMeta.dotClass,
            )}
            style={{ backgroundColor: statusMeta.color }}
            aria-hidden="true"
          />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {statusMeta.label}
        </p>
      </div>
      {sessionId && onReset && (
        <button
          type="button"
          onClick={onReset}
          aria-label="Start a new conversation"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function getStatusMeta(status: ConnectionStatus): {
  label: string;
  color: string;
  dotClass: string;
} {
  switch (status) {
    case "online":
      return {
        label: "Online · Typically replies instantly",
        color: "#16a34a",
        dotClass: "bg-green-500",
      };
    case "connecting":
      return {
        label: "Connecting…",
        color: "#f59e0b",
        dotClass: "bg-amber-500",
      };
    case "offline":
      return {
        label: "Offline — retrying",
        color: "#6b7280",
        dotClass: "bg-gray-500",
      };
    case "error":
    default:
      return {
        label: "Connection issue",
        color: "#ef4444",
        dotClass: "bg-red-500",
      };
  }
}

interface MessageBubbleProps {
  message: Message;
  brandColor: string;
  onFeedback: (messageId: string, rating: "up" | "down") => void;
  onRetry: () => void;
}

function MessageBubble({
  message,
  brandColor,
  onFeedback,
  onRetry,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  if (message.error && !message.content) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="chat-bubble-error flex items-center gap-2 text-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Failed to send. Please try again.</span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="self-start text-xs font-medium text-primary hover:underline"
          style={{ color: brandColor }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        isUser ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          isUser ? "chat-bubble-user" : "chat-bubble-assistant",
          message.streaming && "chat-caret",
        )}
        style={
          isUser
            ? {
                backgroundColor: brandColor,
                color: "#fff",
              }
            : undefined
        }
      >
        {isAssistant ? (
          <Markdown content={message.content} />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">
            {message.content}
          </p>
        )}
      </div>

      {/* Citations */}
      {isAssistant && message.citations && message.citations.length > 0 && (
        <div className="flex w-full max-w-[85%] flex-col gap-1">
          {message.citations.map((c, idx) => (
            <div key={idx} className="chat-citation">
              <strong>{c.documentTitle}</strong>
              <span className="line-clamp-3">{c.chunkText}</span>
              {c.sourceUrl && (
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs underline"
                  style={{ color: brandColor }}
                >
                  View source →
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Feedback buttons (assistant only, after streaming completes) */}
      {isAssistant &&
        !message.streaming &&
        !message.error &&
        message.content && (
          <div className="flex items-center gap-1 opacity-70 transition-opacity hover:opacity-100">
            <button
              type="button"
              onClick={() => onFeedback(message.id, "up")}
              aria-label="Helpful"
              className={cn(
                "rounded p-1 text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                message.feedback === "up" && "text-primary",
              )}
              style={message.feedback === "up" ? { color: brandColor } : undefined}
            >
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onFeedback(message.id, "down")}
              aria-label="Not helpful"
              className={cn(
                "rounded p-1 text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                message.feedback === "down" && "text-destructive",
              )}
            >
              <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {message.feedback === "up" && (
              <span className="text-xs text-muted-foreground">Thanks!</span>
            )}
            {message.feedback === "down" && (
              <span className="text-xs text-muted-foreground">
                Thanks for the feedback.
              </span>
            )}
          </div>
        )}

      {/* Timestamp (small, subtle) */}
      <time
        className="text-[10px] text-muted-foreground/70"
        dateTime={message.timestamp}
      >
        {formatTime(message.timestamp)}
      </time>
    </div>
  );
}

function TypingIndicator({ brandColor }: { brandColor: string }) {
  return (
    <div className="chat-typing" role="status" aria-label="Assistant is typing">
      <span className="chat-typing-dot" style={{ backgroundColor: brandColor }} />
      <span className="chat-typing-dot" style={{ backgroundColor: brandColor }} />
      <span className="chat-typing-dot" style={{ backgroundColor: brandColor }} />
    </div>
  );
}

interface ComposerProps {
  draft: string;
  placeholder: string;
  disabled: boolean;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  brandColor: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

function Composer({
  draft,
  placeholder,
  disabled,
  onChange,
  onKeyDown,
  onSend,
  brandColor,
  inputRef,
}: ComposerProps) {
  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={inputRef}
        value={draft}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        aria-label="Type your message"
        className="chat-scroll max-h-[140px] min-h-[40px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || !draft.trim()}
        aria-label="Send message"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: brandColor }}
      >
        <Send className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function QuickReplies({
  replies,
  onPick,
}: {
  replies: QuickReply[];
  onPick: (message: string) => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {replies.map((r) => (
        <button
          key={r.label}
          type="button"
          onClick={() => onPick(r.message)}
          className="chat-quick-reply"
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({
  assistantName,
  welcomeMessage,
}: {
  assistantName: string;
  welcomeMessage: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white"
        style={{ backgroundColor: DEFAULT_BRAND }}
        aria-hidden="true"
      >
        {assistantName.charAt(0).toUpperCase()}
      </div>
      <h2 className="text-base font-semibold text-foreground">
        {assistantName}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {welcomeMessage}
      </p>
    </div>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-t border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

interface PreChatFormProps {
  value: PreChatFormState;
  onChange: (v: PreChatFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  brandColor: string;
  assistantName: string;
}

function PreChatForm({
  value,
  onChange,
  onSubmit,
  brandColor,
  assistantName,
}: PreChatFormProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-background px-6 py-8">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white"
        style={{ backgroundColor: brandColor }}
        aria-hidden="true"
      >
        {assistantName.charAt(0).toUpperCase()}
      </div>
      <div className="text-center">
        <h2 className="text-base font-semibold text-foreground">
          Chat with {assistantName}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Tell us who you are so we can help you better.
        </p>
      </div>
      <form onSubmit={onSubmit} className="w-full max-w-xs space-y-3">
        <div>
          <label
            htmlFor="prechat-name"
            className="mb-1 block text-xs font-medium text-foreground"
          >
            Name
          </label>
          <div className="relative">
            <UserIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="prechat-name"
              type="text"
              required
              autoComplete="name"
              value={value.name}
              onChange={(e) =>
                onChange({ ...value, name: e.target.value })
              }
              placeholder="Your name"
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="prechat-email"
            className="mb-1 block text-xs font-medium text-foreground"
          >
            Email
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="prechat-email"
              type="email"
              required
              autoComplete="email"
              value={value.email}
              onChange={(e) =>
                onChange({ ...value, email: e.target.value })
              }
              placeholder="you@example.com"
              className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        </div>
        <Button
          type="submit"
          className="w-full"
          style={{ backgroundColor: brandColor }}
          loading={false}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Start chat
        </Button>
        <p className="text-center text-[10px] text-muted-foreground">
          By starting a chat, you agree to our privacy policy.
        </p>
      </form>
    </div>
  );
}

/** Format an ISO timestamp as `HH:MM`. */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export type { WidgetPosition };
