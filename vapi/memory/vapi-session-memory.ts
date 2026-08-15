import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '../../backend/_shared/security/redis.decorators';
import type Redis from 'ioredis';
import type { SessionMemory } from './vapi-memory-types';

/**
 * TTL for the per-session Redis key. Calls longer than 24h are
 * exceedingly rare (Vapi itself caps calls at ~2h) — 24h keeps the
 * key around long enough for follow-up analytics queries without
 * leaking memory.
 */
const SESSION_TTL_SECONDS = 24 * 60 * 60;

/**
 * Vapi Session Memory — Redis-backed.
 *
 * Critical for multi-replica deployments: storing session state in
 * Redis (not in a process-local `Map`) means any pod can serve any
 * webhook for the same call. Vapi's load balancer does not pin a
 * call to a single webhook target — so the call-start webhook may
 * hit pod A while the transcript webhooks hit pod B, etc.
 *
 * Key layout:
 *   - `vapi:session:{sessionId}`      -> JSON blob (SessionMemory)
 *   - `vapi:call:{callId}:sessionId`  -> sessionId string (reverse lookup)
 *
 * Both keys share the same TTL.
 */
@Injectable()
export class VapiSessionMemory {
  private readonly logger = new Logger(VapiSessionMemory.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  /**
   * Initialize the session blob. Overwrites any prior blob for the
   * same sessionId (used at call-start — there should never be a
   * prior blob, but if Vapi retries the call-start webhook we want
   * idempotent behavior).
   */
  async init(sessionId: string, data: Partial<SessionMemory>): Promise<void> {
    const now = new Date().toISOString();
    const session: SessionMemory = {
      sessionId,
      callId: data.callId ?? '',
      phoneNumber: data.phoneNumber,
      fromNumber: data.fromNumber ?? data.phoneNumber,
      toNumber: data.toNumber,
      tenantId: data.tenantId ?? '',
      customerId: data.customerId,
      conversationId: data.conversationId,
      assistantIdVapi: data.assistantIdVapi,
      direction: data.direction,
      toolCallsCount: 0,
      startedAt: data.startedAt ?? now,
      updatedAt: now,
      ...data,
    };
    await this.persist(sessionId, session);

    if (session.callId) {
      await this.redis.set(
        this.callKey(session.callId),
        sessionId,
        'EX',
        SESSION_TTL_SECONDS,
      );
    }
  }

  /**
   * Read a single field from the session blob.
   * Returns undefined if the session or field doesn't exist.
   */
  async get<T = any>(sessionId: string, key: string): Promise<T | undefined> {
    const data = await this.getAll(sessionId);
    return data ? (data as any)[key] : undefined;
  }

  /**
   * Write a single field to the session blob. Reads + merges + writes
   * the whole blob (sessions are small — typically <2KB).
   */
  async set(sessionId: string, key: string, value: any): Promise<void> {
    const data = (await this.getAll(sessionId)) ?? ({} as SessionMemory);
    (data as any)[key] = value;
    (data as any).updatedAt = new Date().toISOString();
    await this.persist(sessionId, data);
  }

  /**
   * Merge multiple fields at once. Atomic-ish — the read-merge-write
   * is not transactional, but the single SETEX at the end is. Good
   * enough for our concurrency level (one writer per call in
   * practice).
   */
  async merge(sessionId: string, patch: Partial<SessionMemory>): Promise<void> {
    const data = (await this.getAll(sessionId)) ?? ({} as SessionMemory);
    Object.assign(data as object, patch);
    (data as any).updatedAt = new Date().toISOString();
    await this.persist(sessionId, data);
  }

  /**
   * Read the entire session blob. Returns null if the session has
   * expired or was never initialized.
   */
  async getAll(sessionId: string): Promise<SessionMemory | null> {
    const raw = await this.redis.get(this.sessionKey(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionMemory;
    } catch (err) {
      this.logger.error(
        `Failed to parse session memory for ${sessionId}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Delete the session blob + reverse-lookup key. Called when a call
   * ends to free memory immediately rather than waiting for TTL.
   */
  async clear(sessionId: string): Promise<void> {
    const data = await this.getAll(sessionId);
    await this.redis.del(this.sessionKey(sessionId));
    if (data?.callId) {
      await this.redis.del(this.callKey(data.callId));
    }
  }

  /**
   * Reverse lookup: given a Vapi call id, return our internal
   * session id. Used by the function-call / transcript handlers
   * (which only know the call id from the webhook payload).
   */
  async getSessionIdByCallId(callId: string): Promise<string | null> {
    return this.redis.get(this.callKey(callId));
  }

  /**
   * Convenience: load the session by call id (combines
   * `getSessionIdByCallId` + `getAll`).
   */
  async getByCallId(callId: string): Promise<SessionMemory | null> {
    const sessionId = await this.getSessionIdByCallId(callId);
    if (!sessionId) return null;
    return this.getAll(sessionId);
  }

  /**
   * Increment the tool-call counter atomically. Avoids the
   * read-merge-write race when two tool calls fire near-simultaneously
   * — which now happens routinely: `VapiWebhookService`'s `tool-calls`
   * route executes every call in a batch concurrently via
   * `Promise.all`, so multiple `incrementToolCalls` calls for the same
   * session commonly overlap in a single turn.
   *
   * The session blob is a single JSON string (not a Redis hash), so a
   * true atomic single-field increment isn't available directly.
   * WATCH/MULTI optimistic locking was considered but rejected: this
   * service is a singleton sharing ONE ioredis connection across all
   * concurrent callers, and WATCH is scoped to the *connection*, not
   * to an individual logical call — two concurrent
   * `incrementToolCalls()` invocations would clobber each other's
   * watch state on that shared connection, defeating the whole
   * mechanism. A Lua script sidesteps that entirely: Redis executes
   * scripts atomically and single-threaded server-side, so there's no
   * connection-sharing race to reason about, regardless of how many
   * concurrent JS callers share the client.
   */
  private static readonly INCREMENT_SCRIPT = `
    local raw = redis.call('GET', KEYS[1])
    if not raw then return -1 end
    local data = cjson.decode(raw)
    data.toolCallsCount = (data.toolCallsCount or 0) + 1
    data.updatedAt = ARGV[2]
    redis.call('SET', KEYS[1], cjson.encode(data), 'EX', ARGV[1])
    return data.toolCallsCount
  `;

  async incrementToolCalls(sessionId: string): Promise<number> {
    const key = this.sessionKey(sessionId);
    const result = await this.redis.eval(
      VapiSessionMemory.INCREMENT_SCRIPT,
      1,
      key,
      String(SESSION_TTL_SECONDS),
      new Date().toISOString(),
    );
    const next = Number(result);
    return next < 0 ? 0 : next;
  }

  // -------------------------------------------------------------------
  // private helpers
  // -------------------------------------------------------------------

  private sessionKey(sessionId: string): string {
    return `vapi:session:${sessionId}`;
  }

  private callKey(callId: string): string {
    return `vapi:call:${callId}:sessionId`;
  }

  private async persist(sessionId: string, data: SessionMemory): Promise<void> {
    await this.redis.set(
      this.sessionKey(sessionId),
      JSON.stringify(data),
      'EX',
      SESSION_TTL_SECONDS,
    );
  }
}
