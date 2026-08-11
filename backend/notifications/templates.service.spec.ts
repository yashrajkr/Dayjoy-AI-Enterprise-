import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { TemplatesService } from './templates.service';
import { PrismaService } from '../_shared/database/prisma.service';
import { createMockPrismaService } from '../_shared/testing/mock-prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { NotificationType } from './dto/send-notification.dto';

function createExtendedMockPrisma() {
  return {
    ...createMockPrismaService(),
    notificationTemplate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    notificationPreference: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
  };
}

const USER = { userId: 'u1', tenantId: 't1', email: 'a@b.c' };

describe('TemplatesService', () => {
  let service: TemplatesService;
  let prisma: ReturnType<typeof createExtendedMockPrisma>;

  beforeEach(async () => {
    prisma = createExtendedMockPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(TemplatesService);
  });

  describe('findAll', () => {
    it('returns all templates scoped to the tenant', async () => {
      prisma.notificationTemplate.findMany.mockResolvedValue([
        { id: 't1', code: 'order.created', name: 'Order Created' },
      ]);

      const result = await service.findAll(USER);

      expect(result).toHaveLength(1);
      expect(prisma.notificationTemplate.findMany.mock.calls[0][0].where.tenantId).toBe('t1');
    });
  });

  describe('findByCode', () => {
    it('returns the template matching the code (or null)', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue({ id: 't1', code: 'order.created' });

      const result = await service.findByCode('order.created', 't1');
      expect(result?.id).toBe('t1');
    });
  });

  describe('create', () => {
    it('creates a template + writes an audit log', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue(null); // no existing
      prisma.notificationTemplate.create.mockImplementation(async ({ data }: any) => ({
        id: 't1',
        ...data,
      }));
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const dto: CreateTemplateDto = {
        code: 'order.created',
        name: 'Order Created',
        type: NotificationType.EMAIL,
        subject: 'Your order {{orderNumber}}',
        body: 'Thanks for your order.',
      };

      const result = await service.create(USER, dto);

      expect(result.id).toBe('t1');
      expect(result.code).toBe('order.created');
      const call = prisma.notificationTemplate.create.mock.calls[0][0];
      expect(call.data.code).toBe('order.created');
      expect(call.data.isActive).toBe(true);
      expect(call.data.status).toBe('active');
    });

    it('rejects duplicate codes within the same tenant', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue({ id: 'existing' });

      const dto: CreateTemplateDto = {
        code: 'order.created',
        name: 'Order Created',
        type: NotificationType.EMAIL,
        body: 'b',
      };

      await expect(service.create(USER, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('updates the template + writes an audit log', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue({
        id: 't1',
        tenantId: 't1',
        name: 'Old',
        body: 'old body',
      });
      prisma.notificationTemplate.update.mockImplementation(async ({ data }: any) => ({
        id: 't1',
        tenantId: 't1',
        name: 'New',
        body: 'new body',
        ...data,
      }));
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const dto: UpdateTemplateDto = { name: 'New', body: 'new body' };
      const result = await service.update('t1', USER, dto);
      expect(result.name).toBe('New');
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws NotFoundException on cross-tenant access', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue({
        id: 't1',
        tenantId: 'other',
      });
      await expect(service.update('t1', USER, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes the template (isActive=false, status=archived)', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue({
        id: 't1',
        tenantId: 't1',
        code: 'order.created',
        name: 'Order Created',
      });
      prisma.notificationTemplate.update.mockResolvedValue({});
      prisma.auditLog.create.mockResolvedValue({});
      (prisma.$transaction as any).mockImplementation(async (cb: any) => cb(prisma));

      const result = await service.remove('t1', USER);
      expect(result.success).toBe(true);
      const call = prisma.notificationTemplate.update.mock.calls[0][0];
      expect(call.data.isActive).toBe(false);
      expect(call.data.status).toBe('archived');
    });
  });

  describe('render', () => {
    it('substitutes {{variable}} placeholders with values', () => {
      const result = service.render(
        {
          subject: 'Order {{orderNumber}} confirmed',
          body: 'Hi {{customerName}}, your order of {{total}} is on its way.',
          bodyHtml: '<p>Hi {{customerName}}</p>',
        },
        { orderNumber: 'ORD-123', customerName: 'Alice', total: 99.99 },
      );

      expect(result.subject).toBe('Order ORD-123 confirmed');
      expect(result.body).toContain('Hi Alice');
      expect(result.body).toContain('99.99');
      expect(result.bodyHtml).toBe('<p>Hi Alice</p>');
    });

    it('leaves unknown placeholders in place', () => {
      const result = service.render(
        { subject: null, body: 'Hello {{unknownVar}}', bodyHtml: null },
        {},
      );
      expect(result.body).toBe('Hello {{unknownVar}}');
    });
  });
});
