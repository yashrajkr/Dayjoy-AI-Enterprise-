/**
 * Vapi Memory Types
 *
 * Lightweight type definitions for the Vapi memory subsystem. The
 * canonical persistence layer for long-term memory is the `AiMemory`
 * table (typed by Prisma's `MemoryType` enum: FACT / PREFERENCE /
 * HISTORY / CONTEXT). The types below cover the in-flight shapes used
 * by the Redis-backed session memory + customer profile cache.
 */

/**
 * Logical memory category. Mapped to the `AiMemory.type` Prisma enum
 * (`MemoryType`) when persisting long-term:
 *   - 'fact'        -> FACT
 *   - 'preference'  -> PREFERENCE
 *   - 'history'     -> HISTORY
 *   - 'context'     -> CONTEXT
 *   - 'short_term'  -> CONTEXT (with a short TTL via `expiresAt`)
 *   - 'long_term'   -> FACT or PREFERENCE (caller picks)
 */
export type VapiMemoryType =
  | 'short_term'
  | 'long_term'
  | 'context'
  | 'fact'
  | 'preference'
  | 'history';

/**
 * A single memory entry. Mirrors the `AiMemory` table columns but
 * uses a string-typed `type` field for ergonomics inside the Vapi
 * module (the Prisma enum is used only at the persistence boundary).
 */
export interface MemoryItem {
  id: string;
  tenantId: string;
  agentId?: string | null;
  userId?: string | null;
  customerId?: string | null;
  type: VapiMemoryType;
  key: string;
  value: string;
  importance: number; // 1-10
  expiresAt?: Date | null;
  metadata?: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Redis-backed session memory layout. Stored as a single JSON blob
 * under `vapi:session:{sessionId}` with a 24h TTL.
 *
 * The structure is intentionally flat — small enough that re-writing
 * the whole blob on every `set()` is cheaper than a Redis hash
 * field-by-field update.
 */
export interface SessionMemory {
  sessionId: string;
  callId: string;
  phoneNumber?: string;
  fromNumber?: string;
  toNumber?: string;
  tenantId: string;
  customerId?: string;
  conversationId?: string;
  assistantIdVapi?: string;
  direction?: 'INBOUND' | 'OUTBOUND';
  activeFlow?: string;
  flowStep?: string;
  flowData?: Record<string, any>;
  intentDetected?: string;
  customer?: {
    id: string;
    name?: string;
    type?: string;
  };
  lastUserMessage?: string;
  lastAssistantMessage?: string;
  escalationTriggered?: boolean;
  toolCallsCount?: number;
  startedAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  [key: string]: any;
}

/**
 * Customer profile as enriched by the Vapi customer-profile service.
 * Combines the raw `Customer` row with recent orders and AI memories
 * (preferences / facts) so the assistant has the full picture in one
 * Redis-cached lookup.
 */
export interface CustomerProfile {
  id: string;
  tenantId: string;
  customerType?: string;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
  recentOrders?: Array<{
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    placedAt: Date;
  }>;
  preferences: Record<string, string>;
  facts: Array<{ key: string; value: string; importance: number }>;
  cachedAt: string; // ISO timestamp
}

/**
 * Aggregated memory context handed to the LLM / flow manager.
 */
export interface MemoryContext {
  session: SessionMemory | null;
  customer: CustomerProfile | null;
  shortTerm: MemoryItem[];
  longTerm: MemoryItem[];
  summary: string;
}
