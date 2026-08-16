import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../backend/_shared/database/prisma.service';
import { NotificationsService } from '../../backend/notifications/notifications.service';
import {
  NotificationType,
  NotificationPriority,
} from '../../backend/notifications/dto/send-notification.dto';
import { getDepartmentTransferPhoneNumber } from '../config/vapi-assistant-config';
import type { VapiTool, ToolContext, ToolResult } from './vapi-tool-interface';

/**
 * Department → routing label map. The human-facing department names are
 * user-friendly; the routing label is what we stash in the notification
 * metadata for the support team's ticket queue.
 */
const DEPARTMENT_LABELS: Record<string, string> = {
  customer_service: 'Customer Service',
  business_development: 'Business Development',
  technical_support: 'Technical Support',
  manager: 'Manager',
  sales: 'Sales',
};

/**
 * VapiHumanTransferTool — initiate a transfer to a human agent.
 *
 * Actions:
 *   1. Resolve the destination phone number from `VAPI_TRANSFER_PHONE_NUMBER`
 *      (or `VAPI_TRANSFER_PHONE_NUMBERS`) and include it in the tool
 *      result under `data.forwardingPhoneNumber` so Vapi's platform can
 *      perform the actual SIP transfer. Without this field, Vapi
 *      records the tool call as successful but no call transfer occurs
 *      (the audit P0 "V3" bug).
 *   2. Send an IN_APP notification to the support team (subject +
 *      summary + caller info) so the agent picking up the call has
 *      context.
 *   3. Update the VoiceSession row (if one exists for `context.callId`)
 *      to `status='transferring'` so the live-ops dashboard reflects
 *      the transfer in flight.
 *   4. Best-effort: also create an Interaction row on the customer
 *      (if `context.customerId` is set) for the audit trail.
 *
 * Returns the transfer ID + a `speak` field that tells the customer
 * what to expect.
 *
 * The actual SIP transfer (SIP REFER) is performed by Vapi when the
 * assistant has `forwardingPhoneNumbers` configured OR when the tool
 * result includes `forwardingPhoneNumber` — this tool emits both so
 * the transfer happens even if the assistant was created without the
 * `forwardingPhoneNumbers` field (e.g. a stale assistant created
 * before the env var was added).
 */
@Injectable()
export class VapiHumanTransferTool implements VapiTool {
  name = 'human_transfer';
  description =
    'Transfer the call to a human agent. Use this when the customer ' +
    'asks for a human, when the issue is beyond your scope, or when ' +
    'escalation criteria are met (see escalation protocols). ' +
    'Notifies the support team and records the transfer intent.';

  parameters = {
    type: 'object',
    properties: {
      department: {
        type: 'string',
        enum: ['customer_service', 'business_development', 'technical_support', 'manager', 'sales'],
        description: 'Department to transfer to.',
      },
      reason: {
        type: 'string',
        description: 'Concise reason for the transfer.',
      },
      priority: {
        type: 'string',
        enum: ['normal', 'high', 'urgent'],
        description: 'Transfer priority. Use "urgent" for angry customers or legal/medical issues.',
        default: 'normal',
      },
      callSummary: {
        type: 'string',
        description: 'Brief summary of the call so far for the human agent.',
      },
      customerName: {
        type: 'string',
        description: 'Customer name (if known).',
      },
      customerPhone: {
        type: 'string',
        description: 'Customer phone number for callback (if call drops).',
      },
    },
    required: ['department', 'reason'],
  };

  private readonly logger = new Logger(VapiHumanTransferTool.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async execute(
    args: {
      department: string;
      reason: string;
      priority?: string;
      callSummary?: string;
      customerName?: string;
      customerPhone?: string;
    },
    context: ToolContext,
  ): Promise<ToolResult> {
    const department = (args?.department ?? '').toString().trim();
    const reason = (args?.reason ?? '').toString().trim();
    if (!department || !reason) {
      return {
        success: false,
        error: 'department and reason are required',
        speak:
          "I'd like to transfer you to a human agent. Could you tell me briefly what you need help with so I can route you to the right team?",
      };
    }
    if (!DEPARTMENT_LABELS[department]) {
      return {
        success: false,
        error: `Unknown department: ${department}`,
        speak: `I'll transfer you to a specialist who can help.`,
      };
    }
    if (!context.tenantId) {
      return { success: false, error: 'ToolContext.tenantId is required' };
    }

    try {
      this.logger.log(
        `human_transfer(department="${department}", reason="${reason}", priority=${args?.priority ?? 'normal'}, tenant=${context.tenantId})`,
      );

      // 1. Update VoiceSession status (best-effort — the session may
      //    not exist yet if the transfer fires very early in the call).
      let voiceSession: any = null;
      if (context.callId) {
        try {
          voiceSession = await this.prisma.voiceSession.update({
            where: { callId: context.callId },
            data: {
              status: 'transferring',
              metadata: {
                transferDepartment: department,
                transferReason: reason,
                transferPriority: args?.priority ?? 'normal',
                transferredAt: new Date().toISOString(),
              },
            },
          });
        } catch (sessErr) {
          this.logger.debug(
            `VoiceSession not found for callId=${context.callId} — skipping status update: ${(sessErr as Error).message}`,
          );
        }
      }

      // 2. Send an IN_APP notification to the support team so the agent
      //    picking up the call has the context.
      const subject = `[Voice Transfer] ${DEPARTMENT_LABELS[department]} — ${reason.slice(0, 60)}`;
      const body = [
        `Department: ${DEPARTMENT_LABELS[department]}`,
        `Reason: ${reason}`,
        `Priority: ${args?.priority ?? 'normal'}`,
        args?.callSummary ? `Summary: ${args.callSummary}` : null,
        args?.customerName ? `Customer: ${args.customerName}` : null,
        args?.customerPhone ? `Callback: ${args.customerPhone}` : null,
        context.callId ? `Call ID: ${context.callId}` : null,
        context.phoneNumber ? `Caller: ${context.phoneNumber}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      try {
        await this.notificationsService.send({
          tenantId: context.tenantId,
          customerId: context.customerId ?? undefined,
          distributorId: context.distributorId ?? undefined,
          type: NotificationType.IN_APP,
          priority:
            args?.priority === 'urgent'
              ? NotificationPriority.URGENT
              : args?.priority === 'high'
                ? NotificationPriority.HIGH
                : NotificationPriority.NORMAL,
          subject,
          body,
          metadata: {
            event: 'voice.human_transfer',
            department,
            reason,
            callId: context.callId ?? null,
            sessionId: context.sessionId ?? null,
            conversationId: context.conversationId ?? null,
            voiceSessionId: voiceSession?.id ?? null,
          },
        });
      } catch (notifErr) {
        this.logger.warn(
          `Notification dispatch failed (non-fatal): ${(notifErr as Error).message}`,
        );
      }

      // 3. Best-effort audit interaction on the customer record.
      if (context.customerId) {
        try {
          await this.prisma.interaction.create({
            data: {
              tenantId: context.tenantId,
              customerId: context.customerId,
              userId: context.userId ?? '',
              type: 'CALL',
              subject: `Transferred to ${DEPARTMENT_LABELS[department]}`,
              description: reason,
              outcome: 'transferred',
              metadata: {
                department,
                priority: args?.priority ?? 'normal',
                callSummary: args?.callSummary ?? null,
                callId: context.callId ?? null,
              },
            },
          });
        } catch (auditErr) {
          this.logger.debug(
            `Failed to write transfer audit interaction: ${(auditErr as Error).message}`,
          );
        }
      }

      this.logger.log(
        `human_transfer complete → ${department} (session=${voiceSession?.id ?? 'none'})`,
      );

      // Resolve the destination phone number for THIS department from
      // env (VAPI_TRANSFER_PHONE_NUMBER_<DEPARTMENT>, falling back to
      // the single default) so Vapi can perform the actual SIP
      // transfer. When unset entirely, the tool still records the
      // intent (notification + audit row) but the caller is NOT
      // transferred — the operator must set at least
      // `VAPI_TRANSFER_PHONE_NUMBER` for transfers to take effect.
      const forwardingPhoneNumber = getDepartmentTransferPhoneNumber(department);

      return {
        success: true,
        data: {
          transferred: true,
          department,
          departmentLabel: DEPARTMENT_LABELS[department],
          priority: args?.priority ?? 'normal',
          voiceSessionId: voiceSession?.id ?? null,
          // Vapi reads `forwardingPhoneNumber` from the function-call
          // response and triggers the SIP transfer to this number.
          // Omitted when no env var is set so Vapi doesn't attempt to
          // transfer to `undefined`.
          ...(forwardingPhoneNumber
            ? { forwardingPhoneNumber }
            : {}),
        },
        speak:
          `I'm transferring you to ${DEPARTMENT_LABELS[department]} now. Please stay on the line — an agent will be with you shortly. Thank you for your patience.`,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`human_transfer failed: ${message}`);
      return {
        success: false,
        error: message,
        speak:
          "I'm having trouble transferring your call right now. Please hold while I try a different way to connect you.",
      };
    }
  }
}
