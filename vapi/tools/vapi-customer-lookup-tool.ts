import { Injectable, Logger } from '@nestjs/common';
import { CustomersService } from '../../backend/customers/customers.service';
import type { VapiTool, ToolContext, ToolResult } from './vapi-tool-interface';

/**
 * VapiCustomerLookupTool — look up a customer by phone or email using
 * the real `CustomersService` (which queries the Prisma `Customer` table
 * directly).
 *
 * Returns the customer's name, type, lifetime value, total orders, and
 * last order date. When no customer matches, returns `{ found: false }`
 * and a `speak` field that asks the caller to provide their info so a
 * lead can be captured instead.
 *
 * Note: `CustomersService.findAll` uses `AuthenticatedUser` (with
 * `userId` + `tenantId`). We synthesise one from `ToolContext` so the
 * existing service can be reused without a signature change.
 */
@Injectable()
export class VapiCustomerLookupTool implements VapiTool {
  name = 'customer_lookup';
  description =
    'Look up an existing Dayjoy customer by phone number or email. ' +
    'Returns customer name, type, lifetime value, total orders, and ' +
    'last order date. Returns found=false when no match exists.';

  parameters = {
    type: 'object',
    properties: {
      phoneNumber: {
        type: 'string',
        description: 'Customer phone number (E.164 preferred: +91...).',
      },
      email: {
        type: 'string',
        description: 'Customer email address.',
      },
    },
    required: [],
  };

  private readonly logger = new Logger(VapiCustomerLookupTool.name);

  constructor(private readonly customersService: CustomersService) {}

  async execute(
    args: { phoneNumber?: string; email?: string },
    context: ToolContext,
  ): Promise<ToolResult> {
    const phone = (args?.phoneNumber ?? '').toString().trim();
    const email = (args?.email ?? '').toString().trim().toLowerCase();
    if (!phone && !email) {
      return {
        success: false,
        error: 'phoneNumber or email is required',
        speak:
          "I'd be happy to look up your account. Could you tell me the phone number or email on file?",
      };
    }
    if (!context.tenantId) {
      return { success: false, error: 'ToolContext.tenantId is required' };
    }

    try {
      this.logger.log(
        `customer_lookup(phone="${phone}", email="${email}", tenant=${context.tenantId})`,
      );

      // `CustomersService.findAll` accepts a search string; we feed the
      // more specific identifier (email > phone) so the search OR-clauses
      // match.
      const search = email || phone;
      const result: any = await this.customersService.findAll(
        { search, page: 1, limit: 5 } as any,
        {
          userId: context.userId ?? '',
          tenantId: context.tenantId,
        } as any,
      );

      const rows = (result?.data ?? []) as any[];
      // Verify the match is exact on email or phone — `findAll` uses
      // ILIKE contains, so we filter for an exact match client-side.
      const match = rows.find((c) => {
        if (email && c.email?.toLowerCase() === email) return true;
        if (phone && c.phone === phone) return true;
        return false;
      });

      if (!match) {
        return {
          success: true,
          data: { found: false },
          speak:
            "I couldn't find an account with that information. Would you like me to create a new lead so someone can follow up with you?",
        };
      }

      const lifetimeValue = Number(match.lifetimeStats?.lifetimeValue ?? 0);
      const totalOrders = Number(match.lifetimeStats?.totalOrders ?? 0);
      const lastOrderAt = match.lifetimeStats?.lastOrderAt ?? null;

      return {
        success: true,
        data: {
          found: true,
          customer: {
            id: match.id,
            firstName: match.firstName,
            lastName: match.lastName,
            email: match.email,
            phone: match.phone,
            customerType: match.customerType,
            status: match.status,
            lifetimeValue,
            totalOrders,
            lastOrderAt: lastOrderAt ? new Date(lastOrderAt).toISOString() : null,
          },
        },
        speak: this.formatForVoice(match, lifetimeValue, totalOrders, lastOrderAt),
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`customer_lookup failed: ${message}`);
      return {
        success: false,
        error: message,
        speak:
          "I'm having trouble looking up your account right now. Could you tell me your name so I can help you directly?",
      };
    }
  }

  private formatForVoice(
    customer: any,
    lifetimeValue: number,
    totalOrders: number,
    lastOrderAt: any,
  ): string {
    const name = [customer.firstName, customer.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const greeting = name
      ? `I found your account, ${name}.`
      : 'I found your account.';
    const orderInfo =
      totalOrders > 0
        ? ` You've placed ${totalOrders} order${totalOrders === 1 ? '' : 's'} with us${
            lastOrderAt
              ? ` — the last one on ${new Date(lastOrderAt).toLocaleDateString()}`
              : ''
          }.`
        : " I don't see any orders on your account yet.";
    return `${greeting}${orderInfo} How can I help you today?`;
  }
}
