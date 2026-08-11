import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../backend/auth/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../backend/_shared/security/permissions.guard';
import { CurrentUser } from '../../backend/_shared/auth/current-user.decorator';
import { VapiAnalyticsDashboard } from './vapi-analytics-dashboard';
import { VapiCallLogger } from './vapi-call-logger';
import { VapiToolUsageTracker } from './vapi-tool-usage-tracker';
import { VapiAiMetrics } from './vapi-ai-metrics';

/**
 * Vapi Analytics Controller
 *
 * All read-only analytics endpoints for the Voice AI subsystem live
 * here. Endpoints:
 *
 *   GET  /api/voice/analytics/dashboard
 *   GET  /api/voice/analytics/calls
 *   GET  /api/voice/analytics/calls/:sessionId
 *   GET  /api/voice/analytics/tools
 *   GET  /api/voice/analytics/ai
 *   GET  /api/voice/analytics/report
 *   GET  /api/voice/analytics/export
 *
 * Authentication: every endpoint requires a valid JWT
 * (`JwtAuthGuard`) + the `analytics:read` permission
 * (`PermissionsGuard` / `@RequirePermissions`). The tenant scope is
 * taken from the JWT claim (`req.user.tenantId`) — clients must NOT
 * pass `tenantId` as a query param (it would let a caller read
 * cross-tenant analytics by passing another tenant's id).
 */
@Controller('api/voice/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VapiAnalyticsController {
  private readonly logger = new Logger(VapiAnalyticsController.name);

  constructor(
    private readonly dashboard: VapiAnalyticsDashboard,
    private readonly callLogger: VapiCallLogger,
    private readonly toolTracker: VapiToolUsageTracker,
    private readonly aiMetrics: VapiAiMetrics,
  ) {}

  /**
   * Composite dashboard payload — the one call the UI makes to
   * render the whole dashboard.
   */
  @Get('dashboard')
  @RequirePermissions('analytics:read')
  @HttpCode(HttpStatus.OK)
  async getDashboard(
    @CurrentUser('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.requireTenant(tenantId);
    const dateRange = this.parseDateRange(from, to);
    return this.dashboard.getDashboardMetrics(tenantId, dateRange);
  }

  /**
   * Aggregated call statistics with optional date-range filter.
   */
  @Get('calls')
  @RequirePermissions('analytics:read')
  @HttpCode(HttpStatus.OK)
  async getCalls(
    @CurrentUser('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.requireTenant(tenantId);
    const dateRange = this.parseDateRange(from, to);
    const [statistics, recent] = await Promise.all([
      this.callLogger.getCallStatistics(tenantId, dateRange),
      this.callLogger.getRecentCalls(
        tenantId,
        limit ? Number(limit) : 20,
        offset ? Number(offset) : 0,
      ),
    ]);
    return { statistics, recent };
  }

  /**
   * Single-call detail (session + analytics + transcript + customer).
   */
  @Get('calls/:sessionId')
  @RequirePermissions('analytics:read')
  @HttpCode(HttpStatus.OK)
  async getCallDetails(@Param('sessionId') sessionId: string) {
    const details = await this.callLogger.getCallDetails(sessionId);
    if (!details) {
      return { status: 'not_found', sessionId };
    }
    const aiMetrics = await this.aiMetrics.getCallMetrics(sessionId);
    const qualityScore = await this.aiMetrics.getQualityScore(sessionId);
    return { ...details, aiMetrics, qualityScore };
  }

  /**
   * Per-tool usage stats (count, success rate, avg latency).
   */
  @Get('tools')
  @RequirePermissions('analytics:read')
  @HttpCode(HttpStatus.OK)
  async getTools(
    @CurrentUser('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    this.requireTenant(tenantId);
    const dateRange = this.parseDateRange(from, to);
    const [overview, recent] = await Promise.all([
      this.toolTracker.getOverview(tenantId, dateRange),
      this.toolTracker.getRecentExecutions(
        tenantId,
        limit ? Number(limit) : 20,
        offset ? Number(offset) : 0,
      ),
    ]);
    return { overview, recent };
  }

  /**
   * AI-quality metrics (accuracy, CSAT, sentiment, hallucination
   * rate, 7-day trends).
   */
  @Get('ai')
  @RequirePermissions('analytics:read')
  @HttpCode(HttpStatus.OK)
  async getAiMetrics(
    @CurrentUser('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.requireTenant(tenantId);
    const dateRange = this.parseDateRange(from, to);
    return this.aiMetrics.getOverallStatistics(tenantId, dateRange);
  }

  /**
   * Daily / range performance report with operational recommendations.
   */
  @Get('report')
  @RequirePermissions('analytics:read')
  @HttpCode(HttpStatus.OK)
  async getReport(
    @CurrentUser('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    this.requireTenant(tenantId);
    const dateRange = this.parseDateRange(from, to);
    return this.dashboard.getPerformanceReport(tenantId, dateRange);
  }

  /**
   * Full export — JSON or CSV. Streams the response as an
   * attachment so browsers download it.
   */
  @Get('export')
  @RequirePermissions('analytics:read')
  @HttpCode(HttpStatus.OK)
  async exportReport(
    @CurrentUser('tenantId') tenantId: string,
    @Query('format') format: 'json' | 'csv' = 'json',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res() res?: Response,
  ) {
    this.requireTenant(tenantId);
    const dateRange = this.parseDateRange(from, to);
    const body = await this.dashboard.exportReport(
      tenantId,
      format,
      dateRange,
    );

    if (res) {
      const ext = format === 'csv' ? 'csv' : 'json';
      const contentType =
        format === 'csv' ? 'text/csv' : 'application/json';
      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="vapi-analytics-${tenantId}-${Date.now()}.${ext}"`,
      );
      res.send(body);
      return;
    }
    return body;
  }

  // -------------------------------------------------------------------
  // private helpers
  // -------------------------------------------------------------------

  private requireTenant(tenantId?: string): void {
    if (!tenantId) {
      throw new BadRequestException(
        'tenantId query parameter is required',
      );
    }
  }

  private parseDateRange(
    from?: string,
    to?: string,
  ): { from: Date; to: Date } | undefined {
    if (!from && !to) return undefined;
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException(`Invalid 'from' date: ${from}`);
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new BadRequestException(`Invalid 'to' date: ${to}`);
    }
    return {
      from: fromDate ?? new Date(0),
      to: toDate ?? new Date(),
    };
  }
}
