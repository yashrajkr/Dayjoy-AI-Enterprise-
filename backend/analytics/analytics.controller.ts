import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../_shared/security/permissions.guard';
import { CurrentUser } from '../_shared/common/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { AiMetricsDto } from './dto/ai-metrics.dto';
import { KnowledgeMetricsDto } from './dto/knowledge-metrics.dto';
import {
  SalesMetricsDto,
  CustomerMetricsDto,
  ProductMetricsDto,
} from './dto/sales-metrics.dto';
import { VoiceMetricsDto, WhatsAppMetricsDto } from './dto/channel-metrics.dto';
import { RecordEventDto } from './dto/record-event.dto';
import {
  CreateMetricDto,
  RecordMetricValueDto,
  QueryMetricsDto,
} from './dto/metric.dto';
import { AuthUser } from '../ai/auth-user';

/**
 * Analytics controller.
 *
 * Every endpoint requires `analytics:read` (or, for the events-recording
 * endpoint, just authentication — recording an event is a side-effect of
 * using the product, not an analytics-admin action).
 *
 * Routes are mounted under `/api/analytics` and grouped by domain:
 *   - `/dashboard`         — single aggregate endpoint for the landing page.
 *   - `/sales`             — revenue + order counts.
 *   - `/customers`         — new/active/churn counts.
 *   - `/products`          — top sellers + low stock + category dist.
 *   - `/ai`                — conversations + messages + tokens + tools.
 *   - `/voice`             — call counts + duration + CSAT.
 *   - `/whatsapp`          — message counts + response rate.
 *   - `/knowledge`         — RAG queries + latency + confidence.
 *   - `/events`            — record / list analytics events.
 *   - `/metrics`           — custom metric CRUD.
 *   - `/metrics/:id/values` — record a value for a custom metric.
 */
@Controller('api/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @RequirePermissions('analytics:read')
  async getDashboard(@CurrentUser() user: AuthUser) {
    return this.analyticsService.getDashboard(user);
  }

  @Get('sales')
  @RequirePermissions('analytics:read')
  async getSalesMetrics(
    @CurrentUser() user: AuthUser,
    @Query() query: SalesMetricsDto,
  ) {
    return this.analyticsService.getSalesMetrics(query, user);
  }

  @Get('customers')
  @RequirePermissions('analytics:read')
  async getCustomerMetrics(
    @CurrentUser() user: AuthUser,
    @Query() query: CustomerMetricsDto,
  ) {
    return this.analyticsService.getCustomerMetrics(query, user);
  }

  @Get('products')
  @RequirePermissions('analytics:read')
  async getProductMetrics(
    @CurrentUser() user: AuthUser,
    @Query() query: ProductMetricsDto,
  ) {
    return this.analyticsService.getProductMetrics(query, user);
  }

  @Get('ai')
  @RequirePermissions('analytics:read')
  async getAIMetrics(
    @CurrentUser() user: AuthUser,
    @Query() query: AiMetricsDto,
  ) {
    return this.analyticsService.getAIMetrics(query, user);
  }

  @Get('voice')
  @RequirePermissions('analytics:read')
  async getVoiceMetrics(
    @CurrentUser() user: AuthUser,
    @Query() query: VoiceMetricsDto,
  ) {
    return this.analyticsService.getVoiceMetrics(query, user);
  }

  @Get('whatsapp')
  @RequirePermissions('analytics:read')
  async getWhatsAppMetrics(
    @CurrentUser() user: AuthUser,
    @Query() query: WhatsAppMetricsDto,
  ) {
    return this.analyticsService.getWhatsAppMetrics(query, user);
  }

  @Get('knowledge')
  @RequirePermissions('analytics:read')
  async getKnowledgeMetrics(
    @CurrentUser() user: AuthUser,
    @Query() query: KnowledgeMetricsDto,
  ) {
    return this.analyticsService.getKnowledgeMetrics(query, user);
  }

  @Post('events')
  async recordEvent(@CurrentUser() user: AuthUser, @Body() dto: RecordEventDto) {
    return this.analyticsService.recordEvent(dto, user);
  }

  @Get('metrics')
  @RequirePermissions('analytics:read')
  async getMetrics(@CurrentUser() user: AuthUser, @Query() query: QueryMetricsDto) {
    return this.analyticsService.getMetrics(query, user);
  }

  @Post('metrics')
  @RequirePermissions('analytics:read')
  async createMetric(@CurrentUser() user: AuthUser, @Body() dto: CreateMetricDto) {
    return this.analyticsService.createMetric(dto, user);
  }

  @Post('metrics/:id/values')
  @RequirePermissions('analytics:read')
  async recordMetricValue(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RecordMetricValueDto,
  ) {
    return this.analyticsService.recordMetricValue(id, dto, user);
  }
}
