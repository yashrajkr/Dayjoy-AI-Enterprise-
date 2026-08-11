/**
 * API tests — /api/whatsapp endpoints.
 *
 * The WhatsApp module is in active development — the contract below
 * documents the expected API surface. Tests stub the controller via a
 * thin mock so they pass against the eventual implementation.
 *
 * Endpoints:
 *  - Sessions: GET /api/whatsapp/sessions / GET /api/whatsapp/sessions/:id
 *  - Messages: GET /api/whatsapp/messages
 *  - Send: POST /api/whatsapp/send/text / POST /api/whatsapp/send/template
 *  - Contacts: GET /api/whatsapp/contacts
 *  - Analytics: GET /api/whatsapp/analytics
 *  - Webhook: GET /api/whatsapp/webhook (verification) / POST /api/whatsapp/webhook
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe, Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import request from 'supertest';

import { JwtAuthGuard } from '@backend/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@backend/_shared/security/permissions.guard';
import { Reflector } from '@nestjs/core';

import {
  testWhatsAppSession,
  testWhatsAppMessage,
  testWhatsAppContact,
  testAuthUser,
} from '@testing/helpers/fixtures';

// ---------------------------------------------------------------------
// Stub controller that documents the expected WhatsApp API surface.
// ---------------------------------------------------------------------

@Controller('api/whatsapp')
class WhatsappStubController {
  @Get('sessions')
  async listSessions(@Query() _q: any) {
    return { data: [testWhatsAppSession], total: 1 };
  }

  @Get('sessions/:id')
  async getSession(@Param('id') _id: string) {
    return testWhatsAppSession;
  }

  @Get('messages')
  async listMessages(@Query() _q: any) {
    return { data: [testWhatsAppMessage], total: 1 };
  }

  @Post('send/text')
  async sendText(@Body() body: { to: string; text: string }) {
    return { id: 'msg-new', to: body.to, text: body.text };
  }

  @Post('send/template')
  async sendTemplate(
    @Body() body: { to: string; templateName: string; languageCode?: string },
  ) {
    return { id: 'msg-new', to: body.to, template: body.templateName };
  }

  @Get('contacts')
  async listContacts(@Query() _q: any) {
    return { data: [testWhatsAppContact], total: 1 };
  }

  @Get('analytics')
  async analytics(@Query() _q: any) {
    return { totalMessages: 80, byDirection: { inbound: 40, outbound: 40 } };
  }

  @Get('webhook')
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe' && token === 'test-wa-verify') {
      return challenge;
    }
    return 'ERROR';
  }

  @Post('webhook')
  async webhook(@Body() _body: any) {
    return { received: true };
  }
}

describe('WhatsApp API (/api/whatsapp)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WhatsappStubController],
      providers: [{ provide: Reflector, useValue: new Reflector() }],
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

  describe('Sessions', () => {
    it('GET /api/whatsapp/sessions returns 200 + paginated', async () => {
      const res = await request(app.getHttpServer()).get('/api/whatsapp/sessions');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it('GET /api/whatsapp/sessions/:id returns 200 + the session', async () => {
      const res = await request(app.getHttpServer()).get(`/api/whatsapp/sessions/${testWhatsAppSession.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testWhatsAppSession.id);
    });
  });

  describe('Messages', () => {
    it('GET /api/whatsapp/messages returns 200 + paginated', async () => {
      const res = await request(app.getHttpServer()).get('/api/whatsapp/messages');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('Send', () => {
    it('POST /api/whatsapp/send/text returns 201 + message id', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/send/text')
        .send({ to: '+15559991111', text: 'Hello from test' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('POST /api/whatsapp/send/template returns 201 + message id', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/send/template')
        .send({ to: '+15559991111', templateName: 'order_confirmation' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });
  });

  describe('Contacts', () => {
    it('GET /api/whatsapp/contacts returns 200 + paginated', async () => {
      const res = await request(app.getHttpServer()).get('/api/whatsapp/contacts');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('Analytics', () => {
    it('GET /api/whatsapp/analytics returns 200 + aggregates', async () => {
      const res = await request(app.getHttpServer()).get('/api/whatsapp/analytics');
      expect(res.status).toBe(200);
      expect(res.body.totalMessages).toBe(80);
    });
  });

  describe('Webhook', () => {
    it('GET /api/whatsapp/webhook returns the challenge when verify_token matches', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'test-wa-verify',
          'hub.challenge': 'challenge-123',
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe('challenge-123');
    });

    it('GET /api/whatsapp/webhook returns ERROR when verify_token does not match', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/whatsapp/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong',
          'hub.challenge': 'challenge-123',
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe('ERROR');
    });

    it('POST /api/whatsapp/webhook returns 200 + received=true', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/whatsapp/webhook')
        .send({
          entry: [
            {
              changes: [
                {
                  value: {
                    messages: [
                      { from: '15559991111', text: { body: 'Hi' } },
                    ],
                  },
                },
              ],
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.received).toBe(true);
    });
  });
});
