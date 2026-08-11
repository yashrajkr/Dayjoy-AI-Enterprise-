import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import type { VapiTool, ToolContext, ToolResult } from './vapi-tool-interface';

/**
 * VapiLeadCaptureTool — create a new Lead row in the Prisma `leads`
 * table from a voice call.
 *
 * Fields:
 *  - firstName, lastName, email, phone (required)
 *  - interest: 'product' | 'business' | 'both'
 *  - notes / goals: free-form text from the conversation
 *  - source: 'VOICE' (always — this is the voice channel)
 *
 * The lead is linked to the tenant from `ToolContext.tenantId`. When a
 * `context.callId` is supplied, it's persisted in `metadata.callId`
 * for traceability.
 *
 * Returns the lead ID + a confirmation `speak` field that includes the
 * reference number for the customer.
 */
@Injectable()
export class VapiLeadCaptureTool implements VapiTool {
  name = 'create_lead';
  description =
    'Capture a new lead from a voice call. Use this when a prospect ' +
    'expresses interest in Dayjoy products or the business opportunity. ' +
    'Returns a lead reference number.';

  parameters = {
    type: 'object',
    properties: {
      firstName: {
        type: 'string',
        description: "Lead's first name.",
      },
      lastName: {
        type: 'string',
        description: "Lead's last name.",
      },
      email: {
        type: 'string',
        description: "Lead's email address.",
      },
      phone: {
        type: 'string',
        description: "Lead's phone number (E.164 preferred).",
      },
      interest: {
        type: 'string',
        enum: ['product', 'business', 'both'],
        description: 'What the prospect is interested in.',
      },
      notes: {
        type: 'string',
        description: 'Free-form notes from the conversation.',
      },
      goals: {
        type: 'string',
        description: "Lead's stated goals or motivations.",
      },
      company: {
        type: 'string',
        description: 'Company name (optional, for business leads).',
      },
    },
    required: ['firstName', 'lastName', 'email', 'phone', 'interest'],
  };

  private readonly logger = new Logger(VapiLeadCaptureTool.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    args: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      interest?: 'product' | 'business' | 'both';
      notes?: string;
      goals?: string;
      company?: string;
    },
    context: ToolContext,
  ): Promise<ToolResult> {
    const firstName = (args?.firstName ?? '').toString().trim();
    const lastName = (args?.lastName ?? '').toString().trim();
    const email = (args?.email ?? '').toString().trim().toLowerCase();
    const phone = (args?.phone ?? '').toString().trim();
    const interest = args?.interest ?? 'both';

    if (!firstName || !lastName || !email || !phone) {
      return {
        success: false,
        error: 'firstName, lastName, email, and phone are required',
        speak:
          "I'd love to capture your information, but I'm missing some details. Could you give me your first name, last name, email, and phone number?",
      };
    }
    if (!context.tenantId) {
      return { success: false, error: 'ToolContext.tenantId is required' };
    }

    try {
      this.logger.log(
        `create_lead(name="${firstName} ${lastName}", email="${email}", tenant=${context.tenantId})`,
      );

      const notes = [args?.notes, args?.goals].filter(Boolean).join(' | ');
      const lead = await this.prisma.lead.create({
        data: {
          tenantId: context.tenantId,
          firstName,
          lastName,
          email,
          phone,
          company: args?.company ?? null,
          status: 'NEW',
          score: 75, // Default score — business development can refine later.
          metadata: {
            source: 'VOICE',
            interest,
            callId: context.callId ?? null,
            conversationId: context.conversationId ?? null,
            notes: notes || null,
          },
        },
      });

      // Best-effort: link the lead to an existing customer in the same
      // tenant with the same email, so the business development team can
      // see the call history in one place.
      if (email) {
        try {
          const existingCustomer = await this.prisma.customer.findFirst({
            where: { tenantId: context.tenantId, email },
            select: { id: true },
          });
          if (existingCustomer) {
            await this.prisma.interaction.create({
              data: {
                tenantId: context.tenantId,
                customerId: existingCustomer.id,
                leadId: lead.id,
                userId: context.userId ?? '',
                type: 'CALL',
                subject: `Voice call from ${firstName} ${lastName}`,
                description: notes || 'Lead captured via voice call',
                metadata: { callId: context.callId ?? null, interest },
              },
            });
          }
        } catch (linkErr) {
          // Non-fatal — log and continue.
          this.logger.debug(
            `Failed to link lead ${lead.id} to existing customer: ${(linkErr as Error).message}`,
          );
        }
      }

      this.logger.log(`Lead created: ${lead.id}`);

      return {
        success: true,
        data: {
          leadId: lead.id,
          referenceNumber: lead.id.slice(0, 8).toUpperCase(),
          status: lead.status,
          interest,
        },
        speak: `Perfect! I've saved your information, ${firstName}. Your reference number is ${lead.id
          .slice(0, 8)
          .toUpperCase()}. Our team will contact you within 24 hours at ${email} or ${phone}. Thank you for your interest in Dayjoy!`,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`create_lead failed: ${message}`);
      return {
        success: false,
        error: message,
        speak:
          "I wasn't able to save your information just now. Let me connect you with someone who can help.",
      };
    }
  }
}
