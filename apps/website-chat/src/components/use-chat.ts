"use client";

import * as React from "react";
import {
  ChatClient,
  ChatClientError,
  type PersistedSession,
  type StreamEvent,
  clearPersistedSession,
  loadPersistedSession,
  savePersistedSession,
} from "@/lib/chat-client";
import type {
  ConnectionStatus,
  Message,
  PreChatData,
} from "@/lib/types";

/** Options accepted by the `useChat` hook. */
export interface UseChatOptions {
  /** Backend base URL, e.g. `https://api.dayjoy.ai`. */
  apiUrl: string;
  /** Display name of the assistant (used in the persisted session header). */
  assistantName: string;
  /** Welcome message shown to the visitor on first open. */
  welcomeMessage: string;
  /** When true, require name + email before the chat starts. */
  requirePreChat?: boolean;
  /** Called when a session is first initialized (e.g. for analytics). */
  onSessionInit?: (sessionId: string) => void;
  /** Called when an error occurs (e.g. for Sentry / analytics). */
  onError?: (err: ChatClientError) => void;
}

/** State shape returned by `useChat`. */
export interface UseChatResult {
  /** All messages (user + assistant), oldest first. */
  messages: Message[];
  /** True while waiting for the assistant's first token. */
  isThinking: boolean;
  /** True while a stream is in progress (any token has arrived). */
  isStreaming: boolean;
  /** True when a network/init call is in flight. */
  isInitializing: boolean;
  /** Current connection state — drives the status indicator. */
  connectionStatus: ConnectionStatus;
  /** The active session id (null before init). */
  sessionId: string | null;
  /** Last error message (null when none). */
  error: string | null;
  /** Send a message. Returns the assistant message id (or null on error). */
  sendMessage: (content: string) => Promise<string | null>;
  /** Retry the last failed message. */
  retryLast: () => Promise<void>;
  /** Reset the conversation (clears localStorage + state). */
  reset: () => void;
  /** Submit thumbs up/down feedback on a message. */
  submitFeedback: (messageId: string, rating: "up" | "down") => Promise<void>;
  /** Initialize the session (called automatically on first open). */
  init: (preChat?: PreChatData) => Promise<void>;
}

/**
 * Central chat state machine — used by both the floating widget and
 * the full-page chat. Encapsulates:
 *
 *   - session initialization (with localStorage persistence)
 *   - message sending + streaming (SSE)
 *   - error handling + retry
 *   - feedback submission
 *   - connection-status tracking
 *
 * Designed to be agnostic to the UI shell — callers render the
 * bubbles, input, typing indicator, etc.
 */
export function useChat(opts: UseChatOptions): UseChatResult {
  const clientRef = React.useRef<ChatClient | null>(null);
  if (clientRef.current === null) {
    clientRef.current = new ChatClient(opts.apiUrl);
  }

  const [messages, setMessages] = React.useState<Message[]>([]);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [isThinking, setIsThinking] = React.useState(false);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [isInitializing, setIsInitializing] = React.useState(false);
  const [connectionStatus, setConnectionStatus] =
    React.useState<ConnectionStatus>("connecting");
  const [error, setError] = React.useState<string | null>(null);

  // Track the last user message content for `retryLast`.
  const lastUserContentRef = React.useRef<string | null>(null);
  // Track in-flight request so we can cancel on unmount.
  const abortRef = React.useRef<AbortController | null>(null);

  // Restore a persisted session on mount.
  React.useEffect(() => {
    const persisted = loadPersistedSession();
    if (persisted?.sessionId) {
      clientRef.current?.setSession(
        persisted.sessionId,
        persisted.visitorId,
      );
      setSessionId(persisted.sessionId);
      setMessages(persisted.messages ?? []);
      // Verify the session is still alive (best-effort — ignore errors).
      void clientRef.current
        ?.getHistory(1, 50)
        .then((history) => {
          if (history.length > 0) {
            setMessages(history);
            setConnectionStatus("online");
          } else if (persisted.messages.length > 0) {
            setConnectionStatus("online");
          }
        })
        .catch(() => {
          // Session may have expired — drop it so init creates a new one.
          clearPersistedSession();
          setSessionId(null);
          setMessages([]);
          setConnectionStatus("connecting");
        });
    } else {
      setConnectionStatus("connecting");
    }
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /** Persist current state to localStorage. */
  const persist = React.useCallback(
    (sid: string | null, msgs: Message[]) => {
      if (!sid) return;
      const visitorId = clientRef.current?.currentVisitorId ?? undefined;
      const session: PersistedSession = {
        sessionId: sid,
        visitorId,
        createdAt: new Date().toISOString(),
        assistantName: opts.assistantName,
        messages: msgs,
      };
      savePersistedSession(session);
    },
    [opts.assistantName],
  );

  /** Initialize a new chat session. */
  const init = React.useCallback(
    async (preChat?: PreChatData): Promise<void> => {
      if (isInitializing || sessionId) return;
      setIsInitializing(true);
      setError(null);
      setConnectionStatus("connecting");
      try {
        const res = await clientRef.current!.initSession(preChat);
        setSessionId(res.sessionId);
        const welcome: Message = {
          id: `welcome-${Date.now()}`,
          role: "assistant",
          content: res.welcomeMessage ?? opts.welcomeMessage,
          timestamp: new Date().toISOString(),
        };
        setMessages([welcome]);
        setConnectionStatus("online");
        persist(res.sessionId, [welcome]);
        opts.onSessionInit?.(res.sessionId);
      } catch (err) {
        const e =
          err instanceof ChatClientError
            ? err
            : new ChatClientError((err as Error).message, {
                code: "UNKNOWN",
              });
        setError(e.message);
        setConnectionStatus("error");
        opts.onError?.(e);
      } finally {
        setIsInitializing(false);
      }
    },
    [isInitializing, sessionId, opts, persist],
  );

  /** Send a message + stream the assistant reply. */
  const sendMessage = React.useCallback(
    async (content: string): Promise<string | null> => {
      const trimmed = content.trim();
      if (!trimmed) return null;
      if (!clientRef.current) return null;

      // Lazy-init the session on first message (when requirePreChat
      // is false, the user may type before init runs).
      let sid = sessionId;
      if (!sid) {
        await init();
        sid = clientRef.current.currentSessionId;
        if (!sid) return null;
      }

      lastUserContentRef.current = trimmed;
      setError(null);
      setIsThinking(true);
      setConnectionStatus("online");

      // Optimistically append the user's message.
      const userMsg: Message = {
        id: `pending-user-${Date.now()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      const assistantMsg: Message = {
        id: `pending-assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        streaming: true,
      };
      const baseMessages = [...messages, userMsg, assistantMsg];
      setMessages(baseMessages);

      // Cancel any prior in-flight stream.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const stream = clientRef.current.streamMessage(trimmed, {
          signal: controller.signal,
        });
        let assistantId = assistantMsg.id;
        let firstTokenSeen = false;

        for await (const ev of stream) {
          switch (ev.type) {
            case "user": {
              // Server confirmed the user message id.
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === userMsg.id
                    ? { ...m, id: ev.messageId || m.id }
                    : m,
                ),
              );
              break;
            }
            case "delta": {
              if (!firstTokenSeen) {
                firstTokenSeen = true;
                setIsThinking(false);
                setIsStreaming(true);
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + ev.content }
                    : m,
                ),
              );
              break;
            }
            case "done": {
              assistantId = ev.messageId || assistantId;
              setMessages((prev) => {
                const next = prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        id: assistantId,
                        content: ev.content || m.content,
                        streaming: false,
                      }
                    : m,
                );
                persist(sid, next);
                return next;
              });
              break;
            }
            case "error": {
              throw new ChatClientError(ev.message, {
                code: "STREAM_ERROR",
              });
            }
          }
        }

        // If no tokens arrived at all, fall back to non-streaming.
        if (!firstTokenSeen) {
          setIsThinking(false);
          const fallback = await clientRef.current.sendMessage(trimmed, {
            signal: controller.signal,
          });
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    id: fallback.assistantMessage.id,
                    content: fallback.assistantMessage.content,
                    citations: fallback.assistantMessage.citations,
                    streaming: false,
                  }
                : m,
            );
            persist(sid, next);
            return next;
          });
          return fallback.assistantMessage.id;
        }

        return assistantId;
      } catch (err) {
        const e =
          err instanceof ChatClientError
            ? err
            : new ChatClientError((err as Error).message, {
                code: "UNKNOWN",
              });
        // Mark the assistant message as failed.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? {
                  ...m,
                  streaming: false,
                  error: true,
                  content: m.content || "",
                }
              : m,
          ),
        );
        setError(e.message);
        setConnectionStatus(
          e.code === "NETWORK" || e.code === "TIMEOUT" ? "offline" : "error",
        );
        opts.onError?.(e);
        return null;
      } finally {
        setIsThinking(false);
        setIsStreaming(false);
      }
    },
    [sessionId, messages, opts, persist, init],
  );

  /** Retry the last failed message. */
  const retryLast = React.useCallback(async (): Promise<void> => {
    const last = lastUserContentRef.current;
    if (!last) return;
    // Drop the failed assistant message (and any orphan user message).
    setMessages((prev) => {
      const next = [...prev];
      // Remove the last entry if it's the failed assistant message.
      const lastIdx = next.length - 1;
      if (lastIdx >= 0 && next[lastIdx]?.error) {
        next.pop();
      }
      return next;
    });
    await sendMessage(last);
  }, [sendMessage]);

  /** Reset the conversation. */
  const reset = React.useCallback((): void => {
    abortRef.current?.abort();
    clearPersistedSession();
    clientRef.current?.clearSession();
    // Force a fresh client on next init.
    clientRef.current = new ChatClient(opts.apiUrl);
    setSessionId(null);
    setMessages([]);
    setError(null);
    setIsThinking(false);
    setIsStreaming(false);
    setConnectionStatus("connecting");
  }, [opts.apiUrl]);

  /** Submit thumbs up/down feedback. */
  const submitFeedback = React.useCallback(
    async (messageId: string, rating: "up" | "down"): Promise<void> => {
      if (!clientRef.current) return;
      // Optimistic update.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, feedback: rating } : m,
        ),
      );
      try {
        await clientRef.current.submitFeedback(messageId, rating);
      } catch {
        // Revert on failure.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, feedback: null } : m,
          ),
        );
      }
    },
    [],
  );

  return {
    messages,
    isThinking,
    isStreaming,
    isInitializing,
    connectionStatus,
    sessionId,
    error,
    sendMessage,
    retryLast,
    reset,
    submitFeedback,
    init,
  };
}
