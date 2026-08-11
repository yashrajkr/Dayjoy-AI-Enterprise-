import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { AuthUser } from '../products/products.service';

/**
 * TemplatesService — CRUD + rendering for notification templates.
 *
 * A template is a reusable subject/body pair (with optional HTML body) that
 * can be parameterised with `{{variable}}` placeholders. At send time, the
 * NotificationsService looks up the template by `code`, calls `render()` to
 * substitute variables, and dispatches the resulting message.
 *
 * Templates are scoped per-tenant. The `code` is unique per tenant — the
 * same code can exist in different tenants with different content.
 */
@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthUser) {
    return this.prisma.notificationTemplate.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByCode(code: string, tenantId: string) {
    return this.prisma.notificationTemplate.findFirst({
      where: { code, tenantId },
    });
  }

  async findOne(id: string, user: AuthUser) {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { id },
    });
    if (!template || template.tenantId !== user.tenantId) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  async create(user: AuthUser, dto: CreateTemplateDto) {
    const existing = await this.prisma.notificationTemplate.findFirst({
      where: { code: dto.code, tenantId: user.tenantId },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        `Template with code "${dto.code}" already exists for this tenant`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const template = await tx.notificationTemplate.create({
        data: {
          tenantId: user.tenantId,
          code: dto.code,
          name: dto.name,
          type: dto.type as any,
          subject: dto.subject,
          body: dto.body,
          bodyHtml: dto.bodyHtml,
          subjectTemplate: dto.subject,
          contentTemplate: dto.body,
          variables: dto.variables ?? [],
          isActive: dto.isActive ?? true,
          status: 'active',
          metadata: dto.metadata,
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'INSERT',
          resourceType: 'NotificationTemplate',
          resourceId: template.id,
          newValues: { code: template.code, name: template.name },
        },
      });

      return template;
    });
  }

  async update(id: string, user: AuthUser, dto: UpdateTemplateDto) {
    const template = await this.findOne(id, user);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.notificationTemplate.update({
        where: { id: template.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.type !== undefined ? { type: dto.type as any } : {}),
          ...(dto.subject !== undefined
            ? { subject: dto.subject, subjectTemplate: dto.subject }
            : {}),
          ...(dto.body !== undefined ? { body: dto.body, contentTemplate: dto.body } : {}),
          ...(dto.bodyHtml !== undefined ? { bodyHtml: dto.bodyHtml } : {}),
          ...(dto.variables !== undefined ? { variables: dto.variables } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.metadata !== undefined ? { metadata: dto.metadata } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'UPDATE',
          resourceType: 'NotificationTemplate',
          resourceId: template.id,
          oldValues: { name: template.name, body: template.body },
          newValues: { name: updated.name, body: updated.body },
        },
      });

      return updated;
    });
  }

  /**
   * Soft delete — sets `isActive = false` and `status = 'archived'`.
   * Hard deletes are never performed from the application layer (existing
   * notifications that reference the template would lose their join).
   */
  async remove(id: string, user: AuthUser) {
    const template = await this.findOne(id, user);

    await this.prisma.$transaction(async (tx) => {
      await tx.notificationTemplate.update({
        where: { id: template.id },
        data: { isActive: false, status: 'archived' },
      });

      await tx.auditLog.create({
        data: {
          tenantId: user.tenantId,
          userId: user.userId,
          action: 'DELETE',
          resourceType: 'NotificationTemplate',
          resourceId: template.id,
          oldValues: { code: template.code, name: template.name },
        },
      });
    });

    return { success: true };
  }

  /**
   * Replace `{{variable}}` placeholders in `subject`, `body`, and
   * `bodyHtml` with the corresponding values from `variables`.
   *
   * Unknown placeholders (no matching key in `variables`) are left in
   * place — the caller can detect them by scanning for `{{` in the result.
   */
  render(
    template: { subject?: string | null; body: string; bodyHtml?: string | null },
    variables: Record<string, any>,
  ): { subject: string | null; body: string; bodyHtml: string | null } {
    const replace = (text: string | null | undefined): string | null => {
      if (text == null) return null;
      return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
        const value = variables[key];
        return value === undefined || value === null ? match : String(value);
      });
    };

    return {
      subject: replace(template.subject),
      body: replace(template.body) ?? '',
      bodyHtml: replace(template.bodyHtml),
    };
  }
}
