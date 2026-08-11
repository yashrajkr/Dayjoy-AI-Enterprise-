/**
 * Type definitions for the Dayjoy AI website chat widget.
 *
 * These types are the **public contract** between the React widget
 * and:
 *   - the API client (`chat-client.ts`)
 *   - the backend `website-chat` module
 *     (`backend/website-chat/website-chat.controller.ts`)
 *
 * Keep them in sync with the backend DTOs.
 */

/** Conversation role. Mirrors the backend `MessageRole`. */
export type MessageRole = "user" | "assistant" | "system";

/** Visitor feedback on an assistant message. */
export type FeedbackRating = "up" | "down" | null;

/** A single source citation attached to an assistant message. */
export interface Citation {
  /** Title of the source document (e.g. an FAQ article title). */
  documentTitle: string;
  /** The retrieved text chunk the assistant used. */
  chunkText: string;
  /** Relevance score (0–1, higher = more relevant). */
  relevance: number;
  /** Optional URL the user can click to open the source. */
  sourceUrl?: string;
}

/** A chat message (user, assistant, or system). */
export interface Message {
  /** Stable id (backend `Message.id`). */
  id: string;
  /** Sender. */
  role: MessageRole;
  /** Raw message text (Markdown for assistant). */
  content: string;
  /** ISO timestamp the message was created. */
  timestamp: string;
  /** Optional RAG citations attached to an assistant reply. */
  citations?: Citation[];
  /** Visitor feedback on this message (assistant messages only). */
  feedback?: FeedbackRating;
  /**
   * True while the message is being streamed token-by-token.
   * Client-only — never persisted server-side.
   */
  streaming?: boolean;
  /** True if sending/streaming this message failed; show retry UI. */
  error?: boolean;
}

/** A chat session returned by `POST /api/website-chat/init`. */
export interface ChatSession {
  /** Backend session id (used as the URL param on subsequent calls). */
  sessionId: string;
  /** Linked conversation id (AI pipeline). */
  conversationId?: string;
  /** Anonymous visitor id (persist in localStorage for returning visitors). */
  visitorId?: string;
  /** ISO timestamp the session was created. */
  createdAt: string;
  /** Display name of the assistant. */
  assistantName: string;
  /** Messages (loaded via `getHistory`). */
  messages: Message[];
  /** Welcome message to show the visitor on first open. */
  welcomeMessage?: string;
}

/** Pre-chat form data (name + email collected before the chat starts). */
export interface PreChatData {
  name?: string;
  email?: string;
}

/** Connection status shown to the visitor. */
export type ConnectionStatus = "connecting" | "online" | "offline" | "error";

/** Position of the floating launcher button. */
export type WidgetPosition = "bottom-right" | "bottom-left";

/** Configuration for the embeddable widget. */
export interface WidgetConfig {
  /** Base URL of the Dayjoy backend, e.g. `https://api.dayjoy.ai`. */
  apiUrl: string;
  /** Display name of the assistant (shown in the header). */
  assistantName?: string;
  /** Brand color (hex / rgb / hsl). Defaults to Dayjoy orange `#E07A1F`. */
  brandColor?: string;
  /** Where the launcher appears. Defaults to `bottom-right`. */
  position?: WidgetPosition;
  /** Override the default welcome message. */
  welcomeMessage?: string;
  /** When true, show a name + email form before the chat starts. */
  requirePreChat?: boolean;
  /** Optional: avatar URL shown in the header. */
  avatarUrl?: string;
  /** Optional: a placeholder for the input box. */
  inputPlaceholder?: string;
  /** Optional: theme override. Defaults to follow the host page. */
  theme?: "light" | "dark" | "auto";
}

/** Default widget configuration (merged with caller-provided props). */
export const DEFAULT_WIDGET_CONFIG: Required<
  Pick<
    WidgetConfig,
    | "apiUrl"
    | "assistantName"
    | "brandColor"
    | "position"
    | "welcomeMessage"
    | "requirePreChat"
    | "inputPlaceholder"
    | "theme"
  >
> = {
  apiUrl:
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_API_URL) ||
    "https://api.dayjoy.ai",
  assistantName: "Dayjoy AI",
  brandColor: "#E07A1F",
  position: "bottom-right",
  welcomeMessage:
    "Hi! I'm the Dayjoy assistant. How can I help you today?",
  requirePreChat: true,
  inputPlaceholder: "Type your message…",
  theme: "auto",
};

/** Quick-reply suggestion chips shown on first load. */
export interface QuickReply {
  /** The text displayed on the chip. */
  label: string;
  /** The text sent to the assistant when the chip is clicked. */
  message: string;
}

/** Default quick replies shown above the input on first load. */
export const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  { label: "What products do you offer?", message: "What products do you offer?" },
  { label: "Track my order", message: "How can I track my order?" },
  { label: "Talk to a human", message: "I'd like to talk to a human agent." },
];
