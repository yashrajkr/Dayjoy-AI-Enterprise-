import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { VapiClientService } from '../config/vapi-client-service';
import { VAPI_ASSISTANT_CONFIG } from '../config/vapi-assistant-config';
import { buildDefaultSystemPrompt } from '../prompts';
import { VapiToolRegistry } from '../tools/vapi-tool-registry.service';
import { AuthUser } from '../../backend/ai/auth-user';
import {
  CreateAssistantDto,
  UpdateAssistantDto,
  VapiAssistantType,
} from './create-assistant.dto';

/**
 * Normalised assistant shape returned by every method. Decoupled from
 * the Prisma `AiAgent` model so we can rename fields without breaking
 * the controller / clients.
 */
export interface Assistant {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  description: string | null;
  systemPrompt: string;
  firstMessage: string;
  model: string;
  temperature: number;
  maxTokens: number;
  voiceId: string;
  tools: string[];
  vapiAssistantId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * VapiAssistantService — manages the lifecycle of Vapi assistants.
 *
 * Each assistant is dual-tracked:
 *   1. Vapi-side (created via `VapiClientService.createAssistant`) —
 *      holds the voice, transcription, and model wiring.
 *   2. DB-side (Prisma `AiAgent` row) — holds the tenant linkage, the
 *      system prompt, the tool list, and the Vapi assistant ID for
 *      cross-reference.
 *
 * `create()` and `update()` write to both stores (Vapi first, then DB
 * so we can roll back the Vapi assistant if the DB write fails).
 * `delete()` soft-deletes the DB row (status = 'inactive') and
 * best-effort deletes the Vapi assistant.
 */
@Injectable()
export class VapiAssistantService {
  private readonly logger = new Logger(VapiAssistantService.name);

  constructor(
    private readonly vapiClient: VapiClientService,
    private readonly prisma: PrismaService,
    private readonly toolRegistry: VapiToolRegistry,
  ) {}

  /**
   * Create a new assistant. Flow:
   *   1. Assemble the system prompt (dto.systemPrompt OR the default
   *      concatenation of the four `vapi/prompts/` constants).
   *   2. Resolve the tool list (dto.tools OR all 8 registered tools).
   *   3. Build the Vapi payload by merging `VAPI_ASSISTANT_CONFIG` with
   *      the dto overrides + the assembled prompt + tool definitions.
   *   4. Call `VapiClientService.createAssistant()` — if it fails
   *      because Vapi isn't configured, we still create the DB row
   *      with `vapiAssistantId=null` so the assistant exists locally.
   *   5. Persist the `AiAgent` row.
   */
  async createAssistant(dto: CreateAssistantDto, user: AuthUser): Promise<Assistant> {
    if (!user.tenantId) {
      throw new Error('AuthUser.tenantId is required to create an assistant.');
    }

    const systemPrompt =
      dto.systemPrompt?.trim() || buildDefaultSystemPrompt();
    const firstMessage =
      dto.firstMessage?.trim() || VAPI_ASSISTANT_CONFIG.firstMessage;
    const model = dto.model || VAPI_ASSISTANT_CONFIG.model.model;
    const temperature = dto.temperature ?? VAPI_ASSISTANT_CONFIG.model.temperature;
    const maxTokens = dto.maxTokens ?? VAPI_ASSISTANT_CONFIG.model.maxTokens;
    const voiceId = dto.voiceId || VAPI_ASSISTANT_CONFIG.voice.voiceId;

    // Resolve the tool list. When dto.tools is unset, enable all 8.
    const allToolNames = this.toolRegistry.listTools().map((t) => t.name);
    const enabledToolNames =
      dto.tools && dto.tools.length > 0 ? dto.tools : allToolNames;
    const toolDefinitions = this.toolRegistry
      .getToolDefinitions()
      .filter((d) => enabledToolNames.includes(d.function.name));

    // Build the Vapi payload. The base config has placeholder
    // `messages` and `tools` arrays — we replace them with the
    // assembled prompt + tool list.
    const vapiPayload = {
      ...VAPI_ASSISTANT_CONFIG,
      name: dto.name,
      firstMessage,
      model: {
        ...VAPI_ASSISTANT_CONFIG.model,
        model,
        temperature,
        maxTokens,
        messages: [{ role: 'system', content: systemPrompt }],
        tools: toolDefinitions,
      },
      voice: {
        ...VAPI_ASSISTANT_CONFIG.voice,
        voiceId,
      },
    };

    // Create the Vapi assistant. Best-effort — if Vapi isn't
    // configured (no API key) we still create the DB row.
    let vapiAssistantId: string | null = null;
    if (this.vapiClient.isEnabled()) {
      try {
        const vapiAssistant = await this.vapiClient.createAssistant(vapiPayload);
        vapiAssistantId = vapiAssistant.id;
        this.logger.log(`Created Vapi assistant ${vapiAssistantId}`);
      } catch (err) {
        this.logger.warn(
          `Vapi assistant creation failed — proceeding with DB-only record: ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.warn(
        'Vapi client is not enabled — creating DB-only assistant record (no Vapi assistant will exist).',
      );
    }

    // Persist the AiAgent row.
    const agent = await this.prisma.aiAgent.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        type: (dto.type ?? VapiAssistantType.VOICE) as any,
        description: dto.description ?? null,
        // Spread the static template FIRST so its defaults (serverUrl,
        // serverMessages, backgroundSound, etc.) are present, then
        // override with the actual per-assistant computed values last.
        // The previous spread order was backwards — `VAPI_ASSISTANT_CONFIG`
        // spread LAST clobbered `model`/`firstMessage`/`voiceId` back to
        // the static placeholder defaults (`model.messages: [{content: ''}]`,
        // `tools: []`), so the persisted `configuration` silently
        // diverged from what was actually sent to Vapi in `vapiPayload`
        // — e.g. the real system prompt was never recorded. `systemPrompt`
        // is also stored directly (mirrors `updateAssistant()`'s shape)
        // so `getAssistant`/UI code doesn't have to dig into
        // `model.messages[0].content`.
        configuration: {
          ...VAPI_ASSISTANT_CONFIG,
          vapiAssistantId,
          firstMessage,
          systemPrompt,
          model: vapiPayload.model,
          voice: vapiPayload.voice,
          temperature,
          maxTokens,
          voiceId,
        },
        capabilities: { tools: enabledToolNames },
        status: 'active',
      },
    });

    return this.toAssistant(agent, systemPrompt, firstMessage);
  }

  /**
   * Fetch a single assistant by ID. Throws `NotFoundException` when
   * the row doesn't exist or belongs to a different tenant.
   */
  async getAssistant(id: string, user: AuthUser): Promise<Assistant> {
    const agent = await this.prisma.aiAgent.findUnique({ where: { id } });
    if (!agent || agent.tenantId !== user.tenantId) {
      throw new NotFoundException(`Assistant ${id} not found`);
    }
    return this.toAssistant(agent);
  }

  /**
   * List all assistants for the caller's tenant.
   */
  async listAssistants(user: AuthUser): Promise<Assistant[]> {
    const agents = await this.prisma.aiAgent.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return agents.map((a) => this.toAssistant(a));
  }

  /**
   * Update an assistant. Only the supplied fields are mutated.
   *
   * The Vapi assistant is updated first (best-effort) — if it fails we
   * log a warning and continue with the DB update so the local record
   * reflects the user's intent.
   */
  async updateAssistant(
    id: string,
    dto: UpdateAssistantDto,
    user: AuthUser,
  ): Promise<Assistant> {
    const existing = await this.prisma.aiAgent.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== user.tenantId) {
      throw new NotFoundException(`Assistant ${id} not found`);
    }

    const existingConfig = (existing.configuration as Record<string, any>) ?? {};
    const existingTools = (existing.capabilities as Record<string, any>)?.tools ?? [];
    const existingSystemPrompt =
      existingConfig.systemPrompt ??
      // The original scaffold didn't persist systemPrompt in `configuration`.
      // Fall back to the default-built prompt for backward compat.
      buildDefaultSystemPrompt();

    const systemPrompt =
      dto.systemPrompt?.trim() || existingSystemPrompt;
    const firstMessage =
      dto.firstMessage?.trim() || existingConfig.firstMessage || VAPI_ASSISTANT_CONFIG.firstMessage;
    const model = dto.model || existingConfig.model || VAPI_ASSISTANT_CONFIG.model.model;
    const temperature =
      dto.temperature ?? existingConfig.temperature ?? VAPI_ASSISTANT_CONFIG.model.temperature;
    const maxTokens =
      dto.maxTokens ?? existingConfig.maxTokens ?? VAPI_ASSISTANT_CONFIG.model.maxTokens;
    const voiceId = dto.voiceId || existingConfig.voiceId || VAPI_ASSISTANT_CONFIG.voice.voiceId;
    const tools = dto.tools ?? existingTools;
    const toolDefinitions = this.toolRegistry
      .getToolDefinitions()
      .filter((d) => tools.includes(d.function.name));

    // Best-effort Vapi update.
    const vapiAssistantId = existingConfig.vapiAssistantId;
    if (vapiAssistantId && this.vapiClient.isEnabled()) {
      try {
        await this.vapiClient.updateAssistant(vapiAssistantId, {
          name: dto.name,
          firstMessage,
          model: {
            ...VAPI_ASSISTANT_CONFIG.model,
            model,
            temperature,
            maxTokens,
            messages: [{ role: 'system', content: systemPrompt }],
            tools: toolDefinitions,
          },
          voice: { ...VAPI_ASSISTANT_CONFIG.voice, voiceId },
        });
        this.logger.log(`Updated Vapi assistant ${vapiAssistantId}`);
      } catch (err) {
        this.logger.warn(
          `Vapi assistant update failed — DB record will be updated anyway: ${(err as Error).message}`,
        );
      }
    }

    const updated = await this.prisma.aiAgent.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.type ? { type: dto.type as any } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        configuration: {
          ...existingConfig,
          vapiAssistantId,
          systemPrompt,
          firstMessage,
          model,
          temperature,
          maxTokens,
          voiceId,
        },
        capabilities: { tools },
        ...(dto.status ? { status: dto.status } : {}),
      },
    });

    return this.toAssistant(updated, systemPrompt, firstMessage);
  }

  /**
   * Soft-delete the assistant: sets `status='inactive'` on the DB row
   * and best-effort deletes the Vapi assistant.
   *
   * We don't hard-delete because audit logs / past voice sessions
   * reference the agent ID — hard-deleting would orphan those rows.
   */
  async deleteAssistant(id: string, user: AuthUser): Promise<{ id: string; deleted: boolean }> {
    const existing = await this.prisma.aiAgent.findUnique({ where: { id } });
    if (!existing || existing.tenantId !== user.tenantId) {
      throw new NotFoundException(`Assistant ${id} not found`);
    }

    const existingConfig = (existing.configuration as Record<string, any>) ?? {};
    const vapiAssistantId = existingConfig.vapiAssistantId;
    if (vapiAssistantId && this.vapiClient.isEnabled()) {
      try {
        await this.vapiClient.deleteAssistant(vapiAssistantId);
        this.logger.log(`Deleted Vapi assistant ${vapiAssistantId}`);
      } catch (err) {
        this.logger.warn(
          `Vapi assistant delete failed — DB record will still be deactivated: ${(err as Error).message}`,
        );
      }
    }

    await this.prisma.aiAgent.update({
      where: { id },
      data: { status: 'inactive' },
    });

    return { id, deleted: true };
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /**
   * Map a Prisma `AiAgent` row into the `Assistant` shape returned by
   * every public method. The `systemPrompt` is read from
   * `configuration.systemPrompt`; when absent (legacy rows), we fall
   * back to the default-built prompt.
   */
  private toAssistant(
    agent: any,
    systemPromptOverride?: string,
    firstMessageOverride?: string,
  ): Assistant {
    const config = (agent.configuration as Record<string, any>) ?? {};
    const capabilities = (agent.capabilities as Record<string, any>) ?? {};
    return {
      id: agent.id,
      tenantId: agent.tenantId,
      name: agent.name,
      type: agent.type,
      description: agent.description ?? null,
      systemPrompt:
        systemPromptOverride ??
        config.systemPrompt ??
        buildDefaultSystemPrompt(),
      firstMessage:
        firstMessageOverride ?? config.firstMessage ?? VAPI_ASSISTANT_CONFIG.firstMessage,
      model: config.model ?? VAPI_ASSISTANT_CONFIG.model.model,
      temperature: config.temperature ?? VAPI_ASSISTANT_CONFIG.model.temperature,
      maxTokens: config.maxTokens ?? VAPI_ASSISTANT_CONFIG.model.maxTokens,
      voiceId: config.voiceId ?? VAPI_ASSISTANT_CONFIG.voice.voiceId,
      tools: Array.isArray(capabilities.tools) ? capabilities.tools : [],
      vapiAssistantId: config.vapiAssistantId ?? null,
      status: agent.status,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
  }
}
