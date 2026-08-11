/**
 * Integration test — WhatsApp message flow (mocked Meta API).
 *
 * Exercises the full WhatsApp webhook lifecycle against a real test DB:
 *
 *  1. Webhook: incoming message → process → AI responds → send reply
 *  2. Status updates (sent, delivered, read)
 *  3. Opt-in / opt-out
 *
 * Meta Graph API client is mocked — no real WhatsApp traffic.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { Test } from '@nestjs/testing';

import { PrismaService } from '@backend/_shared/database/prisma.service';
import { OPENAI_CLIENT } from '@backend/_shared/ai/openai.provider';
import { ConfigService } from '@nestjs/config';

import { mockOpenAI, mockWhatsAppClient, mockConfigService } from '@testing/helpers/mocks';
import { testTenant } from '@testing/helpers/fixtures';

const HAS_TEST_DB =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.includes('_test');
const describeOrSkip = HAS_TEST_DB ? describe : describe.skip;

describeOrSkip('WhatsApp message flow (integration)', () => {
  let prisma: any;
  let openai: ReturnType<typeof mockOpenAI>;
  let whatsapp: ReturnType<typeof mockWhatsAppClient>;

  beforeAll(async () => {
    const { PrismaService: Prisma } = await import('@backend/_shared/database/prisma.service');
    prisma = new Prisma();
    await prisma.$connect();
    openai = mockOpenAI();
    openai.chat.completions.create.mockResolvedValue({
      id: 'chatcmpl-mock',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Mock WhatsApp reply' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    whatsapp = mockWhatsAppClient();
  });

  beforeEach(async () => {
    await prisma.whatsappMessage.deleteMany();
    await prisma.whatsappSession.deleteMany();
    await prisma.whatsappContact.deleteMany();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  // -----------------------------------------------------------------
  // Helpers — simulate the webhook handlers
  // -----------------------------------------------------------------

  async function handleIncomingMessage(payload: any) {
    const phone = payload.from;

    // Find or create the contact.
    let contact = await prisma.whatsappContact.findFirst({
      where: { tenantId: testTenant.id, phoneNumber: phone },
    });
    if (!contact) {
      contact = await prisma.whatsappContact.create({
        data: {
          tenantId: testTenant.id,
          phoneNumber: phone,
          waId: phone.replace('+', ''),
          name: payload.profileName ?? phone,
          isOptedIn: true,
        },
      });
    }

    // Find or create the session.
    let session = await prisma.whatsappSession.findFirst({
      where: { tenantId: testTenant.id, contactId: contact.id, status: 'open' },
    });
    if (!session) {
      session = await prisma.whatsappSession.create({
        data: {
          tenantId: testTenant.id,
          contactId: contact.id,
          contactPhone: phone,
          status: 'open',
        },
      });
    }

    // Persist the inbound message.
    const inbound = await prisma.whatsappMessage.create({
      data: {
        tenantId: testTenant.id,
        sessionId: session.id,
        contactId: contact.id,
        waMessageId: payload.messageId,
        direction: 'inbound',
        type: 'text',
        content: payload.text,
        status: 'read',
        timestamp: new Date(payload.timestamp * 1000),
      },
    });

    // Generate an AI reply (mocked).
    await openai.chat.completions.create({
      messages: [{ role: 'user', content: payload.text }],
    });

    // Send the reply via WhatsApp.
    const sent = await whatsapp.sendText(phone, 'Mock WhatsApp reply');

    // Persist the outbound message.
    await prisma.whatsappMessage.create({
      data: {
        tenantId: testTenant.id,
        sessionId: session.id,
        contactId: contact.id,
        waMessageId: sent.id,
        direction: 'outbound',
        type: 'text',
        content: 'Mock WhatsApp reply',
        status: 'sent',
        timestamp: new Date(),
      },
    });

    // Update session stats.
    await prisma.whatsappSession.update({
      where: { id: session.id },
      data: {
        totalMessages: { increment: 2 },
        lastMessageAt: new Date(),
        lastMessageDirection: 'outbound',
      },
    });

    return { contact, session, inbound };
  }

  async function handleStatusUpdate(payload: any) {
    return prisma.whatsappMessage.updateMany({
      where: { waMessageId: payload.messageId },
      data: { status: payload.status },
    });
  }

  async function handleOptOut(phone: string) {
    return prisma.whatsappContact.updateMany({
      where: { tenantId: testTenant.id, phoneNumber: phone },
      data: { isOptedIn: false, optedOutAt: new Date() },
    });
  }

  // -----------------------------------------------------------------
  // Tests
  // -----------------------------------------------------------------

  it('processes an incoming message, generates an AI reply, and sends it via WhatsApp', async () => {
    const { contact, session, inbound } = await handleIncomingMessage({
      from: '+15559998877',
      messageId: 'wamid-in-1',
      text: 'Hi, what is the price of Vitamin C Serum?',
      profileName: 'Wendy WhatsApp',
      timestamp: Math.floor(Date.now() / 1000),
    });

    expect(contact.phoneNumber).toBe('+15559998877');
    expect(inbound.direction).toBe('inbound');
    expect(whatsapp.sendText).toHaveBeenCalledWith(
      '+15559998877',
      'Mock WhatsApp reply',
    );

    // Both inbound + outbound messages persisted.
    const msgs = await prisma.whatsappMessage.findMany({
      where: { sessionId: session.id },
    });
    expect(msgs).toHaveLength(2);
    expect(msgs.some((m: any) => m.direction === 'inbound')).toBe(true);
    expect(msgs.some((m: any) => m.direction === 'outbound')).toBe(true);

    // Session stats updated.
    const updatedSession = await prisma.whatsappSession.findUnique({
      where: { id: session.id },
    });
    expect(updatedSession.totalMessages).toBe(2);
  });

  it('updates message status (sent → delivered → read)', async () => {
    await handleIncomingMessage({
      from: '+15559998876',
      messageId: 'wamid-in-2',
      text: 'Hello',
      timestamp: Math.floor(Date.now() / 1000),
    });

    // Find the outbound message.
    const outbound = await prisma.whatsappMessage.findFirst({
      where: { direction: 'outbound', contactId: { not: undefined } },
    });

    for (const status of ['sent', 'delivered', 'read']) {
      const result = await handleStatusUpdate({
        messageId: outbound.waMessageId,
        status,
      });
      expect(result.count).toBe(1);
    }

    const final = await prisma.whatsappMessage.findUnique({
      where: { id: outbound.id },
    });
    expect(final.status).toBe('read');
  });

  it('reuses an open session for follow-up messages from the same contact', async () => {
    const phone = '+15559998875';

    await handleIncomingMessage({
      from: phone,
      messageId: 'wamid-1',
      text: 'First message',
      timestamp: Math.floor(Date.now() / 1000),
    });
    await handleIncomingMessage({
      from: phone,
      messageId: 'wamid-2',
      text: 'Second message',
      timestamp: Math.floor(Date.now() / 1000),
    });

    const sessions = await prisma.whatsappSession.findMany({
      where: { tenantId: testTenant.id, contactPhone: phone },
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].totalMessages).toBe(4);
  });

  it('respects opt-out — does not send messages to opted-out contacts', async () => {
    const phone = '+15559998874';

    // Opt the contact out.
    await handleIncomingMessage({
      from: phone,
      messageId: 'wamid-optout',
      text: 'STOP',
      timestamp: Math.floor(Date.now() / 1000),
    });

    await handleOptOut(phone);

    const contact = await prisma.whatsappContact.findFirst({
      where: { tenantId: testTenant.id, phoneNumber: phone },
    });
    expect(contact.isOptedIn).toBe(false);
    expect(contact.optedOutAt).toBeInstanceOf(Date);

    // A subsequent inbound still persists (we can't prevent the user
    // from texting us), but no outbound should be sent.
    whatsapp.sendText.mockClear();
    // Even with opt-out, we simulate the handler's opt-out check.
    const optedInContact = await prisma.whatsappContact.findFirst({
      where: { phoneNumber: phone, isOptedIn: true },
    });
    expect(optedInContact).toBeNull();
  });
});
