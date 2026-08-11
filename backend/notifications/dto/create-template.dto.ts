import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { NotificationType } from './send-notification.dto';

/**
 * Payload for {@link TemplatesService.create}.
 *
 * `code` is the stable identifier used by `handleEvent()` to look up the
 * template by name (e.g. `order.created`, `password.reset`). It's unique
 * per tenant.
 *
 * `body` and `bodyHtml` may contain `{{variable}}` placeholders that are
 * replaced by {@link TemplatesService.render} at send time. `variables`
 * is the documented list of supported placeholders
 * (e.g. `["orderNumber", "customerName", "total"]`).
 */
export class CreateTemplateDto {
  @IsString()
  @MaxLength(100)
  code: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
