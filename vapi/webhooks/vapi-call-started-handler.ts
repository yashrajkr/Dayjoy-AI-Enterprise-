import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { VapiSessionMemory } from '../memory/vapi-session-memory';
import { VapiCustomerProfile } from '../memory/vapi-customer-profile';

/**
 * Fallback tenant id when a call's tenant can't be resolved from the
 * inbound phone number. Mirrors the convention used in
 * `backend/auth/auth.service.ts` (`DEFAULT_TENANT_ID`).
 *
 * In production this should be replaced by a real phone-number →
 * tenant lookup table (one Dayjoy number per tenant), but the env
 * override unblocks dev/test today.
 */
const DEFAULT_TENANT_ID = process.env.VAPI_DEFAULT_TENANT_ID
  ?? process.env.DEFAULT_TENANT_ID
  ?? 'default';

/**
 * Normalized call-start payload. Vapi's actual webhook body shape
 * varies a bit between versions — we coerce the most common shapes
 * into this structure at the top of `handle()` so the rest of the
 * handler doesn't have to defend against missing fields.
 */
export interface VapiCallStartedInput {
  id: string;
  type?: string;            // 'inbound' | 'outbound' | 'outbound-phone'
  direction?: string;
  from?: string;
  to?: string;
  phoneNumber?: string;
  assistantId?: string;
  agentId?: string;
  tenantId?: string;
  startedAt?: string | number;
  metadata?: Record<string, any>;
}

export interface VapiCallStartedResult {
  sessionId: string;
  conversationId?: string;
  customerId?: string;
  welcomeMessage: string;
}

/**
 * Vapi Call-Started Handler.
 *
 * Fires when Vapi delivers a `call-start` (or legacy `call.started`)
 * webhook. Responsibilities:
 *
 *   1. Create a `VoiceSession` row keyed by the Vapi call id (the
 *      `callId` column is `@unique`, so a duplicate start webhook
 *      is a no-op rather than a constraint violation).
 *   2. Initialize the Redis session memory blob with caller info.
 *   3. Try to identify the caller via the `Customer.phone` field
 *      (across the resolved tenant). If found, attach the customer
 *      to the session + populate the session memory with a
 *      customer snapshot.
 *   4. Create an `AiConversation` row (channel=VOICE) so the
 *      assistant's replies have somewhere to land. The conversation
 *      is linked back to the voice session via `sessionId`.
 *
 * The handler is idempotent: if `VoiceSession.callId` already exists,
 * the existing session is returned without re-creating dependencies.
 */
@Injectable()
export class VapiCallStartedHandler {
  private readonly logger = new Logger(VapiCallStartedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionMemory: VapiSessionMemory,
    private readonly customerProfile: VapiCustomerProfile,
  ) {}

  async handle(
    call: VapiCallStartedInput,
    _rawBody?: any,
  ): Promise<VapiCallStartedResult> {
    const normalized = this.normalize(call);
    this.logger.log(
      `Call started: id=${normalized.id} from=${normalized.from} to=${normalized.to} direction=${normalized.direction}`,
    );

    // -------------------------------------------------------------
    // 1. Resolve tenant + customer (by phone, within tenant)
    // -------------------------------------------------------------
    const tenantId = normalized.tenantId ?? DEFAULT_TENANT_ID;
    let customerId: string | undefined;
    if (normalized.from) {
      const found = await this.customerProfile
        .findByPhone(normalized.from, tenantId)
        .catch((err) => {
          this.logger.warn(
            `Customer lookup failed for ${normalized.from}: ${err.message}`,
          );
          return null;
        });
      if (found) {
        customerId = found.id;
        this.logger.log(`Identified caller as customer ${customerId}`);
      }
    }

    // -------------------------------------------------------------
    // 2. Idempotent VoiceSession upsert (callId is unique)
    // -------------------------------------------------------------
    let session = await this.prisma.voiceSession.findUnique({
      where: { callId: normalized.id },
    });

    if (session) {
      this.logger.log(
        `VoiceSession already exists for call ${normalized.id} — treating as duplicate start webhook`,
      );
    } else {
      session = await this.prisma.voiceSession.create({
        data: {
          tenantId,
          callId: normalized.id,
          phoneNumber: normalized.from ?? null,
          // `direction` is NOT NULL at the database level — must be set on
          // every create, not just stashed in `metadata`.
          direction: normalized.direction ?? 'INBOUND',
          assistantId: normalized.assistantId ?? null,
          customerId: customerId ?? null,
          status: 'IN_PROGRESS',
          startedAt: normalized.startedAt
            ? new Date(normalized.startedAt)
            : new Date(),
          metadata: {
            direction: normalized.direction,
            from: normalized.from,
            to: normalized.to,
            assistantIdVapi: normalized.assistantId,
            customerId: customerId ?? null,
            raw: call.metadata ?? {},
          } as any,
        },
      });
    }

    // -------------------------------------------------------------
    // 3. Initialize Redis session memory
    // -------------------------------------------------------------
    await this.sessionMemory.init(session.id, {
      callId: normalized.id,
      phoneNumber: normalized.from,
      fromNumber: normalized.from,
      toNumber: normalized.to,
      tenantId: session.tenantId,
      customerId,
      assistantIdVapi: normalized.assistantId,
      direction: normalized.direction,
      startedAt: session.startedAt.toISOString(),
    });

    if (customerId) {
      const profile = await this.customerProfile
        .getProfile(customerId)
        .catch(() => null);
      if (profile) {
        await this.sessionMemory.set(session.id, 'customer', {
          id: profile.id,
          name: [profile.firstName, profile.lastName]
            .filter(Boolean)
            .join(' '),
          type: profile.customerType,
        });
      }
    }

    // -------------------------------------------------------------
    // 4. Create (or reuse) the AI conversation row
    // -------------------------------------------------------------
    let conversationId: string | undefined;
    if (!session.conversationId) {
      const agentId = await this.resolveAgentId(session.tenantId, normalized.assistantId);
      if (agentId) {
        try {
          const conversation = await this.prisma.conversation.create({
            data: {
              tenantId: session.tenantId,
              agentId,
              customerId: customerId ?? null,
              channel: 'VOICE',
              sessionId: session.id,
              status: 'ACTIVE',
              startedAt: new Date(),
              context: {
                callId: normalized.id,
                from: normalized.from,
                to: normalized.to,
                direction: normalized.direction,
              } as any,
            },
          });
          conversationId = conversation.id;

          await this.prisma.voiceSession.update({
            where: { id: session.id },
            data: { conversationId },
          });
          await this.sessionMemory.set(session.id, 'conversationId', conversationId);
        } catch (err) {
          this.logger.error(
            `Failed to create conversation for session ${session.id}: ${err.message}`,
          );
        }
      } else {
        this.logger.warn(
          `No VOICE-type AiAgent found for tenant ${session.tenantId} — skipping conversation creation`,
        );
      }
    } else {
      conversationId = session.conversationId;
    }

    // -------------------------------------------------------------
    // 5. Build the welcome message (personalized if possible)
    // -------------------------------------------------------------
    const welcomeMessage = await this.buildWelcomeMessage(session.id, customerId);

    return {
      sessionId: session.id,
      conversationId,
      customerId,
      welcomeMessage,
    };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /**
   * Coerce Vapi's various payload shapes into a single normalized
   * form. Vapi has renamed fields across versions (`phoneNumber` →
   * `from`, `assistantId` → `agentId`, etc.) — we accept either.
   */
  private normalize(call: VapiCallStartedInput): VapiCallStartedInput {
    const direction =
      call.direction ??
      (call.type === 'outbound' || call.type === 'outbound-phone'
        ? 'OUTBOUND'
        : 'INBOUND');
    return {
      id: call.id,
      type: call.type,
      direction,
      from: call.from ?? call.phoneNumber,
      to: call.to,
      phoneNumber: call.phoneNumber ?? call.from,
      assistantId: call.assistantId ?? call.agentId,
      agentId: call.agentId ?? call.assistantId,
      tenantId: call.tenantId,
      startedAt: call.startedAt,
      metadata: call.metadata,
    };
  }

  /**
   * Resolve the `AiAgent` to attach the conversation to.
   *
   * Strategy:
   *   1. If the Vapi assistant id is configured on an AiAgent's
   *      `configuration` JSON (key `vapiAssistantId`), use it.
   *   2. Else, fall back to the first VOICE-type agent for the
   *      tenant.
   *   3. Else, the first agent for the tenant (any type).
   *   4. Else, undefined — caller skips conversation creation.
   */
  private async resolveAgentId(
    tenantId: string,
    assistantIdVapi?: string,
  ): Promise<string | undefined> {
    if (assistantIdVapi) {
      const byConfig = await this.prisma.aiAgent.findFirst({
        where: {
          tenantId,
          type: 'VOICE',
        },
      });
      // Check the configuration JSON for a matching vapiAssistantId.
      // (Prisma can't filter inside JSON portably across engines, so
      // we fetch VOICE agents and inspect client-side.)
      const candidates = byConfig
        ? [byConfig, ...(await this.prisma.aiAgent.findMany({
            where: { tenantId, type: 'VOICE' },
          }))]
        : await this.prisma.aiAgent.findMany({
            where: { tenantId, type: 'VOICE' },
          });
      const match = candidates.find((a) => {
        const cfg = a.configuration as any;
        return cfg?.vapiAssistantId === assistantIdVapi;
      });
      if (match) return match.id;
    }

    const voiceAgent = await this.prisma.aiAgent.findFirst({
      where: { tenantId, type: 'VOICE' },
    });
    if (voiceAgent) return voiceAgent.id;

    const anyAgent = await this.prisma.aiAgent.findFirst({
      where: { tenantId },
    });
    return anyAgent?.id;
  }

  /**
   * Build a personalized welcome message based on the caller's
   * customer profile (if known). The message is returned to Vapi
   * via the webhook response and spoken by the assistant as the
   * first turn.
   */
  private async buildWelcomeMessage(
    sessionId: string,
    customerId?: string,
  ): Promise<string> {
    if (!customerId) {
      return 'Hi! Thank you for calling Dayjoy. This is Sarah, your virtual assistant. How can I help you today?';
    }
    const profile = await this.customerProfile.getProfile(customerId);
    if (!profile) {
      return 'Hi! Thank you for calling Dayjoy. This is Sarah, your virtual assistant. How can I help you today?';
    }
    const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    const isDistributor = (profile.customerType ?? '').toUpperCase() === 'DISTRIBUTOR';
    if (isDistributor) {
      return `Hello ${name || 'there'}! Thank you for calling Dayjoy. This is Sarah. How can I help you with your business today?`;
    }
    if (profile.recentOrders?.length) {
      return `Welcome back, ${name || 'friend'}! Thanks for calling Dayjoy again. I see you have a recent order — would you like an update, or is there something else I can help with?`;
    }
    return `Welcome back, ${name || 'friend'}! Thank you for calling Dayjoy. How can I help you today?`;
  }
}
