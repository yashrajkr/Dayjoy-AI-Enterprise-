import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Change-password payload — used by authenticated users who know their
 * current password and want to set a new one.
 *
 * Same strength rules on `newPassword` as {@link RegisterDto.password}.
 */
export class ChangePasswordDto {
  @IsString()
  @MaxLength(128)
  oldPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/,
    {
      message:
        'Password must be at least 8 characters long and contain uppercase, lowercase, a number, and a special character',
    },
  )
  newPassword: string;
}
