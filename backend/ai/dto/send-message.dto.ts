import { IsOptional, IsString } from 'class-validator';

/**
 * Body of `POST /api/ai/conversations/:id/messages`.
 *
 * The `conversationId` is taken from the URL param — not the body — so the
 * DTO only carries the inbound turn payload.
 *
 * `role` defaults to `user` server-side; assistant turns are produced by the
 * LLM via `ConversationsService.sendMessage()`. The field is still accepted
 * for flexibility (system-injected prompts, tool responses, etc.).
 */
export class SendMessageDto {
  @IsOptional()
  @IsString()
  role?: string; // user | assistant | system — defaults to `user`

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  contentType?: string; // text | markdown | audio | image — defaults to `text`
}
