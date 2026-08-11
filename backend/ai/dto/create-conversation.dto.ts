import { IsEnum, IsOptional, IsString } from 'class-validator';

/**
 * Channel that a conversation originates on. Persisted on
 * `Conversation.channel`. Mirrors the `ChannelType` Prisma enum.
 */
export enum ChannelType {
  VOICE = 'VOICE',
  WHATSAPP = 'WHATSAPP',
  WEB = 'WEB',
  API = 'API',
}

export class CreateConversationDto {
  @IsString()
  agentId: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsEnum(ChannelType)
  channel: ChannelType;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  context?: string; // JSON-encoded; service coerces to object.
}
