/** Customer Portal — shared domain types. */

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  role?: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    requestId?: string;
    timestamp?: string;
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  raw?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    requestId?: string;
    timestamp?: string;
    cursor?: string;
  };
}

// ===== AI / Conversations =====

export type ConversationRole = "user" | "assistant" | "system";

export interface Citation {
  id: string;
  documentTitle: string;
  snippet: string;
  url?: string;
  source?: string;
  score?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
  citations?: Citation[];
  tokens?: number;
  latencyMs?: number;
}

export interface Conversation {
  id: string;
  title: string;
  channel: "website" | "voice" | "whatsapp" | "mobile";
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  firstMessage?: string;
  summary?: string;
  messages?: ChatMessage[];
}

export interface SendMessageInput {
  content: string;
  stream?: boolean;
}

// ===== Support Tickets =====

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TicketReply {
  id: string;
  ticketId: string;
  author: "customer" | "agent" | "system";
  authorName: string;
  content: string;
  attachments?: { name: string; url: string }[];
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  customerId: string;
  customerName?: string;
  assignedAgent?: string | null;
  tags?: string[];
  attachments?: { name: string; url: string }[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  replies?: TicketReply[];
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  category: string;
  priority: TicketPriority;
  attachments?: { name: string; url: string }[];
}

// ===== Live chat =====

export interface LiveChatMessage {
  id: string;
  sessionId: string;
  author: "customer" | "agent" | "system";
  authorName: string;
  content: string;
  createdAt: string;
}

export interface LiveChatSession {
  id: string;
  status: "waiting" | "active" | "ended";
  estimatedWaitSeconds?: number;
  agentName?: string | null;
  messages: LiveChatMessage[];
  createdAt: string;
}

// ===== Knowledge base / FAQ =====

export interface KnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  tags?: string[];
  readingMinutes?: number;
  helpfulCount?: number;
  notHelpfulCount?: number;
  updatedAt: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  helpful?: number;
  notHelpful?: number;
}

export interface KnowledgeQueryResult {
  answer: string;
  citations: Citation[];
  confidence?: number;
  latencyMs?: number;
}

// ===== Notifications =====

export type NotificationType =
  | "order"
  | "promotion"
  | "support"
  | "system";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationPreferences {
  channels: {
    email: boolean;
    sms: boolean;
    whatsapp: boolean;
    push: boolean;
  };
  categories: {
    order: boolean;
    promotion: boolean;
    support: boolean;
    account: boolean;
  };
  quietHours: {
    enabled: boolean;
    startTime: string; // "22:00"
    endTime: string; // "07:00"
  };
}

// ===== Settings / Profile =====

export type ThemeOption = "light" | "dark" | "brand";

export interface Settings {
  theme: ThemeOption;
  language: string;
  dateFormat: string;
  timezone: string;
  notifications: NotificationPreferences;
}
