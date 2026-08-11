import { IsString, MaxLength } from 'class-validator';

/**
 * Body of `POST /api/website-chat/:sessionId/message`.
 *
 * The visitor's text message — capped at 1000 chars to match the
 * website chat widget's UX limit (long messages should be split into
 * multiple sends or routed to email).
 *
 * `contentType` is intentionally NOT configurable from the client —
 * website chat only supports text. Future versions may add file
 * uploads.
 */
export class SendMessageDto {
  @IsString()
  @MaxLength(1000)
  message!: string;
}
