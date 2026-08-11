/**
 * Support ticket types — Employee Portal.
 */

export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_CUSTOMER"
  | "RESOLVED"
  | "CLOSED"
  | "ESCALATED";

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type TicketCategory =
  | "ORDER"
  | "PRODUCT"
  | "PAYMENT"
  | "SHIPPING"
  | "RETURN"
  | "REFUND"
  | "ACCOUNT"
  | "TECHNICAL"
  | "OTHER";

export type TicketChannel = "WEB" | "EMAIL" | "PHONE" | "WHATSAPP" | "CHAT";

export interface TicketCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface TicketMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: "CUSTOMER" | "EMPLOYEE" | "SYSTEM" | "AI";
  body: string;
  createdAt: string;
  attachments?: { id: string; name: string; url: string }[];
}

export interface TicketActivity {
  id: string;
  type:
    | "STATUS_CHANGE"
    | "ASSIGNMENT"
    | "PRIORITY_CHANGE"
    | "ESCALATION"
    | "COMMENT"
    | "TIME_LOG";
  description: string;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  number: string;
  subject: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  channel?: TicketChannel;

  customerId: string;
  customer?: TicketCustomer;

  assignedToId?: string | null;
  assignedToName?: string | null;

  relatedOrderId?: string | null;
  relatedProductId?: string | null;

  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  slaDueAt?: string | null;

  messages?: TicketMessage[];
  activity?: TicketActivity[];
  totalMinutesLogged?: number;

  createdAt: string;
  updatedAt?: string;
}

export interface TicketFilters {
  status?: TicketStatus | "ALL";
  priority?: TicketPriority | "ALL";
  assignedToId?: string | "ME" | "UNASSIGNED" | "ALL";
  search?: string;
}

export interface CreateTicketInput {
  subject: string;
  description?: string;
  priority: TicketPriority;
  category: TicketCategory;
  customerId: string;
  channel?: TicketChannel;
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedToId?: string;
  category?: TicketCategory;
}

export interface ReplyTicketInput {
  body: string;
  isInternal?: boolean;
}
