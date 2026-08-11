import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../_shared/database/prisma.service';
import { QueryAgentsDto } from './dto/query-agents.dto';
import { CreateAgentDto, UpdateAgentDto } from './dto/create-agent.dto';
import { AuthUser } from './auth-user';

/**
 * AI agents service — CRUD over the `AiAgent` table.
 *
 * Agents are tenant-scoped: every query filters by `tenantId` from the
 * authenticated user, so cross-tenant leakage is impossible at the
 * service layer (the global guard still verifies RBAC before this code
 * runs).
 *
 * `remove()` is a soft delete — it flips `status` to `archived` so
 * historical conversations/messages remain referentially intact.
 */
@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryAgentsDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId: user.tenantId };

    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [agents, total] = await Promise.all([
      this.prisma.aiAgent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.aiAgent.count({ where }),
    ]);

    return {
      data: agents,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: AuthUser) {
    const agent = await this.prisma.aiAgent.findUnique({ where: { id } });
    if (!agent || agent.tenantId !== user.tenantId) {
      throw new NotFoundException(`AI agent ${id} not found`);
    }
    return agent;
  }

  async create(dto: CreateAgentDto, user: AuthUser) {
    return this.prisma.aiAgent.create({
      data: {
        tenantId: user.tenantId!,
        name: dto.name,
        type: dto.type as any,
        description: dto.description,
        configuration: dto.configuration ?? undefined,
        capabilities: dto.capabilities ?? undefined,
        status: dto.status ?? 'active',
      },
    });
  }

  async update(id: string, dto: UpdateAgentDto, user: AuthUser) {
    const existing = await this.findOne(id, user);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type as any;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.configuration !== undefined) data.configuration = dto.configuration;
    if (dto.capabilities !== undefined) data.capabilities = dto.capabilities;
    if (dto.status !== undefined) data.status = dto.status;

    return this.prisma.aiAgent.update({
      where: { id: existing.id },
      data,
    });
  }

  /**
   * Soft-delete the agent — flip status to `archived` so historical
   * conversations still have a referentially valid `agentId`. Hard
   * deleting would orphan `Conversation` / `Message` / `AiMemory` rows.
   */
  async remove(id: string, user: AuthUser) {
    const existing = await this.findOne(id, user);
    await this.prisma.aiAgent.update({
      where: { id: existing.id },
      data: { status: 'archived' },
    });
    return { success: true, id: existing.id };
  }

  /**
   * List the tool capabilities declared on an agent's `capabilities`
   * JSON column. Returns `[]` when no capabilities are configured.
   */
  async getCapabilities(agentId: string, user: AuthUser) {
    const agent = await this.findOne(agentId, user);
    const caps = agent.capabilities as Record<string, any> | null;
    if (!caps) return { tools: [], allowedTools: [] };

    // Conventional shape: { tools: ['search_knowledge', ...], ... }
    if (Array.isArray(caps.tools)) {
      return { tools: caps.tools, allowedTools: caps.tools };
    }
    // Otherwise treat the object's top-level keys as capability names.
    return {
      tools: Object.keys(caps),
      allowedTools: Object.keys(caps),
    };
  }
}
