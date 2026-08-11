import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../backend/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../backend/_shared/auth/current-user.decorator';
import { RequirePermissions } from '../../backend/_shared/security/permissions.guard';
import { VapiAssistantService } from './vapi-assistant.service';
import { CreateAssistantDto, UpdateAssistantDto } from './create-assistant.dto';

/**
 * VapiAssistantController — REST CRUD for Vapi assistants.
 *
 * All routes are protected by `JwtAuthGuard` + the `voice:*` permission
 * family. Routes are mounted under `/api/voice/assistants` (the global
 * prefix `/api` is applied by `backend/main.ts`).
 *
 * Permission model:
 *   - voice:read   → GET endpoints
 *   - voice:update → POST / PUT / DELETE
 *
 * The actual PermissionsGuard registration happens at the
 * `app.module.ts` level (Agent E owns it) — this controller just
 * tags the metadata via `@RequirePermissions(...)`.
 *
 * `@CurrentUser()` is typed as `any` to match the existing scaffold's
 * convention (see `customers.controller.ts`); the service layer is
 * responsible for the strict `AuthUser` typing.
 */
@Controller('api/voice/assistants')
@UseGuards(JwtAuthGuard)
export class VapiAssistantController {
  constructor(private readonly assistantService: VapiAssistantService) {}

  @Get()
  @RequirePermissions('voice:read')
  async list(@CurrentUser() user: any) {
    const assistants = await this.assistantService.listAssistants(user);
    return { data: assistants, count: assistants.length };
  }

  @Get(':id')
  @RequirePermissions('voice:read')
  async get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.assistantService.getAssistant(id, user);
  }

  @Post()
  @RequirePermissions('voice:update')
  @HttpCode(201)
  async create(@Body() dto: CreateAssistantDto, @CurrentUser() user: any) {
    return this.assistantService.createAssistant(dto, user);
  }

  @Put(':id')
  @RequirePermissions('voice:update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssistantDto,
    @CurrentUser() user: any,
  ) {
    return this.assistantService.updateAssistant(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions('voice:update')
  @HttpCode(200)
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    return this.assistantService.deleteAssistant(id, user);
  }
}
