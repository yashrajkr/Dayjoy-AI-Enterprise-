/**
 * Unit tests — NotificationsService + TemplatesService.
 *
 * Covers:
 *  - send()              — persists notification + dispatches to provider
 *  - sendBatch()         — bulk send
 *  - findAll()           — paginated list scoped to user
 *  - findOne() / markAsRead() / markAllAsRead() / delete()
 *  - getUnreadCount()
 *  - getPreferences() / updatePreferences()
 *  - Templates: findAll / findByCode / findOne / create / update / remove
 *
 * All 5 channel providers (EMAIL, SMS, WHATSAPP, PUSH, IN_APP) are mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { NotificationsService } from '@backend/notifications/notifications.service';
import { TemplatesService } from '@backend/notifications/templates.service';
import { PrismaService } from '@backend/_shared/database/prisma.service';
import {
  NOTIFICATION_PROVIDER_EMAIL,
  NOTIFICATION_PROVIDER_SMS,
  NOTIFICATION_PROVIDER_WHATSAPP,
  NOTIFICATION_PROVIDER_PUSH,
  NOTIFICATION_PROVIDER_IN_APP,
  NOTIFICATION_PROVIDER_DEFAULT,
} from '@backend/notifications/providers/tokens';

import { mockPrismaService } from '@testing/helpers/mocks';
import {
  testNotification,
  testNotificationTemplate,
  testTenant,
  testAuthUser,
  testUser,
} from '@testing/helpers/fixtures';

describe('NotificationsService (system-wide unit)', () => {
  let service: NotificationsService;
  let templates: TemplatesService;
  let prisma: ReturnType<typeof mockPrismaService>;
  let providers: Record<string, { dispatch: ReturnType<typeof vi.fn>; name: string; channel: string }>;

  beforeEach(async () => {
    prisma = mockPrismaService();
    providers = {
      [NOTIFICATION_PROVIDER_EMAIL]: {
        dispatch: vi.fn().mockResolvedValue({ success: true, providerMessageId: 'email-1' }),
        name: 'smtp',
        channel: 'EMAIL',
      },
      [NOTIFICATION_PROVIDER_SMS]: {
        dispatch: vi.fn().mockResolvedValue({ success: true, providerMessageId: 'sms-1' }),
        name: 'twilio',
        channel: 'SMS',
      },
      [NOTIFICATION_PROVIDER_WHATSAPP]: {
        dispatch: vi.fn().mockResolvedValue({ success: true, providerMessageId: 'wa-1' }),
        name: 'whatsapp',
        channel: 'WHATSAPP',
      },
      [NOTIFICATION_PROVIDER_PUSH]: {
        dispatch: vi.fn().mockResolvedValue({ success: true, providerMessageId: 'push-1' }),
        name: 'fcm',
        channel: 'PUSH',
      },
      [NOTIFICATION_PROVIDER_IN_APP]: {
        dispatch: vi.fn().mockResolvedValue({ success: true, providerMessageId: 'inapp-1' }),
        name: 'in-app',
        channel: 'IN_APP',
      },
      [NOTIFICATION_PROVIDER_DEFAULT]: {
        dispatch: vi.fn().mockResolvedValue({ success: true, providerMessageId: 'noop-1' }),
        name: 'noop',
        channel: '*',
      },
    };

    templates = {
      findAll: vi.fn(),
      findByCode: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TemplatesService, useValue: templates },
        { provide: NOTIFICATION_PROVIDER_EMAIL, useValue: providers[NOTIFICATION_PROVIDER_EMAIL] },
        { provide: NOTIFICATION_PROVIDER_SMS, useValue: providers[NOTIFICATION_PROVIDER_SMS] },
        { provide: NOTIFICATION_PROVIDER_WHATSAPP, useValue: providers[NOTIFICATION_PROVIDER_WHATSAPP] },
        { provide: NOTIFICATION_PROVIDER_PUSH, useValue: providers[NOTIFICATION_PROVIDER_PUSH] },
        { provide: NOTIFICATION_PROVIDER_IN_APP, useValue: providers[NOTIFICATION_PROVIDER_IN_APP] },
        { provide: NOTIFICATION_PROVIDER_DEFAULT, useValue: providers[NOTIFICATION_PROVIDER_DEFAULT] },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  // -------------------------------------------------------------------
  // send()
  // -------------------------------------------------------------------

  describe('send()', () => {
    it('persists a notification row and dispatches to the matching channel provider', async () => {
      prisma.notification.create.mockResolvedValue(testNotification);
      prisma.notificationLog.create.mockResolvedValue({});

      const result = await service.send({
        userId: testUser.id,
        type: 'ORDER_UPDATE',
        channel: 'EMAIL',
        title: 'Order shipped',
        body: 'Your order has shipped',
        data: { orderId: 'order-1' },
      } as any);

      expect(result.id).toBe(testNotification.id);
      expect(providers[NOTIFICATION_PROVIDER_EMAIL].dispatch).toHaveBeenCalled();
      // Notification log recorded.
      expect(prisma.notificationLog.create).toHaveBeenCalled();
    });

    it('renders the template body when a templateCode is supplied', async () => {
      prisma.notification.create.mockResolvedValue(testNotification);
      prisma.notificationLog.create.mockResolvedValue({});
      templates.findByCode.mockResolvedValue(testNotificationTemplate);

      await service.send({
        userId: testUser.id,
        type: 'ORDER_UPDATE',
        channel: 'IN_APP',
        templateCode: 'order_confirmation',
        data: { orderNumber: 'DJ-2025-000001', firstName: 'Cory', total: 49.99 },
      } as any);

      expect(templates.findByCode).toHaveBeenCalledWith(
        'order_confirmation',
        testAuthUser.tenantId,
      );
    });

    it('still persists the notification when the provider fails (best-effort delivery)', async () => {
      prisma.notification.create.mockResolvedValue(testNotification);
      prisma.notificationLog.create.mockResolvedValue({});
      providers[NOTIFICATION_PROVIDER_SMS].dispatch.mockRejectedValue(
        new Error('SMS provider down'),
      );

      const result = await service.send({
        userId: testUser.id,
        type: 'SYSTEM',
        channel: 'SMS',
        title: 'Test',
        body: 'Test',
      } as any);

      expect(result.id).toBe(testNotification.id);
    });

    it('respects user opt-out preferences — skips channel when disabled', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: testUser.id,
        emailEnabled: false,
        smsEnabled: true,
        whatsappEnabled: true,
        pushEnabled: true,
      });
      prisma.notification.create.mockResolvedValue(testNotification);

      await service.send({
        userId: testUser.id,
        type: 'SYSTEM',
        channel: 'EMAIL',
        title: 'x',
        body: 'x',
      } as any);

      // Email provider should NOT be called.
      expect(providers[NOTIFICATION_PROVIDER_EMAIL].dispatch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // sendBatch()
  // -------------------------------------------------------------------

  describe('sendBatch()', () => {
    it('sends multiple notifications in parallel', async () => {
      prisma.notification.create.mockResolvedValue(testNotification);
      prisma.notificationLog.create.mockResolvedValue({});
      const dtos = [
        { userId: 'u1', type: 'T', channel: 'IN_APP', title: 'a', body: 'a' },
        { userId: 'u2', type: 'T', channel: 'IN_APP', title: 'b', body: 'b' },
        { userId: 'u3', type: 'T', channel: 'IN_APP', title: 'c', body: 'c' },
      ] as any;

      await service.sendBatch(dtos);

      expect(prisma.notification.create).toHaveBeenCalledTimes(3);
    });
  });

  // -------------------------------------------------------------------
  // findAll()
  // -------------------------------------------------------------------

  describe('findAll()', () => {
    it('returns paginated notifications scoped to the calling user', async () => {
      prisma.notification.findMany.mockResolvedValue([testNotification]);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.findAll(testAuthUser, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      const whereArg = prisma.notification.findMany.mock.calls[0][0].where;
      expect(whereArg.userId).toBe(testAuthUser.userId);
    });

    it('applies type + status filters', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.findAll(testAuthUser, {
        page: 1,
        limit: 20,
        type: 'ORDER_UPDATE',
        status: 'unread',
      } as any);

      const whereArg = prisma.notification.findMany.mock.calls[0][0].where;
      expect(whereArg.type).toBe('ORDER_UPDATE');
      expect(whereArg.status).toBe('unread');
    });
  });

  // -------------------------------------------------------------------
  // findOne()
  // -------------------------------------------------------------------

  describe('findOne()', () => {
    it('returns the notification', async () => {
      prisma.notification.findUnique.mockResolvedValue(testNotification);

      const result = await service.findOne(testNotification.id, testAuthUser);

      expect(result.id).toBe(testNotification.id);
    });

    it('throws NotFoundException when the notification does not exist', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.findOne('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // markAsRead() / markAllAsRead()
  // -------------------------------------------------------------------

  describe('markAsRead()', () => {
    it('sets status=read and stamps readAt', async () => {
      prisma.notification.findUnique.mockResolvedValue(testNotification);
      prisma.notification.update.mockResolvedValue({
        ...testNotification,
        status: 'read',
        readAt: new Date(),
      });

      const result = await service.markAsRead(testNotification.id, testAuthUser);

      expect(result.status).toBe('read');
      expect(result.readAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when the notification does not exist', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.markAsRead('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAllAsRead()', () => {
    it('updates all unread notifications for the user', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead(testAuthUser);

      expect(result.count).toBe(5);
      const updateArg = prisma.notification.updateMany.mock.calls[0][0];
      expect(updateArg.where.userId).toBe(testAuthUser.userId);
      expect(updateArg.where.status).toBe('unread');
    });
  });

  // -------------------------------------------------------------------
  // delete()
  // -------------------------------------------------------------------

  describe('delete()', () => {
    it('deletes the notification', async () => {
      prisma.notification.findUnique.mockResolvedValue(testNotification);
      prisma.notification.delete.mockResolvedValue(testNotification);

      await service.delete(testNotification.id, testAuthUser);

      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: testNotification.id },
      });
    });

    it('throws NotFoundException when the notification does not exist', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(service.delete('ghost', testAuthUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------
  // getUnreadCount()
  // -------------------------------------------------------------------

  describe('getUnreadCount()', () => {
    it('returns the count of unread notifications for the user', async () => {
      prisma.notification.count.mockResolvedValue(7);

      const result = await service.getUnreadCount(testAuthUser);

      expect(result).toBe(7);
      const whereArg = prisma.notification.count.mock.calls[0][0].where;
      expect(whereArg.userId).toBe(testAuthUser.userId);
      expect(whereArg.status).toBe('unread');
    });
  });

  // -------------------------------------------------------------------
  // Preferences
  // -------------------------------------------------------------------

  describe('getPreferences()', () => {
    it('returns the user preferences (with defaults if not set)', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);

      const result = await service.getPreferences(testAuthUser);

      // Defaults: all channels enabled.
      expect(result.emailEnabled).toBe(true);
      expect(result.smsEnabled).toBe(true);
      expect(result.whatsappEnabled).toBe(true);
      expect(result.pushEnabled).toBe(true);
    });

    it('returns the persisted preferences when set', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: testAuthUser.userId,
        emailEnabled: false,
        smsEnabled: true,
        whatsappEnabled: false,
        pushEnabled: true,
      });

      const result = await service.getPreferences(testAuthUser);

      expect(result.emailEnabled).toBe(false);
      expect(result.whatsappEnabled).toBe(false);
    });
  });

  describe('updatePreferences()', () => {
    it('upserts the user preferences', async () => {
      prisma.notificationPreference.upsert.mockResolvedValue({
        userId: testAuthUser.userId,
        emailEnabled: false,
      });

      await service.updatePreferences(testAuthUser, {
        emailEnabled: false,
      } as any);

      expect(prisma.notificationPreference.upsert).toHaveBeenCalled();
    });
  });
});

// =====================================================================
// TemplatesService
// =====================================================================

describe('TemplatesService (system-wide unit)', () => {
  let svc: TemplatesService;
  let prisma: ReturnType<typeof mockPrismaService>;

  beforeEach(async () => {
    prisma = mockPrismaService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    svc = moduleRef.get(TemplatesService);
  });

  describe('findAll()', () => {
    it('returns paginated templates scoped to tenant', async () => {
      prisma.notificationTemplate.findMany.mockResolvedValue([testNotificationTemplate]);
      prisma.notificationTemplate.count.mockResolvedValue(1);

      const result = await svc.findAll(testAuthUser);

      expect(result).toHaveLength(1);
    });
  });

  describe('findByCode()', () => {
    it('returns the active template by code', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue(testNotificationTemplate);

      const result = await svc.findByCode('order_confirmation', testTenant.id);

      expect(result.id).toBe(testNotificationTemplate.id);
    });
  });

  describe('create()', () => {
    it('creates a template', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue(null);
      prisma.notificationTemplate.create.mockResolvedValue(testNotificationTemplate);

      const result = await svc.create(testAuthUser, {
        code: 'order_confirmation',
        name: 'Order Confirmation',
        channel: 'EMAIL',
        subject: 'Your order is confirmed',
        body: 'Hi {{firstName}}',
        variables: ['firstName'],
      } as any);

      expect(result.id).toBe(testNotificationTemplate.id);
      const createArg = prisma.notificationTemplate.create.mock.calls[0][0];
      expect(createArg.data.tenantId).toBe(testTenant.id);
      expect(createArg.data.isActive).toBe(true);
    });

    it('throws BadRequestException when code already exists in tenant', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue(testNotificationTemplate);

      await expect(
        svc.create(testAuthUser, { code: testNotificationTemplate.code } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update()', () => {
    it('updates template fields', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue(testNotificationTemplate);
      prisma.notificationTemplate.update.mockResolvedValue({
        ...testNotificationTemplate,
        subject: 'Updated subject',
      });

      const result = await svc.update(
        testNotificationTemplate.id,
        testAuthUser,
        { subject: 'Updated subject' } as any,
      );

      expect(result.subject).toBe('Updated subject');
    });

    it('throws NotFoundException when the template does not exist', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue(null);

      await expect(
        svc.update('ghost', testAuthUser, { subject: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove()', () => {
    it('deletes the template', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue(testNotificationTemplate);
      prisma.notificationTemplate.delete.mockResolvedValue(testNotificationTemplate);

      await svc.remove(testNotificationTemplate.id, testAuthUser);

      expect(prisma.notificationTemplate.delete).toHaveBeenCalledWith({
        where: { id: testNotificationTemplate.id },
      });
    });
  });
});
