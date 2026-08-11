import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import type { VapiTool, ToolContext, ToolResult } from './vapi-tool-interface';

/**
 * VapiAppointmentBookingTool — create a new Appointment row in the
 * Prisma `appointments` table from a voice call.
 *
 * Required: title, scheduledAt (ISO 8601), and at least a phone or
 * email so we can send the customer a confirmation. Optionally link
 * to an existing customer / distributor via context (the caller's
 * identity is established earlier in the call by `customer_lookup`).
 *
 * Returns the appointment ID + a confirmation `speak` field that
 * includes the date + time in a friendly format.
 */
@Injectable()
export class VapiAppointmentBookingTool implements VapiTool {
  name = 'book_appointment';
  description =
    'Schedule an appointment with a Dayjoy team member. Use this when ' +
    'the customer explicitly asks to schedule a call or meeting. ' +
    'Returns the appointment ID and confirmation.';

  parameters = {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short title for the appointment (e.g. "Product demo").',
      },
      scheduledAt: {
        type: 'string',
        description: 'Appointment date + time in ISO 8601 (e.g. "2025-01-15T14:30:00Z").',
      },
      durationMinutes: {
        type: 'integer',
        description: 'Duration in minutes (default: 30).',
        default: 30,
      },
      department: {
        type: 'string',
        enum: ['sales', 'business_development', 'customer_service', 'technical_support'],
        description: 'Department the appointment is with.',
      },
      location: {
        type: 'string',
        description: 'Physical location for in-person meetings (optional).',
      },
      meetingLink: {
        type: 'string',
        description: 'Video call URL for virtual meetings (optional).',
      },
      notes: {
        type: 'string',
        description: 'Additional notes or agenda items.',
      },
      customerName: {
        type: 'string',
        description: 'Customer name (used when no customer record is linked).',
      },
      customerEmail: {
        type: 'string',
        description: 'Customer email (for confirmation).',
      },
      customerPhone: {
        type: 'string',
        description: 'Customer phone (for reminder call).',
      },
    },
    required: ['title', 'scheduledAt', 'department'],
  };

  private readonly logger = new Logger(VapiAppointmentBookingTool.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    args: {
      title: string;
      scheduledAt: string;
      durationMinutes?: number;
      department?: string;
      location?: string;
      meetingLink?: string;
      notes?: string;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
    },
    context: ToolContext,
  ): Promise<ToolResult> {
    const title = (args?.title ?? '').toString().trim();
    const scheduledAtRaw = (args?.scheduledAt ?? '').toString().trim();

    if (!title) {
      return {
        success: false,
        error: 'title is required',
        speak: "What would you like to schedule the appointment for?",
      };
    }
    if (!scheduledAtRaw) {
      return {
        success: false,
        error: 'scheduledAt is required',
        speak: 'When would you like to schedule the appointment? Please give me a date and time.',
      };
    }

    const scheduledAt = new Date(scheduledAtRaw);
    if (isNaN(scheduledAt.getTime())) {
      return {
        success: false,
        error: `Invalid scheduledAt: ${scheduledAtRaw}`,
        speak: "I didn't catch a valid date and time. Could you repeat that, please?",
      };
    }
    if (scheduledAt.getTime() < Date.now()) {
      return {
        success: false,
        error: 'scheduledAt is in the past',
        speak: "That time has already passed. Could you give me a future date and time?",
      };
    }
    if (!context.tenantId) {
      return { success: false, error: 'ToolContext.tenantId is required' };
    }

    try {
      this.logger.log(
        `book_appointment(title="${title}", at=${scheduledAt.toISOString()}, tenant=${context.tenantId})`,
      );

      const appointment = await this.prisma.appointment.create({
        data: {
          tenantId: context.tenantId,
          customerId: context.customerId ?? null,
          distributorId: context.distributorId ?? null,
          assignedToId: null,
          title,
          description: args?.notes ?? null,
          scheduledAt,
          durationMinutes: args?.durationMinutes ?? 30,
          location: args?.location ?? null,
          meetingLink: args?.meetingLink ?? null,
          status: 'scheduled',
          metadata: {
            department: args?.department ?? null,
            customerName: args?.customerName ?? null,
            customerEmail: args?.customerEmail ?? null,
            customerPhone: args?.customerPhone ?? null,
            callId: context.callId ?? null,
            conversationId: context.conversationId ?? null,
            source: 'VOICE',
          },
        },
      });

      this.logger.log(`Appointment created: ${appointment.id}`);

      return {
        success: true,
        data: {
          appointmentId: appointment.id,
          referenceNumber: appointment.id.slice(0, 8).toUpperCase(),
          scheduledAt: appointment.scheduledAt.toISOString(),
          durationMinutes: appointment.durationMinutes,
          status: appointment.status,
        },
        speak: this.formatForVoice(appointment, args?.customerEmail),
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`book_appointment failed: ${message}`);
      return {
        success: false,
        error: message,
        speak:
          "I wasn't able to schedule the appointment just now. Let me connect you with someone who can help.",
      };
    }
  }

  private formatForVoice(appointment: any, email?: string): string {
    const dateStr = appointment.scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = appointment.scheduledAt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
    const confirm = email
      ? ` You'll receive a confirmation email at ${email}.`
      : '';
    return `Perfect! I've scheduled your appointment for ${dateStr} at ${timeStr}.${confirm} We look forward to speaking with you. Is there anything else I can help you with?`;
  }
}
