import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Logger,
  NotFoundException,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../backend/_shared/database/prisma.service';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../backend/_shared/auth/current-user.decorator';
import { RequirePermissions } from '../backend/_shared/security/permissions.guard';
import { JwtAuthGuard } from '../backend/auth/guards/jwt-auth.guard';
import { VapiClientService } from './config/vapi-client-service';
import { VapiAssistantService } from './assistants/vapi-assistant.service';
import {
  CreateAssistantDto as VapiCreateAssistantDto,
} from './assistants/create-assistant.dto';
import { VapiAnalyticsDashboard } from './analytics/vapi-analytics-dashboard';
import { VapiCallLogger } from './analytics/vapi-call-logger';
import { VapiToolUsageTracker } from './analytics/vapi-tool-usage-tracker';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/**
 * Request body for `POST /api/voice/calls` — initiate an outbound call.
 */
export class InitiateCallDto {
  @IsString()
  phoneNumber: string;

  @IsString()
  assistantId: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Query params for `GET /api/voice/calls` — paginated list of calls.
 */
export class QueryCallsDto {
  @IsOptional()
  @IsEnum(['active', 'ended', 'failed', 'transferring'])
  status?: 'active' | 'ended' | 'failed' | 'transferring';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

/**
 * Request body for `POST /api/voice/assistants` — create a new assistant
 * configuration in Vapi + the local `ai_agents` table.
 *
 * NOTE: The authoritative DTO is owned by `VapiAssistantController` — we
 * accept a permissive shape here and forward it through
 * `VapiAssistantService.createAssistant()` which performs full validation.
 */
export class CreateAssistantDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  voiceId?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  firstMessage?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;

  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * Query params for `GET /api/voice/analytics/calls`.
 */
export class QueryAnalyticsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(['resolved', 'escalated', 'abandoned'])
  resolution?: 'resolved' | 'escalated' | 'abandoned';
}

/**
 * Query params for `GET /api/voice/analytics/tools` + `…/dashboard`.
 */
export class QueryAnalyticsToolsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * Top-level Voice API controller.
 *
 * Exposes REST endpoints under `/api/voice` for:
 *   - Initiating / listing / fetching / ending voice calls
 *   - Listing active sessions
 *   - Managing Vapi assistants (delegated to VapiAssistantService)
 *   - Reading analytics (dashboard / calls / tools)
 *
 * All endpoints except the public webhook (handled separately by
 * `VapiWebhookController` at `/api/voice/webhook`) require JWT
 * authentication + the appropriate `voice:*` permission.
 *
 * The webhook controller lives at `vapi/webhooks/vapi-webhook-controller.ts`
 * and is intentionally NOT merged here — it has different auth
 * requirements (HMAC signature verification, not JWT).
 */
@Controller('api/voice')
@UseGuards(JwtAuthGuard)
export class VapiController {
  private readonly logger = new Logger(VapiController.name);

  constructor(
    private readonly vapiClient: VapiClientService,
    private readonly prisma: PrismaService,
    private readonly assistantService: VapiAssistantService,
    private readonly analyticsDashboard: VapiAnalyticsDashboard,
    private readonly callLogger: VapiCallLogger,
    private readonly toolTracker: VapiToolUsageTracker,
  ) {}

  // -------------------------------------------------------------------------
  // Calls
  // -------------------------------------------------------------------------

  /**
   * Initiate an outbound call via Vapi.
   *
   * Permission: `voice:create`
   */
  @Post('calls')
  @RequirePermissions('voice:create')
  @HttpCode(HttpStatus.CREATED)
  async initiateCall(
    @Body() dto: InitiateCallDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(
      `User ${user.userId} initiating outbound call to ${dto.phoneNumber}`,
    );

    const call = await this.vapiClient.createCall({
      phoneNumber: dto.phoneNumber,
      assistantId: dto.assistantId,
      customer: dto.customerId ? { id: dto.customerId } : undefined,
      metadata: {
        tenantId: user.tenantId,
        customerId: dto.customerId,
        purpose: dto.purpose,
        initiatedBy: user.userId,
        ...(dto.metadata ?? {}),
      },
    });

    // Persist a VoiceSession row immediately so the call is visible in
    // the dashboard before the call.started webhook arrives.
    const session = await this.prisma.voiceSession.create({
      data: {
        tenantId: user.tenantId,
        callId: call.id,
        phoneNumber: dto.phoneNumber,
        status: 'IN_PROGRESS',
        direction: 'OUTBOUND',
        assistantId: dto.assistantId,
        customerId: dto.customerId ?? null,
        userId: user.userId,
        metadata: dto.metadata ?? {},
        startedAt: new Date(),
      },
    });

    return {
      ...call,
      sessionId: session.id,
    };
  }

  /**
   * List voice calls (paginated, filterable) for the current tenant.
   *
   * Permission: `voice:read`
   */
  @Get('calls')
  @RequirePermissions('voice:read')
  async listCalls(
    @Query() query: QueryCallsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const limit = query.limit || 20;
    const page = query.page || 1;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: user.tenantId };
    if (query.status) where.status = query.status;
    if (query.phoneNumber) where.phoneNumber = query.phoneNumber;
    if (query.customerId) where.customerId = query.customerId;
    if (query.dateFrom || query.dateTo) {
      where.startedAt = {};
      if (query.dateFrom) where.startedAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.startedAt.lte = new Date(query.dateTo);
    }

    const [calls, total] = await Promise.all([
      this.prisma.voiceSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip,
        include: {
          customer: true,
          analytics: true,
        },
      }),
      this.prisma.voiceSession.count({ where }),
    ]);

    return {
      data: calls,
      total,
      limit,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get details of a specific call (including transcripts + analytics).
   *
   * Permission: `voice:read`
   */
  @Get('calls/:id')
  @RequirePermissions('voice:read')
  async getCall(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const call = await this.prisma.voiceSession.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        customer: true,
        transcripts: { orderBy: { createdAt: 'asc' } },
        analytics: true,
      },
    });

    if (!call) {
      throw new NotFoundException(`Call ${id} not found`);
    }

    return call;
  }

  /**
   * End an active call. Triggers Vapi's end-call API and marks the
   * session as `ended` in the database.
   *
   * Permission: `voice:update`
   */
  @Post('calls/:id/end')
  @RequirePermissions('voice:update')
  @HttpCode(HttpStatus.OK)
  async endCall(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const session = await this.prisma.voiceSession.findFirst({
      where: { id, tenantId: user.tenantId },
    });

    if (!session) {
      throw new NotFoundException(`Call ${id} not found`);
    }

    if (session.status === 'ENDED') {
      return { success: true, message: 'Call already ended' };
    }

    // Tell Vapi to hang up.
    try {
      await this.vapiClient.endCall(session.callId);
    } catch (err) {
      // Even if Vapi fails (call may have already ended), we still mark
      // the local session as ended so the dashboard reflects reality.
      this.logger.warn(
        `Vapi endCall failed for ${session.callId}: ${(err as Error).message}`,
      );
    }

    await this.prisma.voiceSession.update({
      where: { id },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Fetch the recording URL for a call (proxies Vapi's getRecording).
   *
   * Permission: `voice:read`
   */
  @Get('calls/:id/recording')
  @RequirePermissions('voice:read')
  async getRecording(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const session = await this.prisma.voiceSession.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!session) throw new NotFoundException(`Call ${id} not found`);

    const recordingUrl = await this.vapiClient.getRecording(session.callId);
    if (!recordingUrl) {
      throw new NotFoundException('Recording not available');
    }

    // Persist the recording URL on the session for future lookups.
    await this.prisma.voiceSession.update({
      where: { id },
      data: { recordingUrl },
    });

    return { recordingUrl };
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  /**
   * List all active (in-progress) voice sessions for the current tenant.
   *
   * Permission: `voice:read`
   */
  @Get('sessions/active')
  @RequirePermissions('voice:read')
  async getActiveSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.voiceSession.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'IN_PROGRESS',
      },
      include: {
        customer: true,
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  // -------------------------------------------------------------------------
  // Assistants (delegated to VapiAssistantService — DB + Vapi sync)
  // -------------------------------------------------------------------------

  /**
   * List configured Vapi assistants for the current tenant.
   *
   * The service returns the union of local `ai_agents` rows and any
   * Vapi-side assistants (the local row is authoritative — the Vapi
   * assistant id is stored in `configuration.vapiAssistantId`).
   *
   * Permission: `voice:read`
   */
  @Get('assistants')
  @RequirePermissions('voice:read')
  async listAssistants(@CurrentUser() user: AuthenticatedUser) {
    const assistants = await this.assistantService.listAssistants(
      user as any,
    );
    return { data: assistants, count: assistants.length };
  }

  /**
   * Create a new Vapi assistant.
   *
   * Forwards to `VapiAssistantService.createAssistant()` which:
   *   1. Assembles the system prompt (dto override or the default
   *      concatenation of the four `vapi/prompts/` constants).
   *   2. Resolves the tool list (dto override or all 8 registered tools).
   *   3. Creates the assistant in Vapi (best-effort — proceeds with a
   *      DB-only record when Vapi is unavailable).
   *   4. Persists the `AiAgent` row.
   *
   * Permission: `voice:create`
   */
  @Post('assistants')
  @RequirePermissions('voice:create')
  @HttpCode(HttpStatus.CREATED)
  async createAssistant(
    @Body() dto: CreateAssistantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const vapiDto = new VapiCreateAssistantDto();
    vapiDto.name = dto.name;
    if (dto.voiceId !== undefined) vapiDto.voiceId = dto.voiceId;
    if (dto.model !== undefined) vapiDto.model = dto.model;
    if (dto.firstMessage !== undefined) vapiDto.firstMessage = dto.firstMessage;
    if (dto.systemPrompt !== undefined) vapiDto.systemPrompt = dto.systemPrompt;
    if (dto.description !== undefined) vapiDto.description = dto.description;

    return this.assistantService.createAssistant(vapiDto, user as any);
  }

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  /**
   * Aggregated analytics dashboard for the current tenant.
   *
   * Delegates to `VapiAnalyticsDashboard.getDashboardMetrics()` which
   * composes the call statistics, tool usage overview, AI metrics, and
   * health-status into a single payload the dashboard UI renders
   * directly.
   *
   * Permission: `voice:read`
   */
  @Get('analytics/dashboard')
  @RequirePermissions('voice:read')
  async getAnalyticsDashboard(
    @Query() query: QueryAnalyticsToolsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const dateRange = this.parseDateRange(query.dateFrom, query.dateTo);
    return this.analyticsDashboard.getDashboardMetrics(
      user.tenantId,
      dateRange,
    );
  }

  /**
   * List call analytics rows (paginated) + aggregate statistics.
   *
   * Permission: `voice:read`
   */
  @Get('analytics/calls')
  @RequirePermissions('voice:read')
  async getCallAnalytics(
    @Query() query: QueryAnalyticsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const dateRange = this.parseDateRange(query.dateFrom, query.dateTo);
    const limit = query.limit || 20;
    const offset = ((query.page || 1) - 1) * limit;

    const [statistics, recent] = await Promise.all([
      this.callLogger.getCallStatistics(user.tenantId, dateRange),
      this.callLogger.getRecentCalls(user.tenantId, limit, offset),
    ]);
    return { statistics, recent };
  }

  /**
   * Aggregate tool-usage stats for the current tenant.
   *
   * Returns per-tool execution counts, success rates, and average
   * latency from the `analytics_events` table (event type
   * `tool_execution`), plus a paginated list of recent executions.
   *
   * Permission: `voice:read`
   */
  @Get('analytics/tools')
  @RequirePermissions('voice:read')
  async getToolAnalytics(
    @Query() query: QueryAnalyticsToolsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const dateRange = this.parseDateRange(query.dateFrom, query.dateTo);
    const limit = query.limit || 20;
    const offset = query.offset || 0;

    const [overview, recent] = await Promise.all([
      this.toolTracker.getOverview(user.tenantId, dateRange),
      this.toolTracker.getRecentExecutions(user.tenantId, limit, offset),
    ]);
    return { overview, recent };
  }

  // -------------------------------------------------------------------------
  // private helpers
  // -------------------------------------------------------------------------

  /**
   * Parse an optional date-range pair into the `{ from, to }` shape
   * used by the analytics services. Throws `BadRequestException` on
   * invalid input.
   */
  private parseDateRange(
    from?: string,
    to?: string,
  ): { from: Date; to: Date } | undefined {
    if (!from && !to) return undefined;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException(`Invalid 'dateFrom' date: ${from}`);
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new BadRequestException(`Invalid 'dateTo' date: ${to}`);
    }
    return {
      from: fromDate ?? new Date(0),
      to: toDate ?? new Date(),
    };
  }
}
