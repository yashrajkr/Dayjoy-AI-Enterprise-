import { IsEnum, IsOptional, IsString, IsInt, Min, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Discriminator for the kind of AI agent. Persisted on `AiAgent.type` so
 * the analytics service can bucket conversations by agent type.
 *
 * Mirrors the `AgentType` enum in `database/prisma/schema.prisma` — kept
 * here as a TS enum so DTO validation rejects unknown values before they
 * reach Prisma.
 */
export enum AgentType {
  SUPPORT = 'SUPPORT',
  SALES = 'SALES',
  ONBOARDING = 'ONBOARDING',
  TECHNICAL = 'TECHNICAL',
  BILLING = 'BILLING',
  DISTRIBUTOR = 'DISTRIBUTOR',
  ADMIN = 'ADMIN',
  VOICE = 'VOICE',
  WHATSAPP = 'WHATSAPP',
  WEB = 'WEB',
}

export class CreateAgentDto {
  @IsString()
  name: string;

  @IsEnum(AgentType)
  type: AgentType;

  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Free-form JSON configuration blob. Conventional keys:
   *   - `systemPrompt: string` — seed prompt for the agent's LLM calls.
   *   - `model: string`        — OpenAI model override (defaults to `gpt-4o`).
   *   - `temperature: number`  — sampling temperature.
   */
  @IsOptional()
  @IsObject()
  configuration?: Record<string, any>;

  /**
   * Free-form JSON listing the tool names this agent is allowed to invoke.
   * Enforced by `ToolsService.execute()` — tools not in this list are
   * rejected with `BadRequestException`.
   */
  @IsOptional()
  @IsObject()
  capabilities?: Record<string, any>;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(AgentType)
  type?: AgentType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  configuration?: Record<string, any>;

  @IsOptional()
  @IsObject()
  capabilities?: Record<string, any>;

  @IsOptional()
  @IsString()
  status?: string;
}
