/**
 * Integration test — Notification flow.
 *
 * Exercises the full notification dispatch flow against a real test DB
 * (with all 5 channel providers mocked):
 *
 *  1. Queue notification → dispatch to provider → track delivery →
 *     mark read.
 *  2. Multi-channel (EMAIL, SMS, WHATSAPP, PUSH, IN_APP).
 *  3. User preferences are respected (opt-out skips the channel).
 *
 * Requires `DATABASE_URL` pointing at a writable test DB.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';

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

import { testTenant } from '@testing/helpers/fixtures';

const HAS_TEST_DB =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.includes('_test');
const describeOrSkip = HAS_TEST_DB ? describe : describe.skip;

describeOrSkip('Notification flow (integration)', () => {
  let service: NotificationsService;
  let templates: TemplatesService;
  let prisma: any;
  let providers: Record<string, { dispatch: jest.Mock; name: string; channel: string }>;

  const authUser = {
    userId: 'user-notif-1',
    tenantId: testTenant.id,
    email: 'notif@dayjoy.test',
    jti: 'jti-notif',
  };

  beforeAll(async () => {
    const { PrismaService: Prisma } = await import('@backend/_shared/database/prisma.service');
    prisma = new Prisma();
    await prisma.$connect();

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

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        TemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: NOTIFICATION_PROVIDER_EMAIL, useValue: providers[NOTIFICATION_PROVIDER_EMAIL] },
        { provide: NOTIFICATION_PROVIDER_SMS, useValue: providers[NOTIFICATION_PROVIDER_SMS] },
        { provide: NOTIFICATION_PROVIDER_WHATSAPP, useValue: providers[NOTIFICATION_PROVIDER_WHATSAPP] },
        { provide: NOTIFICATION_PROVIDER_PUSH, useValue: providers[NOTIFICATION_PROVIDER_PUSH] },
        { provide: NOTIFICATION_PROVIDER_IN_APP, useValue: providers[NOTIFICATION_PROVIDER_IN_APP] },
        { provide: NOTIFICATION_PROVIDER_DEFAULT, useValue: providers[NOTIFICATION_PROVIDER_DEFAULT] },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
    templates = moduleRef.get(TemplatesService);
  });

  beforeEach(async () => {
    await prisma.notificationLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.notificationTemplate.deleteMany();

    Object.values(providers).forEach((p) => p.dispatch.mockClear());
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('queues a notification, dispatches to the matching provider, and tracks the delivery log', async () => {
    const notif = await service.send({
      userId: authUser.userId,
      type: 'ORDER_UPDATE',
      channel: 'EMAIL',
      title: 'Order shipped',
      body: 'Your order has shipped',
      data: { orderId: 'order-1' },
    } as any);

    expect(notif.id).toBeDefined();
    expect(providers[NOTIFICATION_PROVIDER_EMAIL].dispatch).toHaveBeenCalledOnce();

    // Delivery log persisted.
    const logs = await prisma.notificationLog.findMany({
      where: { notificationId: notif.id },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].status).toBe('sent');
  });

  it('dispatches to all 5 channels independently', async () => {
    for (const channel of ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP']) {
      await service.send({
        userId: authUser.userId,
        type: 'SYSTEM',
        channel,
        title: 'test',
        body: 'test',
      } as any);
    }

    expect(providers[NOTIFICATION_PROVIDER_EMAIL].dispatch).toHaveBeenCalledTimes(1);
    expect(providers[NOTIFICATION_PROVIDER_SMS].dispatch).toHaveBeenCalledTimes(1);
    expect(providers[NOTIFICATION_PROVIDER_WHATSAPP].dispatch).toHaveBeenCalledTimes(1);
    expect(providers[NOTIFICATION_PROVIDER_PUSH].dispatch).toHaveBeenCalledTimes(1);
    expect(providers[NOTIFICATION_PROVIDER_IN_APP].dispatch).toHaveBeenCalledTimes(1);
  });

  it('respects user preferences — skips the channel when disabled', async () => {
    await prisma.notificationPreference.create({
      data: {
        tenantId: testTenant.id,
        userId: authUser.userId,
        emailEnabled: false,
        smsEnabled: true,
        whatsappEnabled: false,
        pushEnabled: true,
      },
    });

    await service.send({
      userId: authUser.userId,
      type: 'T',
      channel: 'EMAIL',
      title: 'x',
      body: 'x',
    } as any);

    expect(providers[NOTIFICATION_PROVIDER_EMAIL].dispatch).not.toHaveBeenCalled();

    await service.send({
      userId: authUser.userId,
      type: 'T',
      channel: 'SMS',
      title: 'x',
      body: 'x',
    } as any);

    expect(providers[NOTIFICATION_PROVIDER_SMS].dispatch).toHaveBeenCalled();
  });

  it('marks a notification read and stamps readAt', async () => {
    const notif = await service.send({
      userId: authUser.userId,
      type: 'T',
      channel: 'IN_APP',
      title: 'x',
      body: 'x',
    } as any);

    await service.markAsRead(notif.id, authUser);

    const fetched = await prisma.notification.findUnique({
      where: { id: notif.id },
    });
    expect(fetched.status).toBe('read');
    expect(fetched.readAt).toBeInstanceOf(Date);
  });

  it('marks all unread notifications read in a single UPDATE', async () => {
    for (let i = 0; i < 5; i++) {
      await service.send({
        userId: authUser.userId,
        type: 'T',
        channel: 'IN_APP',
        title: `n${i}`,
        body: 'x',
      } as any);
    }

    const result = await service.markAllAsRead(authUser);
    expect(result.count).toBe(5);

    const unread = await prisma.notification.count({
      where: { userId: authUser.userId, status: 'unread' },
    });
    expect(unread).toBe(0);
  });

  it('renders templates by code with variable substitution', async () => {
    await templates.create(authUser, {
      code: 'order_confirmation',
      name: 'Order Confirmation',
      channel: 'EMAIL',
      subject: 'Your order {{orderNumber}} is confirmed',
      body: 'Hi {{firstName}}, your order totaling {{total}} is confirmed.',
      variables: ['orderNumber', 'firstName', 'total'],
    } as any);

    const notif = await service.send({
      userId: authUser.userId,
      type: 'ORDER_UPDATE',
      channel: 'EMAIL',
      templateCode: 'order_confirmation',
      data: { orderNumber: 'DJ-2025-000001', firstName: 'Cory', total: 49.99 },
    } as any);

    const fetched = await prisma.notification.findUnique({
      where: { id: notif.id },
    });
    expect(fetched.subject).toContain('DJ-2025-000001');
    expect(fetched.body).toContain('Cory');
    expect(fetched.body).toContain('49.99');
  });
});
