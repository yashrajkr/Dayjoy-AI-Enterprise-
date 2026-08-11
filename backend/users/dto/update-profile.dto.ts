import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Payload for `PUT /api/users/me` — a user editing their OWN profile.
 *
 * Deliberately excludes `email`, `role`, and `status` so a non-admin
 * user cannot self-elevate or self-suspend. The route handler enforces
 * that the targeted user id matches `currentUser.userId`.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
