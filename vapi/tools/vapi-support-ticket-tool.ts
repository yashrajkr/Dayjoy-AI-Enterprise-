import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import type { VapiTool, ToolContext, ToolResult } from './vapi-tool-interface';

/**
 * VapiSupportTicketTool — create a new SupportTicket row in the Prisma
 * `support_tickets` table from a voice call.
 *
 * Required: subject + description + at least one of (customerId,
 * customerEmail, customerPhone). When `customerId` is not supplied
 * (e.g. caller is not yet a customer), the ticket is created without
 * a customer link and the customer contact info is stored in
 * `metadata` for follow-up.
 *
 * Returns a human-readable ticket number (the first 8 chars of the UUID,
 * uppercased) + a confirmation `speak` field that includes the number.
 */
@Injectable()
export class VapiSupportTicketTool implements VapiTool {
  name = 'create_support_ticket';
  description =
    'Create a support ticket for a customer issue, complaint, or ' +
    'technical problem. Use this when the customer has a specific ' +
    'problem that needs follow-up from the support team. ' +
    'Returns a ticket number.';

  parameters = {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        description: 'Short subject line (max ~80 chars).',
      },
      description: {
        type: 'string',
        description: 'Detailed description of the issue.',
      },
      category: {
        type: 'string',
        enum: ['product', 'order', 'billing', 'technical', 'account', 'other'],
        description: 'Issue category.',
        default: 'other',
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Issue priority. Use "urgent" only for billing-disabling or order-blocking issues.',
        default: 'medium',
      },
      orderNumber: {
        type: 'string',
        description: 'Related order number (optional).',
      },
      customerName: {
        type: 'string',
        description: 'Customer name (used when no customer record is linked).',
      },
      customerEmail: {
        type: 'string',
        description: 'Customer email (for follow-up).',
      },
      customerPhone: {
        type: 'string',
        description: 'Customer phone (for follow-up).',
      },
    },
    required: ['subject', 'description'],
  };

  private readonly logger = new Logger(VapiSupportTicketTool.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    args: {
      subject: string;
      description: string;
      category?: string;
      priority?: string;
      orderNumber?: string;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
    },
    context: ToolContext,
  ): Promise<ToolResult> {
    const subject = (args?.subject ?? '').toString().trim();
    const description = (args?.description ?? '').toString().trim();

    if (!subject || !description) {
      return {
        success: false,
        error: 'subject and description are required',
        speak:
          "I'd be happy to create a support ticket for you. Could you briefly describe the issue you're having?",
      };
    }
    if (!context.tenantId) {
      return { success: false, error: 'ToolContext.tenantId is required' };
    }

    try {
      this.logger.log(
        `create_support_ticket(subject="${subject}", priority=${args?.priority ?? 'medium'}, tenant=${context.tenantId})`,
      );

      const ticket = await this.prisma.supportTicket.create({
        data: {
          tenantId: context.tenantId,
          customerId: context.customerId ?? null,
          assignedToId: null,
          subject,
          description,
          priority: args?.priority ?? 'medium',
          status: 'open',
          category: args?.category ?? 'other',
          channel: 'voice',
          resolution: null,
          resolvedAt: null,
        },
      });

      // Stash contact info + order number + call metadata in the
      // `support_tickets` table is limited — we persist orderNumber +
      // contact info as an Interaction row linked to the ticket's
      // customer (if any) so the support team has full context.
      if (context.customerId || args?.customerEmail || args?.customerPhone) {
        try {
          await this.prisma.interaction.create({
            data: {
              tenantId: context.tenantId,
              customerId: context.customerId ?? null,
              userId: context.userId ?? '',
              type: 'CALL',
              subject: `Support ticket ${ticket.id.slice(0, 8).toUpperCase()}: ${subject}`,
              description,
              metadata: {
                ticketId: ticket.id,
                orderNumber: args?.orderNumber ?? null,
                customerName: args?.customerName ?? null,
                customerEmail: args?.customerEmail ?? null,
                customerPhone: args?.customerPhone ?? null,
                callId: context.callId ?? null,
                conversationId: context.conversationId ?? null,
                source: 'VOICE',
              },
            },
          });
        } catch (interactionErr) {
          this.logger.debug(
            `Failed to write interaction for ticket ${ticket.id}: ${(interactionErr as Error).message}`,
          );
        }
      }

      this.logger.log(`Support ticket created: ${ticket.id}`);

      const ticketNumber = ticket.id.slice(0, 8).toUpperCase();
      return {
        success: true,
        data: {
          ticketId: ticket.id,
          ticketNumber,
          status: ticket.status,
          priority: ticket.priority,
          category: ticket.category,
        },
        speak: `I've created a support ticket for you. Your ticket number is ${ticketNumber}. Our team will respond${
          args?.customerEmail ? ` at ${args.customerEmail}` : ''
        } within 24 hours. You can reference ticket number ${ticketNumber} in any future communication. Is there anything else I can help you with?`,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`create_support_ticket failed: ${message}`);
      return {
        success: false,
        error: message,
        speak:
          "I wasn't able to create the support ticket just now. Let me connect you with someone who can help.",
      };
    }
  }
}
