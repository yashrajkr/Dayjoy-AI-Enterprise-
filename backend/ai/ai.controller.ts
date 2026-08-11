import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../_shared/security/permissions.guard';
import { CurrentUser } from '../_shared/common/decorators/current-user.decorator';
import { AiService } from './ai.service';
import { ConversationsService } from './conversations.service';
import { MemoryService } from './memory.service';
import { ToolsService } from './tools.service';
import { QueryAgentsDto } from './dto/query-agents.dto';
import { CreateAgentDto, UpdateAgentDto } from './dto/create-agent.dto';
import { QueryConversationsDto } from './dto/query-conversations.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { QueryHistoryDto } from './dto/query-history.dto';
import { CreateMemoryDto, UpdateMemoryDto, QueryMemoryDto } from './dto/memory.dto';
import { ExecuteToolDto } from './dto/execute-tool.dto';
import { AuthUser } from './auth-user';

/**
 * AI feature controller — exposes the agent registry, conversation
 * lifecycle, memory CRUD, and tool registry under `/api/ai`.
 *
 * Auth model: `JwtAuthGuard` enforces authentication on every route;
 * `PermissionsGuard` (registered per-controller since it is not in the
 * global APP_GUARD chain) enforces fine-grained RBAC via
 * `@RequirePermissions('ai:read' | 'ai:create' | 'ai:update' |
 * 'ai:delete' | 'ai:chat')`.
 */
@Controller('api/ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly conversationsService: ConversationsService,
    private readonly memoryService: MemoryService,
    private readonly toolsService: ToolsService,
  ) {}

  // ===================================================================
  // Agents — `/api/ai/agents`
  // ===================================================================

  @Get('agents')
  @RequirePermissions('ai:read')
  async findAllAgents(@CurrentUser() user: AuthUser, @Query() query: QueryAgentsDto) {
    return this.aiService.findAll(query, user);
  }

  @Get('agents/:id')
  @RequirePermissions('ai:read')
  async findOneAgent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.aiService.findOne(id, user);
  }

  @Post('agents')
  @RequirePermissions('ai:create')
  async createAgent(@CurrentUser() user: AuthUser, @Body() dto: CreateAgentDto) {
    return this.aiService.create(dto, user);
  }

  @Put('agents/:id')
  @RequirePermissions('ai:update')
  async updateAgent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.aiService.update(id, dto, user);
  }

  @Delete('agents/:id')
  @RequirePermissions('ai:delete')
  async removeAgent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.aiService.remove(id, user);
  }

  @Get('agents/:id/capabilities')
  @RequirePermissions('ai:read')
  async getAgentCapabilities(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.aiService.getCapabilities(id, user);
  }

  // ===================================================================
  // Conversations — `/api/ai/conversations`
  // ===================================================================

  @Get('conversations')
  @RequirePermissions('ai:read')
  async findAllConversations(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryConversationsDto,
  ) {
    return this.conversationsService.findAll(query, user);
  }

  @Get('conversations/:id')
  @RequirePermissions('ai:read')
  async findOneConversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversationsService.findOne(id, user);
  }

  @Post('conversations')
  @RequirePermissions('ai:chat')
  async createConversation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.create(dto, user);
  }

  @Post('conversations/:id/messages')
  @RequirePermissions('ai:chat')
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(id, dto, user);
  }

  @Post('conversations/:id/end')
  @RequirePermissions('ai:chat')
  async endConversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversationsService.endConversation(id, user);
  }

  @Get('conversations/:id/history')
  @RequirePermissions('ai:read')
  async getConversationHistory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() query: QueryHistoryDto,
  ) {
    return this.conversationsService.getHistory(id, query, user);
  }

  @Delete('conversations/:id')
  @RequirePermissions('ai:chat')
  async deleteConversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversationsService.deleteConversation(id, user);
  }

  // ===================================================================
  // Memory — `/api/ai/memory`
  // ===================================================================

  @Get('memory')
  @RequirePermissions('ai:read')
  async findAllMemory(@CurrentUser() user: AuthUser, @Query() query: QueryMemoryDto) {
    return this.memoryService.findAll(query, user);
  }

  @Get('memory/user/:userId')
  @RequirePermissions('ai:read')
  async findUserMemory(@CurrentUser() user: AuthUser, @Param('userId') userId: string) {
    return this.memoryService.getByUser(userId, user);
  }

  @Get('memory/customer/:customerId')
  @RequirePermissions('ai:read')
  async findCustomerMemory(
    @CurrentUser() user: AuthUser,
    @Param('customerId') customerId: string,
  ) {
    return this.memoryService.getByCustomer(customerId, user);
  }

  @Post('memory')
  @RequirePermissions('ai:update')
  async createMemory(@CurrentUser() user: AuthUser, @Body() dto: CreateMemoryDto) {
    return this.memoryService.create(dto, user);
  }

  @Put('memory/:id')
  @RequirePermissions('ai:update')
  async updateMemory(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMemoryDto,
  ) {
    return this.memoryService.update(id, dto, user);
  }

  @Delete('memory/:id')
  @RequirePermissions('ai:update')
  async removeMemory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.memoryService.remove(id, user);
  }

  // ===================================================================
  // Tools — `/api/ai/tools`
  // ===================================================================

  @Get('tools')
  @RequirePermissions('ai:read')
  async listTools() {
    return this.toolsService.listTools();
  }

  @Post('tools/:toolName/execute')
  @RequirePermissions('ai:chat')
  async executeTool(
    @CurrentUser() user: AuthUser,
    @Param('toolName') toolName: string,
    @Body() dto: ExecuteToolDto,
  ) {
    // When a `conversationId` is supplied, route through
    // `executeForConversation` so the call is recorded as a
    // `tool_execution` analytics event for the conversation.
    if (dto.conversationId) {
      return this.toolsService.executeForConversation(
        dto.conversationId,
        toolName,
        dto.args ?? {},
        user,
      );
    }
    return this.toolsService.execute(toolName, dto.args ?? {}, user);
  }
}
