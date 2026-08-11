import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Password reset payload — caller supplies the reset token (received via
 * email) and a new password that must satisfy the platform password
 * strength rules.
 */
export class ResetPasswordDto {
  @IsString()
  @MaxLength(255)
  token: string;

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
