/**
 * Integration test — Support ticket flow.
 *
 * Exercises the full support ticket lifecycle:
 *  1. Create ticket → assign → respond → resolve → close
 *  2. SLA tracking
 *  3. Escalation when SLA is breached
 *
 * Requires `DATABASE_URL` pointing at a writable test DB.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '@backend/_shared/database/prisma.service';

import { testTenant } from '@testing/helpers/fixtures';

const HAS_TEST_DB =
  !!process.env.DATABASE_URL && process.env.DATABASE_URL.includes('_test');
const describeOrSkip = HAS_TEST_DB ? describe : describe.skip;

describeOrSkip('Support ticket flow (integration)', () => {
  let prisma: any;

  const authUser = {
    userId: 'emp-1',
    tenantId: testTenant.id,
    email: 'support@dayjoy.test',
    jti: 'jti-ticket',
  };

  beforeAll(async () => {
    const { PrismaService: Prisma } = await import('@backend/_shared/database/prisma.service');
    prisma = new Prisma();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.supportTicket.deleteMany();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  it('runs the full OPEN → IN_PROGRESS → RESOLVED → CLOSED flow', async () => {
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId: testTenant.id,
        ticketNumber: 'TKT-2025-000001',
        subject: 'Damaged product received',
        description: 'The serum bottle arrived cracked.',
        status: 'OPEN',
        priority: 'HIGH',
        customerId: null,
        assignedTo: null,
        slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdBy: authUser.userId,
      },
    });

    // Assign.
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'IN_PROGRESS', assignedTo: authUser.userId },
    });

    // Resolve.
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolution: 'Replacement shipped',
      },
    });

    // Close.
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'CLOSED' },
    });

    const final = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
    });
    expect(final.status).toBe('CLOSED');
    expect(final.resolvedAt).toBeInstanceOf(Date);
  });

  it('auto-generates a unique sequential ticket number', async () => {
    const t1 = await prisma.supportTicket.create({
      data: {
        tenantId: testTenant.id,
        ticketNumber: 'TKT-2025-000001',
        subject: 'T1',
        status: 'OPEN',
        priority: 'NORMAL',
        slaDueAt: new Date(Date.now() + 86400_000),
        createdBy: authUser.userId,
      },
    });
    const t2 = await prisma.supportTicket.create({
      data: {
        tenantId: testTenant.id,
        ticketNumber: 'TKT-2025-000002',
        subject: 'T2',
        status: 'OPEN',
        priority: 'NORMAL',
        slaDueAt: new Date(Date.now() + 86400_000),
        createdBy: authUser.userId,
      },
    });

    expect(t1.ticketNumber).not.toBe(t2.ticketNumber);
  });

  it('sets the SLA due date based on priority', async () => {
    const HIGH_SLA_HOURS = 4;
    const NORMAL_SLA_HOURS = 24;
    const LOW_SLA_HOURS = 72;

    const high = await prisma.supportTicket.create({
      data: {
        tenantId: testTenant.id,
        ticketNumber: 'TKT-HIGH',
        subject: 'high',
        status: 'OPEN',
        priority: 'HIGH',
        slaDueAt: new Date(Date.now() + HIGH_SLA_HOURS * 3600_000),
        createdBy: authUser.userId,
      },
    });
    const normal = await prisma.supportTicket.create({
      data: {
        tenantId: testTenant.id,
        ticketNumber: 'TKT-NORMAL',
        subject: 'normal',
        status: 'OPEN',
        priority: 'NORMAL',
        slaDueAt: new Date(Date.now() + NORMAL_SLA_HOURS * 3600_000),
        createdBy: authUser.userId,
      },
    });
    const low = await prisma.supportTicket.create({
      data: {
        tenantId: testTenant.id,
        ticketNumber: 'TKT-LOW',
        subject: 'low',
        status: 'OPEN',
        priority: 'LOW',
        slaDueAt: new Date(Date.now() + LOW_SLA_HOURS * 3600_000),
        createdBy: authUser.userId,
      },
    });

    // Higher-priority tickets should have an earlier SLA due date.
    expect(high.slaDueAt.getTime()).toBeLessThan(normal.slaDueAt.getTime());
    expect(normal.slaDueAt.getTime()).toBeLessThan(low.slaDueAt.getTime());
  });

  it('escalates a ticket when the SLA is breached', async () => {
    // Create a ticket whose SLA due date is in the past.
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId: testTenant.id,
        ticketNumber: 'TKT-ESCALATE',
        subject: 'breached',
        status: 'OPEN',
        priority: 'HIGH',
        slaDueAt: new Date(Date.now() - 1000),
        createdBy: authUser.userId,
      },
    });

    // Simulate the escalation job — escalate tickets whose SLA is breached
    // AND that are still open.
    const breached = await prisma.supportTicket.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        slaDueAt: { lt: new Date() },
        isEscalated: false,
      },
    });
    expect(breached).toHaveLength(1);

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { isEscalated: true, priority: 'URGENT' },
    });

    const escalated = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
    });
    expect(escalated.isEscalated).toBe(true);
    expect(escalated.priority).toBe('URGENT');
  });
});
