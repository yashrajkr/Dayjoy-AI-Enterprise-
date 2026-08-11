import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '../../backend/_shared/security/redis.decorators';
import type Redis from 'ioredis';

/**
 * TTL for the per-session Redis key. WhatsApp sessions are short-lived
 * (24h matches Meta's customer-care window) — anything older than that
 * is recreated from scratch on the next inbound message.
 */
const SESSION_TTL_SECONDS = 24 * 60 * 60;

/**
 * Redis-backed WhatsApp session memory.
 *
 * Critical for multi-replica deployments: storing session state in
 * Redis (not in a process-local `Map`) means any pod can serve any
 * webhook for the same conversation. Meta does not pin a customer to
 * a single webhook target — load balancers route per-request.
 *
 * Key layout:
 *   - `whatsapp:session:{phoneNumber}`     -> JSON blob (WhatsAppSessionMemory)
 *   - `whatsapp:wamid:{wamid}`             -> phoneNumber (reverse lookup)
 *
 * Both keys share the same TTL.
 *
 * The session is keyed by phone number (not Meta's `wamid`) because
 * every message from the same customer shares the same phone number
 * but a different `wamid`. Reverse lookup by `wamid` is useful for
 * the status handler (which only knows the `wamid`).
 */
export interface WhatsAppSessionMemoryBlob {
  /** Tenant id resolved from the inbound phone number / business account. */
  tenantId: string;
  /** Customer id (if the contact was matched to a `Customer` row). */
  customerId?: string;
  /** WhatsApp contact id (Prisma `WhatsappContact.id`). */
  contactId?: string;
  /** Internal `WhatsappSession.id`. */
  sessionId?: string;
  /** Internal `Conversation.id` (channel=WHATSAPP). */
  conversationId?: string;
  /** `AiAgent.id` driving the conversation. */
  agentId?: string;
  /** Phone number of the customer (E.164, no `+`). */
  phoneNumber: string;
  /** Customer name as WhatsApp reports it (profile name). */
  name?: string;
  /** Last user message text (for tool execution context). */
  lastUserMessage?: string;
  /** Last assistant message text. */
  lastAssistantMessage?: string;
  /** Tool-call counter (per session). */
  toolCallsCount?: number;
  /** Set when a human transfer has been requested. */
  escalationTriggered?: boolean;
  /** ISO timestamp of session creation. */
  startedAt: string;
  /** ISO timestamp of last update. */
  updatedAt: string;
  /** Free-form extension bag (handlers can stash arbitrary fields). */
  [key: string]: any;
}

/**
 * WhatsApp Session Memory — Redis-backed.
 *
 * Same pattern as `VapiSessionMemory`: small JSON blob per session,
 * read-merge-write for field updates, atomic-ish at our concurrency
 * level (one writer per customer at a time in practice).
 */
@Injectable()
export class WhatsAppSessionMemoryService {
  private readonly logger = new Logger(WhatsAppSessionMemoryService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  /**
   * Initialize the session blob. Overwrites any prior blob for the
   * same phone number (used at session start — should be idempotent).
   */
  async init(
    phoneNumber: string,
    data: Partial<WhatsAppSessionMemoryBlob>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const blob: WhatsAppSessionMemoryBlob = {
      tenantId: data.tenantId ?? '',
      phoneNumber,
      startedAt: data.startedAt ?? now,
      updatedAt: now,
      ...data,
    };
    await this.persist(phoneNumber, blob);
  }

  /**
   * Read a single field from the session blob.
   */
  async get<T = any>(
    phoneNumber: string,
    key: string,
  ): Promise<T | undefined> {
    const data = await this.getAll(phoneNumber);
    return data ? (data as any)[key] : undefined;
  }

  /**
   * Write a single field to the session blob.
   */
  async set(
    phoneNumber: string,
    key: string,
    value: any,
  ): Promise<void> {
    const data =
      (await this.getAll(phoneNumber)) ??
      ({} as WhatsAppSessionMemoryBlob);
    (data as any)[key] = value;
    (data as any).updatedAt = new Date().toISOString();
    await this.persist(phoneNumber, data);
  }

  /**
   * Merge multiple fields at once.
   */
  async merge(
    phoneNumber: string,
    patch: Partial<WhatsAppSessionMemoryBlob>,
  ): Promise<void> {
    const data =
      (await this.getAll(phoneNumber)) ??
      ({} as WhatsAppSessionMemoryBlob);
    Object.assign(data as object, patch);
    (data as any).updatedAt = new Date().toISOString();
    await this.persist(phoneNumber, data);
  }

  /**
   * Read the entire session blob. Returns null if expired or never
   * initialized.
   */
  async getAll(
    phoneNumber: string,
  ): Promise<WhatsAppSessionMemoryBlob | null> {
    const raw = await this.redis.get(this.sessionKey(phoneNumber));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WhatsAppSessionMemoryBlob;
    } catch (err) {
      this.logger.error(
        `Failed to parse session memory for ${phoneNumber}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Delete the session blob + reverse-lookup key. Called when a
   * conversation ends to free memory immediately.
   */
  async clear(phoneNumber: string): Promise<void> {
    await this.redis.del(this.sessionKey(phoneNumber));
  }

  /**
   * Record a wamid → phoneNumber mapping for the status handler.
   *
   * The status webhook carries only the `wamid`; the handler needs to
   * look up the originating conversation to update the message row.
   */
  async recordMessageId(wamid: string, phoneNumber: string): Promise<void> {
    await this.redis.set(
      this.wamidKey(wamid),
      phoneNumber,
      'EX',
      SESSION_TTL_SECONDS,
    );
  }

  /**
   * Reverse-lookup: given a `wamid`, return the originating phone
   * number. Used by the status handler.
   */
  async getPhoneNumberByMessageId(wamid: string): Promise<string | null> {
    return this.redis.get(this.wamidKey(wamid));
  }

  /**
   * Increment the tool-call counter.
   */
  async incrementToolCalls(phoneNumber: string): Promise<number> {
    const data = await this.getAll(phoneNumber);
    if (!data) return 0;
    const next = (data.toolCallsCount ?? 0) + 1;
    data.toolCallsCount = next;
    data.updatedAt = new Date().toISOString();
    await this.persist(phoneNumber, data);
    return next;
  }

  // -------------------------------------------------------------------
  // private helpers
  // -------------------------------------------------------------------

  private sessionKey(phoneNumber: string): string {
    return `whatsapp:session:${phoneNumber}`;
  }

  private wamidKey(wamid: string): string {
    return `whatsapp:wamid:${wamid}`;
  }

  private async persist(
    phoneNumber: string,
    data: WhatsAppSessionMemoryBlob,
  ): Promise<void> {
    await this.redis.set(
      this.sessionKey(phoneNumber),
      JSON.stringify(data),
      'EX',
      SESSION_TTL_SECONDS,
    );
  }
}
