import { Injectable, Logger } from '@nestjs/common';
import { DistributorsService } from '../../backend/distributors/distributors.service';
import type { VapiTool, ToolContext, ToolResult } from './vapi-tool-interface';

/**
 * VapiDistributorLookupTool — look up a distributor by distributor code
 * or phone using the real `DistributorsService`.
 *
 * Returns the distributor's name, code, tier, status, commission rate,
 * total orders, and revenue. When no match exists, returns
 * `{ found: false }` and a `speak` field that offers to capture a lead
 * (the caller may be a prospect).
 */
@Injectable()
export class VapiDistributorLookupTool implements VapiTool {
  name = 'distributor_lookup';
  description =
    'Look up an existing Dayjoy distributor by distributor code or ' +
    'phone number. Returns distributor name, tier, commission rate, ' +
    'total orders, and revenue. Returns found=false when no match exists.';

  parameters = {
    type: 'object',
    properties: {
      distributorCode: {
        type: 'string',
        description: 'Dayjoy distributor code (e.g. "DJ12345").',
      },
      phoneNumber: {
        type: 'string',
        description: 'Distributor phone number (E.164 preferred: +91...).',
      },
      email: {
        type: 'string',
        description: 'Distributor email address.',
      },
    },
    required: [],
  };

  private readonly logger = new Logger(VapiDistributorLookupTool.name);

  constructor(private readonly distributorsService: DistributorsService) {}

  async execute(
    args: { distributorCode?: string; phoneNumber?: string; email?: string },
    context: ToolContext,
  ): Promise<ToolResult> {
    const code = (args?.distributorCode ?? '').toString().trim();
    const phone = (args?.phoneNumber ?? '').toString().trim();
    const email = (args?.email ?? '').toString().trim().toLowerCase();
    if (!code && !phone && !email) {
      return {
        success: false,
        error: 'distributorCode, phoneNumber, or email is required',
        speak:
          "I'd be happy to look up your distributor account. Could you tell me your distributor code, phone number, or email?",
      };
    }
    if (!context.tenantId) {
      return { success: false, error: 'ToolContext.tenantId is required' };
    }

    try {
      this.logger.log(
        `distributor_lookup(code="${code}", phone="${phone}", email="${email}", tenant=${context.tenantId})`,
      );

      const search = code || phone || email;
      const result: any = await this.distributorsService.findAll(
        { search, page: 1, limit: 5 } as any,
        {
          userId: context.userId ?? '',
          tenantId: context.tenantId,
        } as any,
      );

      const rows = (result?.data ?? []) as any[];
      const match = rows.find((d) => {
        if (code && d.distributorCode === code) return true;
        if (email && d.email?.toLowerCase() === email) return true;
        if (phone && d.phone === phone) return true;
        return false;
      });

      if (!match) {
        return {
          success: true,
          data: { found: false },
          speak:
            "I couldn't find a distributor account with that information. Would you like me to connect you with our business development team to learn about becoming a distributor?",
        };
      }

      return {
        success: true,
        data: {
          found: true,
          distributor: {
            id: match.id,
            distributorCode: match.distributorCode,
            companyName: match.companyName,
            contactPerson: match.contactPerson,
            email: match.email,
            phone: match.phone,
            tier: match.tier,
            status: match.status,
            commissionRate: Number(match.commissionRate ?? 0),
            totalOrders: Number(match.totalOrders ?? 0),
            revenue: Number(match.revenue ?? 0),
            commissionEarned: Number(match.commissionEarned ?? 0),
          },
        },
        speak: this.formatForVoice(match),
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`distributor_lookup failed: ${message}`);
      return {
        success: false,
        error: message,
        speak:
          "I'm having trouble looking up your distributor account right now. Could you tell me your distributor code so I can help you directly?",
      };
    }
  }

  private formatForVoice(d: any): string {
    const name = d.contactPerson || d.companyName || 'there';
    const tier = d.tier ? `, ranked as ${d.tier}` : '';
    const orders =
      d.totalOrders > 0
        ? ` You've placed ${d.totalOrders} order${d.totalOrders === 1 ? '' : 's'} with us.`
        : '';
    return `I found your distributor account, ${name}${tier}. Your distributor code is ${d.distributorCode}.${orders} How can I help you with your business today?`;
  }
}
