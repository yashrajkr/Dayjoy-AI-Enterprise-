import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  NotificationsService,
} from './notifications.service';
import { TemplatesService } from './templates.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import {
  SendNotificationDto,
  NotificationType,
  NotificationPriority,
} from './dto/send-notification.dto';
import {
  NotificationProvider,
  ProviderDispatchResult,
} from './providers/notification.provider.interface';
import {
  NOTIFICATION_PROVIDER_EMAIL,
  NOTIFICATION_PROVIDER_SMS,
  NOTIFICATION_PROVIDER_DEFAULT,
} from './providers/tokens';

function createExtendedMockPrisma() {
  return {
    ...createMockPrismaService(),
    notificationPreference: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
    notificationTemplate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  };
}

const USER = { userId: 'u1', tenantId: 't1', email: 'a@b.c' };

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: ReturnType<typeof createExtendedMockPrisma>;
  let templatesService: { findByCode: ReturnType<typeof vi.fn> };
  let emailProvider: { dispatch: ReturnType<typeof vi.fn<[], Promise<ProviderDispatchResult>>> };

  beforeEach(async () => {
    prisma = createExtendedMockPrisma();
    templatesService = {
      findByCode: vi.fn().mockResolvedValue(null), // no template by default
    };
    emailProvider = {
      dispatch: vi.fn().mockResolvedValue({ success: true, providerMessageId: 'pmsg-1' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TemplatesService, useValue: templatesService },
        { provide: NOTIFICATION_PROVIDER_EMAIL, useValue: emailProvider as unknown as NotificationProvider },
        { provide: NOTIFICATION_PROVIDER_SMS, useValue: { dispatch: vi.fn().mockResolvedValue({ success: true }) } as unknown as NotificationProvider },
        { provide: NOTIFICATION_PROVIDER_DEFAULT, useValue: { dispatch: vi.fn().mockResolvedValue({ success: true }) } as unknown as NotificationProvider },
      ],
    }).compile();

    service = moduleRef.get(NotificationsService);
  });

  // ---------------------------------------------------------------------
  // send()
  // ---------------------------------------------------------------------
  describe('send', () => {
    it('persists the notification, dispatches via the channel-appropriate provider, and marks SENT', async () => {
      prisma.notification.create.mockImplementation(async ({ data }: any) => ({
        id: 'n-1',
        ...data,
      }));
      prisma.notification.update.mockResolvedValue({});
      prisma.notificationLog.create.mockResolvedValue({});

      const dto: SendNotificationDto = {
        tenantId: 't1',
        type: NotificationType.EMAIL,
        recipient: 'user@example.com',
        subject: 'Welcome',
        body: 'Welcome to Dayjoy!',
        metadata: { source: 'test' },
      };

      const result = await service.send(dto);

      // 1. EMAIL provider was invoked (not SMS, not default).
      expect(emailProvider.dispatch).toHaveBeenCalledOnce();

      // 2. Notification row persisted as PENDING.
      const createCall = prisma.notification.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('PENDING');
      expect(createCall.data.type).toBe('EMAIL');
      expect(createCall.data.subject).toBe('Welcome');
      expect(createCall.data.content).toBe('Welcome to Dayjoy!');

      // 3. Updated to SENT.
      const updateCall = prisma.notification.update.mock.calls[0][0];
      expect(updateCall.where.id).toBe('n-1');
      expect(updateCall.data.status).toBe('SENT');
      expect(updateCall.data.sentAt).toBeInstanceOf(Date);

      // 4. NotificationLog row written.
      const logCall = prisma.notificationLog.create.mock.calls[0][0];
      expect(logCall.data.notificationId).toBe('n-1');
      expect(logCall.data.status).toBe('success');

      // 5. Return shape.
      expect(result.success).toBe(true);
      expect(result.notificationId).toBe('n-1');
      expect(result.providerMessageId).toBe('pmsg-1');
    });

    it('marks the notification as FAILED when the provider rejects', async () => {
      prisma.notification.create.mockImplementation(async ({ data }: any) => ({
        id: 'n-2',
        ...data,
      }));
      prisma.notification.update.mockResolvedValue({});
      prisma.notificationLog.create.mockResolvedValue({});

      emailProvider.dispatch.mockResolvedValue({
        success: false,
        errorMessage: 'SMTP 5.1.1 mailbox does not exist',
      });

      const dto: SendNotificationDto = {
        tenantId: 't1',
        type: NotificationType.EMAIL,
        recipient: 'bounced@example.com',
        subject: 'Hello',
        body: 'Test',
      };

      const result = await service.send(dto);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('mailbox does not exist');

      const updateCall = prisma.notification.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('FAILED');
      expect(updateCall.data.sentAt).toBeNull();
    });

    it('retries up to maxRetries times before marking FAILED', async () => {
      prisma.notification.create.mockImplementation(async ({ data }: any) => ({
        id: 'n-3',
        ...data,
      }));
      prisma.notification.update.mockResolvedValue({});
      prisma.notificationLog.create.mockResolvedValue({});

      emailProvider.dispatch
        .mockResolvedValueOnce({ success: false, errorMessage: 'timeout 1' })
        .mockResolvedValueOnce({ success: false, errorMessage: 'timeout 2' })
        .mockResolvedValueOnce({ success: true, providerMessageId: 'pmsg-3' });

      const dto: SendNotificationDto = {
        tenantId: 't1',
        type: NotificationType.EMAIL,
        recipient: 'user@example.com',
        subject: 'Retry test',
        body: 'b',
        metadata: { maxRetries: 3 },
      };

      const result = await service.send(dto);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
      expect(emailProvider.dispatch).toHaveBeenCalledTimes(3);
    });

    it('falls back to the noop provider when no channel-specific provider is bound', async () => {
      // Re-instantiate the service with NO providers bound — should fall back
      // to the always-succeeds NoopNotificationProvider.
      prisma = createExtendedMockPrisma();
      prisma.notification.create.mockImplementation(async ({ data }: any) => ({
        id: 'n-noop',
        ...data,
      }));
      prisma.notification.update.mockResolvedValue({});
      prisma.notificationLog.create.mockResolvedValue({});

      const moduleRef = await Test.createTestingModule({
        providers: [
          NotificationsService,
          { provide: PrismaService, useValue: prisma },
          { provide: TemplatesService, useValue: templatesService },
        ],
      }).compile();
      service = moduleRef.get(NotificationsService);

      const dto: SendNotificationDto = {
        tenantId: 't1',
        type: NotificationType.PUSH,
        recipient: 'device-token-xyz',
        subject: 'Push',
        body: 'b',
      };

      const result = await service.send(dto);
      expect(result.success).toBe(true);
      expect(result.providerMessageId).toMatch(/^noop-/);
    });
  });

  // ---------------------------------------------------------------------
  // sendBatch()
  // ---------------------------------------------------------------------
  describe('sendBatch', () => {
    it('sends each notification independently — one failure does not block the rest', async () => {
      prisma.notification.create.mockImplementation(async ({ data }: any) => ({
        id: data.subject,
        ...data,
      }));
      prisma.notification.update.mockResolvedValue({});
      prisma.notificationLog.create.mockResolvedValue({});

      emailProvider.dispatch
        .mockResolvedValueOnce({ success: false, errorMessage: 'fail' })
        .mockResolvedValueOnce({ success: true, providerMessageId: 'ok' });

      const dtos: SendNotificationDto[] = [
        {
          tenantId: 't1',
          type: NotificationType.EMAIL,
          recipient: 'a@b.com',
          subject: 'first',
          body: 'b',
        },
        {
          tenantId: 't1',
          type: NotificationType.EMAIL,
          recipient: 'c@d.com',
          subject: 'second',
          body: 'b',
        },
      ];

      const results = await service.sendBatch(dtos);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // handleEvent()
  // ---------------------------------------------------------------------
  describe('handleEvent', () => {
    beforeEach(() => {
      prisma.notification.create.mockImplementation(async ({ data }: any) => ({
        id: 'n-1',
        ...data,
      }));
      prisma.notification.update.mockResolvedValue({});
      prisma.notificationLog.create.mockResolvedValue({});
    });

    it('maps an order.created event to an email notification (when recipient is an email)', async () => {
      const result = await service.handleEvent({
        event: 'order.created',
        payload: {
          tenantId: 't1',
          customerId: 'c1',
          recipient: 'buyer@example.com',
          orderNumber: 'ORD-1',
          total: 100,
        },
      });

      expect(result.success).toBe(true);
      expect(emailProvider.dispatch).toHaveBeenCalledOnce();
      const dispatchedDto = emailProvider.dispatch.mock.calls[0][0] as SendNotificationDto;
      expect(dispatchedDto.type).toBe(NotificationType.EMAIL);
      expect(dispatchedDto.recipient).toBe('buyer@example.com');
      expect(dispatchedDto.subject).toBe('Dayjoy Order Confirmation');
    });

    it('uses a template (when one is configured for the event code) and renders it', async () => {
      templatesService.findByCode.mockResolvedValue({
        isActive: true,
        type: 'EMAIL',
        subject: 'Your order {{orderNumber}} is confirmed',
        body: 'Thanks for your order of {{total}} {{currency}}.',
        bodyHtml: null,
      });

      await service.handleEvent({
        event: 'order.created',
        payload: {
          tenantId: 't1',
          recipient: 'buyer@example.com',
          orderNumber: 'ORD-123',
          total: 99.99,
          currency: 'USD',
        },
      });

      const dispatchedDto = emailProvider.dispatch.mock.calls[0][0] as SendNotificationDto;
      expect(dispatchedDto.subject).toBe('Your order ORD-123 is confirmed');
      expect(dispatchedDto.body).toContain('99.99');
      expect(dispatchedDto.body).toContain('USD');
    });

    it('returns success:false when tenantId is missing from the payload', async () => {
      const result = await service.handleEvent({
        event: 'order.created',
        payload: { recipient: 'buyer@example.com' },
      });

      expect(result.success).toBe(false);
      expect(emailProvider.dispatch).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // Inbox (current-user)
  // ---------------------------------------------------------------------
  describe('findAll (inbox)', () => {
    it('returns paginated notifications scoped to the current user', async () => {
      prisma.notification.findMany.mockResolvedValue([
        { id: 'n1', userId: 'u1', type: 'EMAIL', status: 'SENT' },
      ]);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.findAll(USER, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      const where = prisma.notification.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('t1');
      expect(where.userId).toBe('u1');
    });
  });

  describe('findOne', () => {
    it('returns the notification and marks it as read (side effect)', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n1',
        tenantId: 't1',
        userId: 'u1',
        readAt: null,
      });
      prisma.notification.update.mockResolvedValue({});

      const result = await service.findOne('n1', USER);
      expect(result.id).toBe('n1');
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { readAt: expect.any(Date) },
      });
    });

    it('throws NotFoundException on cross-tenant access', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n1',
        tenantId: 'other',
        userId: 'u1',
      });
      await expect(service.findOne('n1', USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('markAllAsRead', () => {
    it('updates all unread notifications for the user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead(USER);

      expect(result.updated).toBe(5);
      const call = prisma.notification.updateMany.mock.calls[0][0];
      expect(call.where.userId).toBe('u1');
      expect(call.where.readAt).toBeNull();
    });
  });

  describe('getUnreadCount', () => {
    it('returns the count of unread notifications for the user', async () => {
      prisma.notification.count.mockResolvedValue(3);

      const result = await service.getUnreadCount(USER);
      expect(result.count).toBe(3);
    });
  });

  // ---------------------------------------------------------------------
  // Preferences
  // ---------------------------------------------------------------------
  describe('getPreferences', () => {
    it('returns preferences for all channels with defaults for missing rows', async () => {
      prisma.notificationPreference.findMany.mockResolvedValue([
        { channel: 'EMAIL', enabled: false, categories: { promotions: false } },
      ]);

      const result = await service.getPreferences(USER);

      // All 5 channels present, with EMAIL overridden.
      expect(Object.keys(result)).toHaveLength(5);
      expect(result.EMAIL.enabled).toBe(false);
      expect(result.SMS.enabled).toBe(true); // default
    });
  });

  describe('updatePreferences', () => {
    it('upserts the preference row for the channel', async () => {
      prisma.notificationPreference.upsert.mockResolvedValue({
        channel: 'EMAIL',
        enabled: false,
      });

      await service.updatePreferences(USER, {
        channel: NotificationType.EMAIL,
        enabled: false,
        categories: { promotions: false },
      });

      const call = prisma.notificationPreference.upsert.mock.calls[0][0];
      expect(call.where.userId_channel.userId).toBe('u1');
      expect(call.where.userId_channel.channel).toBe('EMAIL');
      expect(call.update.enabled).toBe(false);
    });
  });
});
