import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { TemplatesService } from './templates.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../_shared/common/decorators/current-user.decorator';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../_shared/security/permissions.guard';

/**
 * Notifications HTTP surface.
 *
 * Two route groups:
 *  - Inbox (current-user): `/api/notifications`, `/api/notifications/unread-count`,
 *    `/api/notifications/:id`, `/api/notifications/:id/read`,
 *    `/api/notifications/mark-all-read`, `DELETE /api/notifications/:id`,
 *    `/api/notifications/preferences`
 *  - Templates (admin): `/api/notifications/templates` (CRUD) — requires
 *    the `notifications:manage_templates` permission.
 *
 * Route ordering: `/unread-count`, `/mark-all-read`, `/preferences`, and
 * `/templates` are declared BEFORE `/:id` so NestJS doesn't interpret
 * `unread-count` as a UUID.
 */
@Controller('api/notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly templatesService: TemplatesService,
  ) {}

  // ---------------------------------------------------------------------
  // Inbox (current-user) — declared first to win over /:id
  // ---------------------------------------------------------------------

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: QueryNotificationsDto) {
    return this.notificationsService.findAll(user, query);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadCount(user);
  }

  @Post('mark-all-read')
  async markAllAsRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllAsRead(user);
  }

  @Get('preferences')
  async getPreferences(@CurrentUser() user: any) {
    return this.notificationsService.getPreferences(user);
  }

  @Put('preferences')
  async updatePreferences(
    @CurrentUser() user: any,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(user, dto);
  }

  // ---------------------------------------------------------------------
  // Templates (admin) — also declared before /:id
  // ---------------------------------------------------------------------

  @Get('templates')
  @RequirePermissions('notifications:manage_templates')
  async listTemplates(@CurrentUser() user: any) {
    return this.templatesService.findAll(user);
  }

  @Post('templates')
  @RequirePermissions('notifications:manage_templates')
  async createTemplate(@CurrentUser() user: any, @Body() dto: CreateTemplateDto) {
    return this.templatesService.create(user, dto);
  }

  @Get('templates/:id')
  @RequirePermissions('notifications:manage_templates')
  async getTemplate(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.findOne(id, user);
  }

  @Put('templates/:id')
  @RequirePermissions('notifications:manage_templates')
  async updateTemplate(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templatesService.update(id, user, dto);
  }

  @Delete('templates/:id')
  @RequirePermissions('notifications:manage_templates')
  async deleteTemplate(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.templatesService.remove(id, user);
  }

  // ---------------------------------------------------------------------
  // Single notification (inbox)
  // ---------------------------------------------------------------------

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.findOne(id, user);
  }

  @Patch(':id/read')
  async markAsRead(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.markAsRead(id, user);
  }

  @Delete(':id')
  async delete(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.delete(id, user);
  }
}
