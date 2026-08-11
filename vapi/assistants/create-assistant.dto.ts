import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Agent type for Vapi assistants. The Prisma `AgentType` enum already
 * includes `VOICE`, so we re-use it rather than redefining.
 */
export enum VapiAssistantType {
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

/**
 * DTO for `POST /api/voice/assistants`.
 *
 * `systemPrompt` is optional — when omitted, the service assembles a
 * default prompt from the four `vapi/prompts/` constants.
 */
export class CreateAssistantDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(VapiAssistantType)
  @IsOptional()
  type?: VapiAssistantType;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsString()
  @IsOptional()
  firstMessage?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  temperature?: number;

  @IsNumber()
  @Min(1)
  @Max(8000)
  @IsOptional()
  maxTokens?: number;

  @IsString()
  @IsOptional()
  voiceId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tools?: string[];
}

/**
 * DTO for `PUT /api/voice/assistants/:id`. All fields optional.
 */
export class UpdateAssistantDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsEnum(VapiAssistantType)
  @IsOptional()
  type?: VapiAssistantType;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsString()
  @IsOptional()
  firstMessage?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  temperature?: number;

  @IsNumber()
  @Min(1)
  @Max(8000)
  @IsOptional()
  maxTokens?: number;

  @IsString()
  @IsOptional()
  voiceId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tools?: string[];

  @IsString()
  @IsOptional()
  status?: 'active' | 'inactive';
}
