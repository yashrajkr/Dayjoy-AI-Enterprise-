import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body of `POST /api/website-chat/init`.
 *
 * Initializes a new website chat session. The visitor can be:
 *   - Fully anonymous (no `visitorId`, no `userId`) — a new visitor id
 *     is generated server-side.
 *   - A returning visitor (caller passes the `visitorId` cookie set on
 *     a prior visit).
 *   - A logged-in user (caller passes a JWT in the Authorization
 *     header AND the `userId` it decodes to).
 *
 * `pageUrl` + `referrer` are recorded on the `WebSession` row so the
 * analytics dashboard can break down chat starts by landing page.
 */
export class InitSessionDto {
  /** Visitor cookie id (anonymous). Server generates one when omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  visitorId?: string;

  /** Logged-in user id (only set when the caller passes a JWT). */
  @IsOptional()
  @IsString()
  userId?: string;

  /** URL of the page the chat was opened on. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pageUrl?: string;

  /** Referrer URL (document.referrer on the client). */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  referrer?: string;

  /** Visitor's user-agent (auto-captured when not supplied). */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  /** Visitor's IP address (auto-captured when not supplied). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ipAddress?: string;
}
