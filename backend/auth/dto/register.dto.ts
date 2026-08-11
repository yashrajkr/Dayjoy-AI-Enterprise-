import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Password validation regex — kept in sync with
 * `PasswordPolicy.validate()` in `_shared/security/password.policy.ts`:
 * at least 8 chars, one uppercase, one lowercase, one digit, one special.
 *
 * The class-validator `@Matches` decorator only enforces a single regex,
 * so we use a lookahead-based pattern that asserts all four character
 * classes are present.
 */
const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

export const PASSWORD_VALIDATION_MESSAGE =
  'Password must be at least 8 characters long and contain uppercase, lowercase, a number, and a special character';

/**
 * Registration payload.
 *
 * The optional `tenantId` lets the registration endpoint place a new user
 * into a specific tenant. When omitted, the controller / service falls
 * back to the platform default tenant.
 *
 * `role` is intentionally NOT exposed on this DTO — registration always
 * creates a `user`-role account. Role escalation happens via the admin
 * endpoints (`admin/users/:id/role`) which require elevated permissions.
 */
export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_VALIDATION_MESSAGE })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
