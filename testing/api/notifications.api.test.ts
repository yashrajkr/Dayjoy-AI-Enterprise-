/**
 * API tests — /api/notifications endpoints.
 *
 * Endpoints:
 *  - Notifications: GET / GET:id / PATCH:id/read / DELETE:id
 *  - Bulk: GET /unread-count / POST /mark-all-read
 *  - Preferences: GET /preferences / PUT /preferences
 *  - Templates: GET / GET:id / POST / PUT:id / DELETE:id
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';

import { NotificationsController } from '@backend/notifications/notifications.controller';
import { NotificationsService } from '@backend/notifications/notifications.service';
import { TemplatesService } from '@backend/notifications/templates.service';
import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@backend/_shared/security/permissions.guard';
import { Reflector } from '@nestjs/core';

import {
  testNotification,
  testNotificationTemplate,
  testAuthUser,
} from '@testing/helpers/fixtures';

describe('Notifications API (/api/notifications)', () => {
  let app: INestApplication;
  let notifSvc: any;
  let templatesSvc: any;

  beforeAll(async () => {
    notifSvc = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      delete: vi.fn(),
      getUnreadCount: vi.fn(),
      getPreferences: vi.fn(),
      updatePreferences: vi.fn(),
    };
    templatesSvc = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: notifSvc },
        { provide: TemplatesService, useValue: templatesSvc },
        { provide: Reflector, useValue: new Reflector() },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (ctx: any) => {
        ctx.switchToHttp().getRequest().user = testAuthUser;
        return true;
      } })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -----------------------------------------------------------------
  // Notifications
  // -----------------------------------------------------------------

  describe('Notifications', () => {
    it('GET /api/notifications returns 200 + paginated', async () => {
      notifSvc.findAll.mockResolvedValue({
        data: [testNotification],
        total: 1,
        page: 1,
        limit: 20,
      });

      const res = await request(app.getHttpServer()).get('/api/notifications');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('GET /api/notifications/:id returns 200 + the notification', async () => {
      notifSvc.findOne.mockResolvedValue(testNotification);

      const res = await request(app.getHttpServer())
        .get(`/api/notifications/${testNotification.id}`);

      expect(res.status).toBe(200);
    });

    it('PATCH /api/notifications/:id/read returns 200 + read notification', async () => {
      notifSvc.markAsRead.mockResolvedValue({
        ...testNotification,
        status: 'read',
        readAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/notifications/${testNotification.id}/read`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('read');
    });

    it('DELETE /api/notifications/:id returns 200', async () => {
      notifSvc.delete.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/api/notifications/${testNotification.id}`);

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------
  // Bulk
  // -----------------------------------------------------------------

  describe('Bulk', () => {
    it('GET /api/notifications/unread-count returns 200 + count', async () => {
      notifSvc.getUnreadCount.mockResolvedValue(7);

      const res = await request(app.getHttpServer()).get('/api/notifications/unread-count');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(7);
    });

    it('POST /api/notifications/mark-all-read returns 200 + count', async () => {
      notifSvc.markAllAsRead.mockResolvedValue({ count: 5 });

      const res = await request(app.getHttpServer()).post('/api/notifications/mark-all-read');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5);
    });
  });

  // -----------------------------------------------------------------
  // Preferences
  // -----------------------------------------------------------------

  describe('Preferences', () => {
    it('GET /api/notifications/preferences returns 200 + preferences', async () => {
      notifSvc.getPreferences.mockResolvedValue({
        emailEnabled: true,
        smsEnabled: true,
        whatsappEnabled: false,
        pushEnabled: true,
      });

      const res = await request(app.getHttpServer()).get('/api/notifications/preferences');

      expect(res.status).toBe(200);
      expect(res.body.emailEnabled).toBe(true);
    });

    it('PUT /api/notifications/preferences returns 200 + updated preferences', async () => {
      notifSvc.updatePreferences.mockResolvedValue({
        emailEnabled: false,
      });

      const res = await request(app.getHttpServer())
        .put('/api/notifications/preferences')
        .send({ emailEnabled: false });

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------
  // Templates
  // -----------------------------------------------------------------

  describe('Templates', () => {
    it('GET /api/notifications/templates returns 200 + list', async () => {
      templatesSvc.findAll.mockResolvedValue([testNotificationTemplate]);

      const res = await request(app.getHttpServer()).get('/api/notifications/templates');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/notifications/templates returns 201 + created template', async () => {
      templatesSvc.create.mockResolvedValue({ ...testNotificationTemplate, id: 'tmpl-new' });

      const res = await request(app.getHttpServer())
        .post('/api/notifications/templates')
        .send({
          code: 'new_template',
          name: 'New',
          channel: 'EMAIL',
          subject: 'Subject',
          body: 'Body',
        });

      expect(res.status).toBe(201);
    });

    it('GET /api/notifications/templates/:id returns 200 + the template', async () => {
      templatesSvc.findOne.mockResolvedValue(testNotificationTemplate);

      const res = await request(app.getHttpServer())
        .get(`/api/notifications/templates/${testNotificationTemplate.id}`);

      expect(res.status).toBe(200);
    });

    it('PUT /api/notifications/templates/:id returns 200 + updated template', async () => {
      templatesSvc.update.mockResolvedValue({
        ...testNotificationTemplate,
        subject: 'Updated',
      });

      const res = await request(app.getHttpServer())
        .put(`/api/notifications/templates/${testNotificationTemplate.id}`)
        .send({ subject: 'Updated' });

      expect(res.status).toBe(200);
    });

    it('DELETE /api/notifications/templates/:id returns 200', async () => {
      templatesSvc.remove.mockResolvedValue(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/api/notifications/templates/${testNotificationTemplate.id}`);

      expect(res.status).toBe(200);
    });
  });
});
