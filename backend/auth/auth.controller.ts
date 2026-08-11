import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  CurrentUser,
  Public,
  type AuthenticatedUser,
} from '../_shared/auth';

/**
 * Helper — extract the bearer token from the Authorization header.
 */
function extractBearerToken(authHeader?: string): string | undefined {
  if (!authHeader) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  return match?.[1];
}

/**
 * Helper — best-effort client IP extraction (honours X-Forwarded-For
 * when present, e.g. behind the nginx ingress controller).
 */
function extractClientIp(req: Request): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0]?.trim();
  }
  return req.ip;
}

/**
 * Authentication & authorization endpoints.
 *
 * All routes are prefixed `/api/auth`. Public endpoints (register, login,
 * refresh, password-reset, verify-email) are marked with `@Public()` so
 * the global JWT guard (when one is registered) skips them.
 *
 * Authenticated endpoints (logout, change-password, me) require a valid
 * access token in the `Authorization: Bearer <token>` header.
 */
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user account.
   *
   * Returns the new user's profile + access/refresh tokens.
   */
  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Authenticate with email + password.
   *
   * Returns access + refresh tokens on success. Rate-limited per email
   * and per IP; accounts are temporarily locked after 5 failed attempts.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.email, dto.password, extractClientIp(req));
  }

  /**
   * Exchange a refresh token for new access + refresh tokens.
   *
   * Token rotation: the supplied refresh token's session is revoked and
   * a fresh session is created.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  /**
   * Logout: blocklist the supplied access token's JTI and revoke the
   * corresponding session.
   */
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Headers('authorization') authorization?: string) {
    return this.authService.logout(extractBearerToken(authorization));
  }

  /**
   * Request a password-reset email.
   *
   * Always returns `{ success: true }` — even if the email doesn't
   * exist — to prevent user-enumeration attacks.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('request-password-reset')
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  /**
   * Reset password using a token received via email.
   *
   * Revokes all active sessions for the user on success.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /**
   * Verify the user's email address using a one-time token.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  /**
   * Change password for the authenticated user.
   *
   * Requires the user's current password. Revokes all other sessions on
   * success.
   */
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.userId,
      dto.oldPassword,
      dto.newPassword,
    );
  }

  /**
   * Return the authenticated user's profile.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.userId);
  }
}
