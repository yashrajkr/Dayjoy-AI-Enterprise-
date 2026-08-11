import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Visitor feedback on a specific assistant message.
 *
 * Recorded as an `AnalyticsEvent` (`eventType='chat_feedback'`) tied
 * to the conversation + message so the analytics dashboard can show
 * positive / negative / neutral ratios per agent / per channel.
 */
export type FeedbackValue = 'positive' | 'negative' | 'neutral';

export class FeedbackDto {
  /** The assistant message id being rated. */
  @IsString()
  @MaxLength(128)
  messageId!: string;

  /** The rating. */
  @IsEnum(['positive', 'negative', 'neutral'] as const)
  feedback!: FeedbackValue;

  /** Optional free-text comment (max 1000 chars). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
