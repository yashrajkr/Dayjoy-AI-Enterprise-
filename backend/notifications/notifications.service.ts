import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import {
  SendNotificationDto,
  NotificationType,
} from './dto/send-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { TemplatesService } from './templates.service';
import { AuthUser } from '../products/products.service';
import {
  NotificationProvider,
  ProviderDispatchResult,
} from './providers/notification.provider.interface';
import {
  NOTIFICATION_PROVIDER_EMAIL,
  NOTIFICATION_PROVIDER_SMS,
  NOTIFICATION_PROVIDER_WHATSAPP,
  NOTIFICATION_PROVIDER_PUSH,
  NOTIFICATION_PROVIDER_IN_APP,
  NOTIFICATION_PROVIDER_DEFAULT,
} from './providers/tokens';

/**
 * Always-succeeds default provider used when no real provider is bound.
 * Useful in tests / dev so notifications persist to the DB but don't try
 * to hit external APIs.
 */
class NoopNotificationProvider implements NotificationProvider {
  readonly name = 'noop';
  readonly channel = '*';
  async dispatch(_dto: SendNotificationDto): Promise<ProviderDispatchResult> {
    return { success: true, providerMessageId: `noop-${Date.now()}` };
  }
}

/**
 * Status values the notifications row can transition through.
 * Mirrors the Prisma `NotificationStatus` enum (PENDING / SENDING / SENT /
 * FAILED / CANCELLED).
 */
type NotificationStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';

/**
 * Maximum number of times the service will retry a failed dispatch before
 * giving up. The per-row max can also be overridden via
 * `SendNotificationDto.metadata.maxRetries`.
 */
const DEFAULT_MAX_RETRIES = 3;

/**
 * NotificationsService — orchestrates notification persistence, provider
 * dispatch, retry, and the user-facing inbox API.
 *
 * Responsibilities:
 *  - `send()` — persist a `notifications` row, dispatch it via the channel-
 *    appropriate provider, then update the row to `SENT` or `FAILED`. A
 *    `notification_logs` row captures every attempt for postmortem + retry
 *    purposes. Failed dispatches are retried up to `maxRetries` times
 *    before the row is marked FAILED.
 *  - `sendBatch()` — convenience wrapper for batch sends (e.g. a marketing
 *    campaign). Each send is independent — one failure doesn't block the
 *    rest.
 *  - `handleEvent()` — map a high-level business event (`order.created`,
 *    `password.reset`, etc.) to a notification template + dispatch. Events
 *    are mapped to template codes via a static lookup table.
 *  - `findAll()` / `findOne()` / `markAsRead()` / `markAllAsRead()` /
 *    `delete()` / `getUnreadCount()` — the current-user's inbox API.
 *  - `getPreferences()` / `updatePreferences()` — per-channel opt-in
 *    preferences.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly noopProvider = new NoopNotificationProvider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly templatesService: TemplatesService,
    @Optional() @Inject(NOTIFICATION_PROVIDER_EMAIL) private readonly emailProvider?: NotificationProvider,
    @Optional() @Inject(NOTIFICATION_PROVIDER_SMS) private readonly smsProvider?: NotificationProvider,
    @Optional() @Inject(NOTIFICATION_PROVIDER_WHATSAPP) private readonly whatsappProvider?: NotificationProvider,
    @Optional() @Inject(NOTIFICATION_PROVIDER_PUSH) private readonly pushProvider?: NotificationProvider,
    @Optional() @Inject(NOTIFICATION_PROVIDER_IN_APP) private readonly inAppProvider?: NotificationProvider,
    @Optional() @Inject(NOTIFICATION_PROVIDER_DEFAULT) private readonly defaultProvider?: NotificationProvider,
  ) {}

  // ---------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------

  async send(dto: SendNotificationDto) {
    this.logger.log(
      `Sending ${dto.type} notification to ${dto.recipient ?? dto.userId ?? '(no recipient)'}: ${dto.subject ?? '(no subject)'}`,
    );

    const maxRetries =
      (dto.metadata?.maxRetries as number | undefined) ?? DEFAULT_MAX_RETRIES;

    // 1. Persist the notification in PENDING state so we have a paper trail
    //    even if the provider dispatch fails.
    const notification = await this.prisma.notification.create({
      data: {
        tenantId: dto.tenantId,
        userId: dto.userId,
        customerId: dto.customerId,
        distributorId: dto.distributorId,
        type: dto.type as any,
        priority: (dto.priority ?? 'NORMAL') as any,
        subject: dto.subject,
        content: dto.body,
        body: dto.body,
        bodyHtml: dto.bodyHtml,
        recipient: dto.recipient,
        templateId: dto.templateId,
        status: 'PENDING' as NotificationStatus,
        maxRetries,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        metadata: dto.metadata ?? {},
      },
    });

    // 2. Dispatch with retries.
    const result = await this.dispatchWithRetries(dto, notification.id, maxRetries);

    // 3. Update the row + write a final log entry.
    const finalStatus: NotificationStatus = result.success ? 'SENT' : 'FAILED';
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: finalStatus,
        sentAt: result.success ? new Date() : null,
        providerMessageId: result.providerMessageId,
        errorMessage: result.errorMessage,
        retryCount: result.attempts - 1,
      },
    });

    return {
      success: result.success,
      notificationId: notification.id,
      providerMessageId: result.providerMessageId,
      attempts: result.attempts,
      ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
    };
  }

  /**
   * Batch send. Each notification is dispatched independently — one failure
   * doesn't block the rest. Returns an array of per-notification results.
   */
  async sendBatch(dtos: SendNotificationDto[]) {
    return Promise.all(dtos.map((dto) => this.send(dto).catch((err) => ({
      success: false,
      errorMessage: (err as Error).message,
      attempts: 0,
    }))));
  }

  // ---------------------------------------------------------------------
  // Event handling
  // ---------------------------------------------------------------------

  /**
   * Map a business event (e.g. `order.created`, `password.reset`) to a
   * notification template + dispatch.
   *
   * The payload's `recipient`, `subject`, and `body` fields are used
   * directly when no template is found for the event code. When a template
   * IS found, it's rendered with the payload as variables and overrides
   * the defaults.
   */
  async handleEvent(event: { event: string; payload: any }) {
    const { event: eventName, payload } = event;
    this.logger.log(`Handling notification event: ${eventName}`);

    const tenantId = payload.tenantId;
    if (!tenantId) {
      return { success: false, reason: 'Missing tenantId in event payload' };
    }

    // Look up a template matching this event code.
    const template = await this.templatesService.findByCode(eventName, tenantId);
    let subject = payload.subject ?? this.defaultSubjectFor(eventName);
    let body = payload.body ?? this.defaultBodyFor(eventName);
    let bodyHtml: string | undefined;

    if (template && template.isActive) {
      const rendered = this.templatesService.render(
        { subject: template.subject, body: template.body, bodyHtml: template.bodyHtml },
        payload,
      );
      subject = rendered.subject ?? subject;
      body = rendered.body;
      bodyHtml = rendered.bodyHtml ?? undefined;
    }

    // Pick a channel — default to EMAIL if recipient looks like an email,
    // SMS if it looks like a phone, otherwise IN_APP.
    const channel = this.detectChannel(payload.recipient);

    return this.send({
      tenantId,
      userId: payload.userId,
      customerId: payload.customerId,
      distributorId: payload.distributorId,
      type: channel,
      recipient: payload.recipient,
      subject,
      body,
      bodyHtml,
      metadata: { event: eventName, ...payload },
    });
  }

  // ---------------------------------------------------------------------
  // Inbox (current-user)
  // ---------------------------------------------------------------------

  async findAll(user: AuthUser, query: QueryNotificationsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: user.tenantId, userId: user.userId };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.isRead !== undefined) {
      const isRead = query.isRead === 'true';
      where.readAt = isRead ? { not: null } : null;
    }

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get a single notification. Marks it as read as a side effect (matches
   * the "open email → mark as read" UX of most inbox UIs).
   */
  async findOne(id: string, user: AuthUser) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.tenantId !== user.tenantId) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.userId && notification.userId !== user.userId) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.readAt) {
      await this.prisma.notification.update({
        where: { id },
        data: { readAt: new Date() },
      });
    }
    return notification;
  }

  async markAsRead(id: string, user: AuthUser) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.tenantId !== user.tenantId) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(user: AuthUser) {
    const result = await this.prisma.notification.updateMany({
      where: { tenantId: user.tenantId, userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, updated: result.count };
  }

  async delete(id: string, user: AuthUser) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.tenantId !== user.tenantId) {
      throw new NotFoundException('Notification not found');
    }
    await this.prisma.notification.delete({ where: { id } });
    return { success: true };
  }

  async getUnreadCount(user: AuthUser) {
    const count = await this.prisma.notification.count({
      where: { tenantId: user.tenantId, userId: user.userId, readAt: null },
    });
    return { count };
  }

  // ---------------------------------------------------------------------
  // Preferences
  // ---------------------------------------------------------------------

  async getPreferences(user: AuthUser) {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { tenantId: user.tenantId, userId: user.userId },
    });

    // Backfill defaults for any channel that doesn't have a row yet.
    const all: Record<string, any> = {};
    for (const channel of Object.keys(NotificationType)) {
      const existing = prefs.find((p) => p.channel === channel);
      all[channel] = existing ?? {
        channel,
        enabled: true,
        categories: {},
        quietHoursStart: null,
        quietHoursEnd: null,
      };
    }
    return all;
  }

  async updatePreferences(user: AuthUser, dto: UpdatePreferencesDto) {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId_channel: { userId: user.userId, channel: dto.channel as any },
      },
      update: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.categories !== undefined ? { categories: dto.categories } : {}),
        ...(dto.quietHoursStart !== undefined ? { quietHoursStart: dto.quietHoursStart } : {}),
        ...(dto.quietHoursEnd !== undefined ? { quietHoursEnd: dto.quietHoursEnd } : {}),
      },
      create: {
        tenantId: user.tenantId,
        userId: user.userId,
        channel: dto.channel as any,
        enabled: dto.enabled ?? true,
        categories: dto.categories ?? {},
        quietHoursStart: dto.quietHoursStart,
        quietHoursEnd: dto.quietHoursEnd,
      },
    });
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  /**
   * Resolve the right provider for the notification's channel.
   * Falls back to the noop provider when no real provider is bound.
   */
  private resolveProvider(channel: NotificationType): NotificationProvider {
    switch (channel) {
      case NotificationType.EMAIL:
        return this.emailProvider ?? this.defaultProvider ?? this.noopProvider;
      case NotificationType.SMS:
        return this.smsProvider ?? this.defaultProvider ?? this.noopProvider;
      case NotificationType.WHATSAPP:
        return this.whatsappProvider ?? this.defaultProvider ?? this.noopProvider;
      case NotificationType.PUSH:
        return this.pushProvider ?? this.defaultProvider ?? this.noopProvider;
      case NotificationType.IN_APP:
        return this.inAppProvider ?? this.defaultProvider ?? this.noopProvider;
      default:
        return this.noopProvider;
    }
  }

  /**
   * Attempt dispatch up to `maxRetries` times. Each failure is logged to
   * `notification_logs`. Returns the result of the final attempt.
   */
  private async dispatchWithRetries(
    dto: SendNotificationDto,
    notificationId: string,
    maxRetries: number,
  ): Promise<ProviderDispatchResult & { attempts: number }> {
    const provider = this.resolveProvider(dto.type);
    let lastResult: ProviderDispatchResult = { success: false };
    let attempts = 0;

    for (let i = 0; i < maxRetries; i++) {
      attempts++;
      try {
        lastResult = await provider.dispatch({ ...dto, notificationId } as any);
      } catch (err) {
        lastResult = {
          success: false,
          errorMessage: (err as Error).message,
        };
      }

      // Write a log row for every attempt.
      await this.writeLog({
        tenantId: dto.tenantId,
        notificationId,
        channel: dto.type as any,
        provider: provider.name,
        status: lastResult.success ? 'success' : 'failed',
        errorMessage: lastResult.errorMessage,
        response: lastResult.response,
        attempts,
      });

      if (lastResult.success) break;

      // Brief backoff between retries (100ms, 200ms, 400ms, ...).
      if (i < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 100 * Math.pow(2, i)));
      }
    }

    return { ...lastResult, attempts };
  }

  private async writeLog(input: {
    tenantId: string;
    notificationId: string;
    channel: any;
    provider?: string;
    status: string;
    errorMessage?: string;
    response?: Record<string, any>;
    attempts: number;
  }) {
    try {
      await this.prisma.notificationLog.create({
        data: {
          tenantId: input.tenantId,
          notificationId: input.notificationId,
          channel: input.channel,
          event: input.status === 'success' ? 'SENT' : 'FAILED',
          status: input.status,
          provider: input.provider,
          errorMessage: input.errorMessage,
          response: input.response ?? null,
          attempts: input.attempts,
          sentAt: input.status === 'success' ? new Date() : null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to write notification_log: ${(err as Error).message}`,
      );
    }
  }

  private detectChannel(recipient?: string): NotificationType {
    if (!recipient) return NotificationType.IN_APP;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) return NotificationType.EMAIL;
    if (/^\+?[1-9]\d{6,14}$/.test(recipient)) return NotificationType.SMS;
    return NotificationType.IN_APP;
  }

  private defaultSubjectFor(event: string): string {
    const map: Record<string, string> = {
      'order.created': 'Dayjoy Order Confirmation',
      'order.shipped': 'Dayjoy Order Shipped',
      'order.delivered': 'Dayjoy Order Delivered',
      'order.cancelled': 'Dayjoy Order Cancelled',
      'order.paid': 'Dayjoy Payment Received',
      'password.reset': 'Dayjoy Password Reset',
      'email.verification': 'Dayjoy Email Verification',
      'lead.created': 'New Lead Created',
      'ticket.resolved': 'Support Ticket Resolved',
    };
    return map[event] ?? 'Dayjoy Notification';
  }

  private defaultBodyFor(event: string): string {
    const map: Record<string, string> = {
      'order.created': 'Your order has been created successfully.',
      'order.shipped': 'Your order has been shipped.',
      'order.delivered': 'Your order has been delivered.',
      'order.cancelled': 'Your order has been cancelled.',
      'order.paid': "We've received your payment.",
      'password.reset': 'You requested a password reset.',
      'email.verification': 'Please verify your email address.',
      'lead.created': 'A new lead has been created.',
      'ticket.resolved': 'Your support ticket has been resolved.',
    };
    return map[event] ?? 'You have a new notification.';
  }
}
