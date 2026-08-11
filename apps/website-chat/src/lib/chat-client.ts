/**
 * ChatClient — typed client for the Dayjoy website-chat API.
 *
 * Wraps the public endpoints exposed by
 * `backend/website-chat/website-chat.controller.ts`:
 *
 *   - POST /api/website-chat/init
 *   - POST /api/website-chat/:sessionId/message
 *   - POST /api/website-chat/:sessionId/message/stream (SSE)
 *   - GET  /api/website-chat/:sessionId/history
 *   - POST /api/website-chat/:sessionId/feedback
 *
 * All methods throw `ChatClientError` (a typed exception) on failure
 * so callers can render appropriate retry UI without `instanceof`
 * checks.
 *
 * The streaming method (`streamMessage`) is an async generator that
 * parses SSE chunks emitted by the backend and yields incremental
 * text deltas. It uses the fetch `ReadableStream` API (not
 * `EventSource`) so it can use `POST` (EventSource only supports
 * GET) and so we can attach a request body.
 */
import type {
  ChatSession,
  Message,
  PreChatData,
} from "./types";

/** Typed exception thrown by all `ChatClient` methods. */
export class ChatClientError extends Error {
  /** HTTP status code (or 0 for network errors). */
  readonly status: number;
  /** Stable error code for programmatic handling. */
  readonly code: string;
  /** Optional retry hint (seconds). */
  readonly retryAfter?: number;

  constructor(
    message: string,
    opts: {
      status?: number;
      code?: string;
      retryAfter?: number;
    } = {},
  ) {
    super(message);
    this.name = "ChatClientError";
    this.status = opts.status ?? 0;
    this.code = opts.code ?? "UNKNOWN";
    this.retryAfter = opts.retryAfter;
  }
}

/** Shape of the response from `POST /api/website-chat/init`. */
export interface InitSessionResponse {
  sessionId: string;
  conversationId?: string;
  visitorId?: string;
  welcomeMessage?: string;
}

/** Shape of a streamed event from `POST /:sessionId/message/stream`. */
export type StreamEvent =
  | { type: "user"; messageId: string; content: string }
  | { type: "delta"; content: string }
  | { type: "done"; messageId: string; content: string }
  | { type: "error"; message: string };

/** Default request timeout (ms). */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * SSE parser — takes a raw SSE chunk and yields discrete events.
 *
 * The SSE wire format is:
 *
 *   event: <name>\n
 *   data: <json>\n
 *   \n
 *
 * Multiple events can arrive in a single chunk; an event can also be
 * split across chunks. We buffer until we see a blank line, then emit.
 */
export class SSEParser {
  private buffer = "";

  /** Feed a chunk; returns the list of complete events parsed from it. */
  feed(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const events: StreamEvent[] = [];

    // SSE events are separated by a blank line (`\n\n`).
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
      const raw = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const event = this.parseRaw(raw);
      if (event) events.push(event);
    }
    return events;
  }

  /** Flush any trailing buffered content (called on stream end). */
  flush(): StreamEvent[] {
    if (!this.buffer.trim()) return [];
    const event = this.parseRaw(this.buffer);
    this.buffer = "";
    return event ? [event] : [];
  }

  private parseRaw(raw: string): StreamEvent | null {
    const lines = raw.split("\n");
    let eventName = "message";
    let dataStr = "";
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataStr += line.slice(5).trim();
      } else if (line.startsWith(":")) {
        // SSE comment / heartbeat — ignore.
        continue;
      }
    }
    if (!dataStr) return null;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataStr);
    } catch {
      return null;
    }
    switch (eventName) {
      case "user":
        return {
          type: "user",
          messageId: String(data.messageId ?? ""),
          content: String(data.content ?? ""),
        };
      case "delta":
        return { type: "delta", content: String(data.content ?? "") };
      case "done":
        return {
          type: "done",
          messageId: String(data.messageId ?? ""),
          content: String(data.content ?? ""),
        };
      case "error":
        return { type: "error", message: String(data.message ?? "Stream error") };
      default:
        return null;
    }
  }
}

/** Options accepted by `ChatClient` methods. */
export interface ChatClientOptions {
  /** Abort the request (cancellation). */
  signal?: AbortSignal;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
}

/** Internal helper: convert a backend `Message` row → our `Message`. */
function toMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id ?? ""),
    role: (row.role as Message["role"]) ?? "assistant",
    content: String(row.content ?? ""),
    timestamp:
      typeof row.createdAt === "string"
        ? row.createdAt
        : row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date().toISOString(),
    citations: Array.isArray(row.citations)
      ? (row.citations as Message["citations"])
      : undefined,
    feedback: null,
  };
}

export class ChatClient {
  private readonly apiUrl: string;
  private readonly basePath: string;
  private sessionId: string | null = null;
  private visitorId: string | null = null;

  constructor(apiUrl: string) {
    // Strip trailing slash for predictable concatenation.
    this.apiUrl = apiUrl.replace(/\/+$/, "");
    this.basePath = `${this.apiUrl}/api/website-chat`;
  }

  /** The currently active session id (or null before init). */
  get currentSessionId(): string | null {
    return this.sessionId;
  }

  /** The anonymous visitor id assigned by the backend. */
  get currentVisitorId(): string | null {
    return this.visitorId;
  }

  /** Explicitly set the session id (e.g. restored from localStorage). */
  setSession(sessionId: string, visitorId?: string): void {
    this.sessionId = sessionId;
    if (visitorId) this.visitorId = visitorId;
  }

  /** Clear the stored session (used by `reset`). Preserves visitorId. */
  clearSession(): void {
    this.sessionId = null;
  }

  /**
   * Initialize a new chat session.
   *
   * Sends the visitor's `pageUrl`, `referrer`, and `userAgent` so the
   * analytics dashboard can break down chat starts by landing page.
   *
   * @returns the new session id (also stored on `this`).
   */
  async initSession(
    preChatData?: PreChatData,
    opts: ChatClientOptions = {},
  ): Promise<InitSessionResponse> {
    const body: Record<string, unknown> = {
      pageUrl: safeWindowLocation(),
      referrer: safeDocumentReferrer(),
      userAgent: safeUserAgent(),
    };
    if (this.visitorId) body.visitorId = this.visitorId;
    if (preChatData?.name) body.visitorName = preChatData.name;
    if (preChatData?.email) body.visitorEmail = preChatData.email;

    const res = await this.request<InitSessionResponse>(
      "POST",
      "/init",
      body,
      opts,
    );
    this.sessionId = res.sessionId;
    if (res.visitorId) this.visitorId = res.visitorId;
    return res;
  }

  /**
   * Send a message and wait for the full assistant reply.
   *
   * Use this for the non-streaming path (or as a fallback when
   * streaming fails). For streaming, prefer `streamMessage()`.
   */
  async sendMessage(
    content: string,
    opts: ChatClientOptions = {},
  ): Promise<{ userMessage: Message; assistantMessage: Message }> {
    this.requireSession();
    const res = await this.request<{
      userMessage: Record<string, unknown>;
      assistantMessage: Record<string, unknown>;
    }>(
      "POST",
      `/${this.sessionId}/message`,
      { message: content },
      opts,
    );
    return {
      userMessage: toMessage(res.userMessage),
      assistantMessage: toMessage(res.assistantMessage),
    };
  }

  /**
   * Stream the assistant reply token-by-token.
   *
   * Yields `StreamEvent` objects — callers should:
   *   - on `user`: append the persisted user message (id confirmed).
   *   - on `delta`: append the chunk to the in-progress assistant bubble.
   *   - on `done`: finalize the assistant message (id confirmed).
   *   - on `error`: surface the error to the user.
   *
   * Uses `fetch` + `ReadableStream` (not `EventSource`) because the
   * SSE endpoint requires `POST` (which EventSource doesn't support).
   */
  async *streamMessage(
    content: string,
    opts: ChatClientOptions = {},
  ): AsyncGenerator<StreamEvent, void, void> {
    this.requireSession();
    const url = `${this.basePath}/${this.sessionId}/message/stream`;
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Chain the caller-provided signal (if any).
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort());
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ message: content }),
        signal: controller.signal,
        credentials: "omit",
        mode: "cors",
      });
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === "AbortError") {
        throw new ChatClientError("Request cancelled", {
          code: "CANCELLED",
          status: 0,
        });
      }
      throw new ChatClientError(
        `Network error contacting Dayjoy AI: ${(err as Error).message}`,
        { code: "NETWORK", status: 0 },
      );
    }

    if (!res.ok) {
      clearTimeout(timer);
      throw await this.toChatClientError(res);
    }
    if (!res.body) {
      clearTimeout(timer);
      throw new ChatClientError("No response body from server", {
        code: "NO_BODY",
        status: res.status,
      });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const parser = new SSEParser();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const events = parser.feed(text);
        for (const ev of events) {
          yield ev;
          // Stop early on error — the backend will close the stream.
          if (ev.type === "error") return;
        }
      }
      // Flush any trailing buffered event.
      for (const ev of parser.flush()) {
        yield ev;
      }
    } finally {
      clearTimeout(timer);
      try {
        reader.releaseLock();
      } catch {
        /* noop */
      }
    }
  }

  /**
   * Fetch the conversation history (paginated).
   *
   * Returns messages oldest-first (the order the chat UI renders them).
   */
  async getHistory(
    page = 1,
    limit = 50,
    opts: ChatClientOptions = {},
  ): Promise<Message[]> {
    this.requireSession();
    const res = await this.request<{
      data: Record<string, unknown>[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(
      "GET",
      `/${this.sessionId}/history?page=${page}&limit=${limit}`,
      undefined,
      opts,
    );
    return res.data.map(toMessage);
  }

  /**
   * Submit visitor feedback (thumbs up/down) on a specific message.
   *
   * The backend stores the rating as an analytics event; it doesn't
   * mutate the message itself. Returns `void` — callers update their
   * local state on success.
   */
  async submitFeedback(
    messageId: string,
    rating: "up" | "down",
    comment?: string,
    opts: ChatClientOptions = {},
  ): Promise<void> {
    this.requireSession();
    await this.request(
      "POST",
      `/${this.sessionId}/feedback`,
      {
        messageId,
        feedback: rating === "up" ? "positive" : "negative",
        comment,
      },
      opts,
    );
  }

  // ---------------------------------------------------------------
  // private helpers
  // ---------------------------------------------------------------

  private requireSession(): void {
    if (!this.sessionId) {
      throw new ChatClientError(
        "Chat session not initialized — call initSession() first.",
        { code: "NO_SESSION", status: 400 },
      );
    }
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body: Record<string, unknown> | undefined,
    opts: ChatClientOptions,
  ): Promise<T> {
    const url = `${this.basePath}${path}`;
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const res = await fetch(url, {
        method,
        headers: body
          ? { "Content-Type": "application/json", Accept: "application/json" }
          : { Accept: "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        credentials: "omit",
        mode: "cors",
      });
      if (!res.ok) {
        throw await this.toChatClientError(res);
      }
      // 204 No Content
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ChatClientError("Invalid JSON response from server", {
          code: "BAD_JSON",
          status: res.status,
        });
      }
    } catch (err) {
      if (err instanceof ChatClientError) throw err;
      if ((err as Error).name === "AbortError") {
        throw new ChatClientError("Request timed out", {
          code: "TIMEOUT",
          status: 0,
        });
      }
      throw new ChatClientError(
        `Network error: ${(err as Error).message}`,
        { code: "NETWORK", status: 0 },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async toChatClientError(res: Response): Promise<ChatClientError> {
    let message = `Request failed (${res.status})`;
    let code = `HTTP_${res.status}`;
    let retryAfter: number | undefined;
    const retryHeader = res.headers.get("retry-after");
    if (retryHeader) {
      const seconds = Number(retryHeader);
      if (!Number.isNaN(seconds)) retryAfter = seconds;
    }
    try {
      const text = await res.text();
      const json = text ? JSON.parse(text) : undefined;
      if (json?.message) message = String(json.message);
      if (json?.code) code = String(json.code);
      else if (json?.error) message = String(json.error);
    } catch {
      // Keep default message.
    }
    if (res.status === 429) {
      code = "RATE_LIMIT";
      message =
        "You're chatting a bit too quickly — please wait a moment and try again.";
    } else if (res.status >= 500) {
      code = "SERVER_ERROR";
      message =
        "Dayjoy AI is having trouble right now. We've been notified — please try again.";
    } else if (res.status === 404) {
      code = "NOT_FOUND";
      message =
        "This conversation was not found. It may have expired — please refresh to start a new one.";
    }
    return new ChatClientError(message, {
      status: res.status,
      code,
      retryAfter,
    });
  }
}

// ---------------------------------------------------------------
// SSR-safe accessors for browser-only globals
// ---------------------------------------------------------------

function safeWindowLocation(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.location.href;
  } catch {
    return undefined;
  }
}

function safeDocumentReferrer(): string | undefined {
  if (typeof document === "undefined") return undefined;
  try {
    return document.referrer || undefined;
  } catch {
    return undefined;
  }
}

function safeUserAgent(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  try {
    return navigator.userAgent || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Convenience factory — builds a `ChatClient` from the standard
 * `NEXT_PUBLIC_API_URL` env var (or a fallback) so callers don't
 * need to thread the URL through everywhere.
 */
export function createChatClient(apiUrl?: string): ChatClient {
  const url =
    apiUrl ||
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) ||
    "https://api.dayjoy.ai";
  return new ChatClient(url);
}

/** Shape of a `ChatSession` reconstructed on the client (localStorage). */
export interface PersistedSession {
  sessionId: string;
  visitorId?: string;
  createdAt: string;
  assistantName: string;
  messages: Message[];
}

/**
 * SessionStorage helpers — persist the active session in localStorage
 * so conversations survive page reloads.
 */
const STORAGE_KEY = "dayjoy-chat-session";

export function loadPersistedSession(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed?.sessionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePersistedSession(session: PersistedSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* localStorage may be full or blocked — silently no-op. */
  }
}

export function clearPersistedSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/** localStorage key for the visitor theme preference. */
export const THEME_STORAGE_KEY = "dayjoy-chat-theme";
