import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import Redis from 'ioredis';

import { PrismaService } from '../_shared/database/prisma.service';
import { JwtBlocklistService } from '../_shared/security/jwt-blocklist.service';
import { RateLimitService } from '../_shared/security/rate-limit.service';
import { REDIS_CLIENT } from '../_shared/security/redis.module';
import { PasswordPolicy } from '../_shared/security/password.policy';
import {
  NOTIFICATIONS_SERVICE,
  type NotificationsServiceLike,
} from './notifications-token';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

// ---------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------

/** Password reset token lifetime (1 hour, per task spec). */
const PASSWORD_RESET_TTL_SECONDS = 60 * 60; // 1 hour

/** Email verification token lifetime (24 hours). */
const EMAIL_VERIFICATION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

/** Refresh-token lifetime used when no JWT_EXPIRES_IN override is set. */
const DEFAULT_REFRESH_EXPIRES_IN = '7d';

/** Login rate-limit: max attempts per email per 15-minute window. */
const LOGIN_EMAIL_RATE_LIMIT = 10;
/** Login rate-limit: max attempts per IP per 15-minute window. */
const LOGIN_IP_RATE_LIMIT = 30;
/** Failed-password threshold after which the account is locked. */
const FAILED_LOGIN_LOCKOUT_THRESHOLD = 5;
/** Lockout window (15 minutes). */
const LOCKOUT_WINDOW_SECONDS = 15 * 60;

/** Default tenant ID used when a RegisterDto doesn't supply one. */
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID ?? 'default';

/** Default role name assigned to a newly-registered user. */
const DEFAULT_USER_ROLE = 'USER';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/**
 * Public-facing projection of a user record — strips `passwordHash` and
 * other internal fields before returning to the API consumer.
 */
interface PublicUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  tenantId: string;
  role: string | null;
  isEmailVerified: boolean;
  status: string;
  lastLoginAt: Date | null;
}

function toPublicUser(user: any): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    phone: user.phone ?? null,
    tenantId: user.tenantId,
    role: user.role ?? null,
    isEmailVerified: user.isEmailVerified ?? false,
    status: user.status ?? 'ACTIVE',
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

/**
 * SHA-256 hash a token identifier (JTI) so the value stored in the
 * `user_sessions.tokenHash` column isn't the raw JTI itself — defence
 * in depth in case the DB is ever exfiltrated.
 */
function hashJti(jti: string): string {
  return createHash('sha256').update(jti).digest('hex');
}

/**
 * Generate a URL-safe one-time token (used for password reset + email
 * verification tokens). 32 bytes of entropy → 64 hex chars.
 */
function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

// ---------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------

/**
 * Authentication service.
 *
 * Owns every auth flow: registration, login (with brute-force protection),
 * logout (access-token revocation), refresh (with session rotation),
 * password reset, email verification, and password change.
 *
 * Security infrastructure (provided by `_shared/security`):
 *  - {@link JwtBlocklistService} — Redis-backed JTI blocklist for logout
 *  - {@link RateLimitService} — Redis sliding-window rate limiter
 *  - `REDIS_CLIENT` — direct Redis access for the account-lockout key
 *
 * The service writes session rows to the `user_sessions` table so that
 * refresh / logout can revoke sessions even when the JWT itself hasn't
 * expired yet. The `tokenHash` column stores `sha256(jti)` — the same
 * JTI is carried by both the access and refresh token for a given
 * session, so either token can be used to look up the session.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly jwtSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly blocklist: JwtBlocklistService,
    private readonly rateLimit: RateLimitService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Optional() @Inject(NOTIFICATIONS_SERVICE)
    private readonly notifications?: NotificationsServiceLike,
  ) {
    this.jwtExpiresIn =
      this.configService.get<string>('jwt.expiresIn') ?? '24h';
    this.refreshExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') ??
      DEFAULT_REFRESH_EXPIRES_IN;
    this.jwtSecret = this.configService.get<string>('jwt.secret') ?? '';
  }

  // ====================================================================
  // Registration
  // ====================================================================

  /**
   * Register a new user.
   *
   * Flow:
   *  1. Validate password strength (defence in depth — DTO already checks)
   *  2. Check email is not already taken
   *  3. Hash password (bcrypt, 12 rounds)
   *  4. Create user row (status=ACTIVE, role='USER')
   *  5. Optionally create a Customer record (if role is 'customer' / default)
   *  6. Assign the default USER role via the user_roles join table
   *  7. Issue an email-verification token + queue the verification email
   *  8. Create a session and return access + refresh tokens
   */
  async register(dto: RegisterDto) {
    // 1. Validate password strength.
    const strength = PasswordPolicy.validate(dto.password);
    if (!strength.valid) {
      throw new BadRequestException(strength.errors);
    }

    // 2. Check email is not taken.
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    // 3. Hash password.
    const passwordHash = await PasswordPolicy.hash(dto.password);

    const tenantId = dto.tenantId ?? DEFAULT_TENANT_ID;

    // 4. Create user.
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        phone: dto.phone ?? null,
        tenantId,
        role: DEFAULT_USER_ROLE,
        status: 'ACTIVE',
        isEmailVerified: false,
      },
    });

    // 5. Create a Customer record for the new user (1-1 profile link).
    //    Best-effort — failures here don't roll back registration.
    try {
      await this.prisma.customer.create({
        data: {
          tenantId,
          userId: user.id,
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
          email: dto.email,
          phone: dto.phone ?? null,
          customerType: 'INDIVIDUAL',
          status: 'active',
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to create Customer record for user ${user.id}: ${message}`,
      );
    }

    // 6. Assign default USER role via user_roles join table (best-effort).
    await this.assignDefaultRole(user.id, tenantId).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to assign default role to user ${user.id}: ${message}`,
      );
    });

    // 7. Issue email-verification token + queue email.
    await this.issueEmailVerificationToken(user.id, tenantId, dto.email);

    // 8. Create session + tokens.
    const tokens = await this.createSessionAndTokens(user, undefined);

    return {
      user: toPublicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ====================================================================
  // Login
  // ====================================================================

  /**
   * Authenticate a user with email + password.
   *
   * Security features:
   *  - Per-email rate limit: 10 attempts / 15 min (RateLimitService)
   *  - Per-IP rate limit:    30 attempts / 15 min (RateLimitService)
   *  - Account lockout:      after 5 failed password checks, the account
   *                          is locked for 15 minutes (Redis key)
   *  - Existence hiding:     invalid email + invalid password return the
   *                          same error so attackers can't enumerate
   *                          registered emails.
   *
   * @param email  User-supplied email.
   * @param password User-supplied plaintext password.
   * @param ip     Client IP (from X-Forwarded-For or req.ip).
   */
  async login(email: string, password: string, ip?: string) {
    // 1. Per-email rate limit.
    const emailRl = await this.rateLimit.checkLimit(
      `auth:login:email:${email.toLowerCase()}`,
      LOGIN_EMAIL_RATE_LIMIT,
      900,
    );
    if (!emailRl.allowed) {
      throw new HttpException(
        'Too many login attempts for this email. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Per-IP rate limit.
    if (ip) {
      const ipRl = await this.rateLimit.checkLimit(
        `auth:login:ip:${ip}`,
        LOGIN_IP_RATE_LIMIT,
        900,
      );
      if (!ipRl.allowed) {
        throw new HttpException(
          'Too many login attempts from this IP. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // 3. Find user. Don't reveal whether the email exists.
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 4. Check account lockout (Redis key set after 5 failed attempts).
    const lockoutKey = `auth:lockout:email:${email.toLowerCase()}`;
    let isLocked = false;
    try {
      isLocked = (await this.redis.get(lockoutKey)) !== null;
    } catch (err) {
      // Fail OPEN on Redis error so a Redis hiccup doesn't lock everyone out.
      this.logger.error(
        `Redis error reading lockout key — failing open: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (isLocked) {
      throw new UnauthorizedException(
        'Account temporarily locked due to repeated failed login attempts. Try again later.',
      );
    }

    // 5. Check user status.
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is not active');
    }

    // 6. Verify password.
    const valid = await PasswordPolicy.verify(password, user.passwordHash);
    if (!valid) {
      // Track failed attempt using RateLimitService (limit 5, window 15 min).
      const failedRl = await this.rateLimit.checkLimit(
        `auth:failed:email:${email.toLowerCase()}`,
        FAILED_LOGIN_LOCKOUT_THRESHOLD,
        LOCKOUT_WINDOW_SECONDS,
      );
      if (!failedRl.allowed) {
        // 5+ failures → lock the account for 15 min.
        try {
          await this.redis.setex(lockoutKey, LOCKOUT_WINDOW_SECONDS, '1');
          this.logger.warn(
            `Account ${email} locked after ${failedRl.count} failed login attempts`,
          );
        } catch (err) {
          this.logger.error(
            `Redis error setting lockout key: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    // 7. Success: clear failed-attempt counters.
    try {
      await this.redis.del(
        `auth:failed:email:${email.toLowerCase()}`,
        lockoutKey,
      );
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to clear failed-attempt counters: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 8. Update lastLoginAt (best-effort).
    await this.prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
      .catch((err: Error) =>
        this.logger.warn(`Failed to update lastLoginAt: ${err.message}`),
      );

    // 9. Create session + tokens.
    const tokens = await this.createSessionAndTokens(user, ip);

    return {
      user: toPublicUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ====================================================================
  // Refresh
  // ====================================================================

  /**
   * Exchange a refresh token for new access + refresh tokens.
   *
   * Flow:
   *  1. Verify the refresh-token JWT (signature + expiry)
   *  2. Check the JTI isn't on the Redis blocklist (logout / revocation)
   *  3. Look up the session by `sha256(jti)` — must exist + not be expired
   *  4. Rotate: delete the old session, create a new one with a fresh JTI
   *  5. Issue new access + refresh tokens (both carry the new JTI)
   *
   * Token rotation means a stolen refresh token can be used at most once
   * before the legitimate user notices (their next refresh fails with
   * "session revoked") — at which point they re-authenticate and the
   * attacker's token is dead.
   */
  async refresh(dto: RefreshTokenDto) {
    // 1. Verify JWT signature + expiry.
    let decoded: JwtPayload & { jti?: string; exp?: number };
    try {
      decoded = this.jwtService.verify<
        JwtPayload & { jti?: string; exp?: number }
      >(dto.refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!decoded.jti) {
      throw new UnauthorizedException('Malformed refresh token (missing jti)');
    }

    // 2. Check JTI blocklist.
    const blocked = await this.blocklist.isBlocked(decoded.jti);
    if (blocked) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // 3. Look up session.
    const tokenHash = hashJti(decoded.jti);
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      throw new UnauthorizedException('Session has been revoked');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      // Cleanup expired session.
      await this.prisma.userSession
        .delete({ where: { id: session.id } })
        .catch(() => undefined);
      throw new UnauthorizedException('Session has expired');
    }

    // 4. Get the user (must still be active).
    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or inactive');
    }

    // 5. Rotate: delete old session (blocklisting the old JTI is optional
    //    but is defence-in-depth — if the old refresh token is stolen
    //    later, it can't be replayed).
    await this.prisma.userSession.delete({ where: { id: session.id } });
    if (decoded.exp) {
      await this.blocklist.block(decoded.jti, decoded.exp).catch((err: unknown) =>
        this.logger.warn(
          `Failed to blocklist rotated refresh JTI: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }

    // 6. Issue new tokens + new session.
    const tokens = await this.createSessionAndTokens(
      user,
      session.ipAddress ?? undefined,
    );

    return tokens;
  }

  // ====================================================================
  // Logout
  // ====================================================================

  /**
   * Logout: add the supplied access token's JTI to the Redis blocklist
   * and revoke the corresponding session row.
   *
   * The blocklist TTL is set to the token's remaining lifetime, so the
   * Redis key auto-expires when the token would have been unusable
   * anyway — the blocklist never grows unbounded.
   *
   * @param accessToken The `Bearer <token>` value (or just the JWT).
   *                    May be undefined — in that case we no-op.
   */
  async logout(accessToken?: string) {
    if (!accessToken) {
      return { success: true };
    }

    // Strip the "Bearer " prefix if present.
    const token = accessToken.startsWith('Bearer ')
      ? accessToken.slice(7)
      : accessToken;

    // Decode without verifying — even an expired token's JTI should be
    // blocklisted so a clock-skewed replica doesn't honour it.
    const decoded = this.jwtService.decode<
      JwtPayload & { jti?: string; exp?: number }
    >(token);

    if (!decoded || !decoded.jti) {
      return { success: true };
    }

    // 1. Add JTI to the Redis blocklist with TTL = remaining lifetime.
    if (decoded.exp) {
      await this.blocklist
        .block(decoded.jti, decoded.exp)
        .catch((err: unknown) =>
          this.logger.warn(
            `Failed to blocklist access JTI on logout: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    // 2. Revoke the session row (delete by tokenHash).
    const tokenHash = hashJti(decoded.jti);
    await this.prisma.userSession
      .deleteMany({ where: { tokenHash } })
      .catch((err: unknown) =>
        this.logger.warn(
          `Failed to revoke session on logout: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return { success: true };
  }

  // ====================================================================
  // Password reset
  // ====================================================================

  /**
   * Request a password reset token for the supplied email.
   *
   * Always returns `{ success: true }` — even if the email doesn't
   * exist — so an attacker can't enumerate registered addresses by
   * observing the response.
   *
   * If the user exists:
   *  1. Invalidate all existing unused reset tokens for the user
   *  2. Create a new token (1hr TTL)
   *  3. Queue the password-reset email notification (best-effort)
   */
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, tenantId: true, email: true, firstName: true },
    });

    if (!user) {
      // For security, do NOT reveal whether the user exists.
      return { success: true };
    }

    // 1. Invalidate existing unused tokens for this user.
    await this.prisma.passwordResetToken
      .updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `Failed to invalidate existing reset tokens: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    // 2. Create a new token (1 hour TTL).
    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_SECONDS * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // 3. Queue the password-reset email notification (best-effort).
    await this.sendNotificationBestEffort({
      tenantId: user.tenantId,
      userId: user.id,
      type: 'EMAIL',
      recipient: user.email,
      subject: 'Dayjoy Password Reset',
      body: `Hi ${user.firstName ?? 'there'},\n\nWe received a request to reset your Dayjoy password. Use the token below to choose a new password (valid for 1 hour):\n\n${token}\n\nIf you didn't request this, you can safely ignore this email.`,
      metadata: { token, action: 'password_reset' },
    });

    this.logger.log(
      `Password reset token issued for user ${user.id} (expires at ${expiresAt.toISOString()}).`,
    );

    return { success: true };
  }

  /**
   * Verify a password-reset token, then update the user's password and
   * invalidate the token.
   *
   * Side-effects:
   *  - Marks the token as used
   *  - Updates `users.passwordHash`
   *  - Revokes ALL active sessions for the user (force re-login on every device)
   *  - Queues a security notification email
   */
  async resetPassword(token: string, newPassword: string) {
    if (!token) {
      throw new BadRequestException('Invalid token');
    }

    // 1. Validate password strength (defence in depth).
    const strength = PasswordPolicy.validate(newPassword);
    if (!strength.valid) {
      throw new BadRequestException(strength.errors);
    }

    // 2. Look up the token.
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!stored) {
      throw new BadRequestException('Invalid or expired token');
    }

    if (stored.usedAt) {
      throw new BadRequestException('Token has already been used');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token has expired');
    }

    // 3. Hash the new password.
    const passwordHash = await PasswordPolicy.hash(newPassword);

    // 4. Atomically: update password + mark token used.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // 5. Revoke ALL sessions for this user (force re-login on every device).
    await this.revokeAllSessions(stored.userId);

    // 6. Queue security notification email (best-effort).
    const user = await this.prisma.user
      .findUnique({
        where: { id: stored.userId },
        select: { id: true, tenantId: true, email: true, firstName: true },
      })
      .catch(() => null);
    if (user) {
      await this.sendNotificationBestEffort({
        tenantId: user.tenantId,
        userId: user.id,
        type: 'EMAIL',
        recipient: user.email,
        subject: 'Your Dayjoy password was changed',
        body: `Hi ${user.firstName ?? 'there'},\n\nYour Dayjoy password was successfully reset. If this was you, no further action is needed. If you did NOT make this change, please contact support immediately.`,
        metadata: { action: 'password_reset_complete' },
      });
    }

    return { success: true };
  }

  // ====================================================================
  // Email verification
  // ====================================================================

  /**
   * Verify a user's email using a one-time verification token.
   *
   * Side-effects:
   *  - Sets `users.isEmailVerified = true`
   *  - Marks the token as used
   *  - Queues a welcome notification
   */
  async verifyEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Invalid token');
    }

    const stored = await this.prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!stored) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (stored.usedAt) {
      throw new BadRequestException('Verification token has already been used');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification token has expired');
    }

    // Mark email verified + token used, atomically.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { isEmailVerified: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Queue welcome notification (best-effort).
    const user = await this.prisma.user
      .findUnique({
        where: { id: stored.userId },
        select: { id: true, tenantId: true, email: true, firstName: true },
      })
      .catch(() => null);
    if (user) {
      await this.sendNotificationBestEffort({
        tenantId: user.tenantId,
        userId: user.id,
        type: 'EMAIL',
        recipient: user.email,
        subject: 'Welcome to Dayjoy!',
        body: `Hi ${user.firstName ?? 'there'},\n\nYour email has been verified. Welcome to Dayjoy — we're glad to have you on board!`,
        metadata: { action: 'email_verified' },
      });
    }

    return { success: true };
  }

  // ====================================================================
  // Change password (authenticated)
  // ====================================================================

  /**
   * Change password for an authenticated user.
   *
   * Flow:
   *  1. Load user
   *  2. Verify old password
   *  3. Validate new password strength
   *  4. Hash + update
   *  5. Revoke all OTHER sessions for the user (force re-login on every
   *     other device; the current session can optionally be preserved —
   *     we revoke everything for defence in depth).
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordHash) {
      throw new NotFoundException('User not found');
    }

    // Verify old password.
    const valid = await PasswordPolicy.verify(oldPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Validate new password strength.
    const strength = PasswordPolicy.validate(newPassword);
    if (!strength.valid) {
      throw new BadRequestException(strength.errors);
    }

    // Hash + update.
    const passwordHash = await PasswordPolicy.hash(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Revoke all sessions for this user (force re-login on every device).
    await this.revokeAllSessions(userId);

    return { success: true };
  }

  // ====================================================================
  // Profile
  // ====================================================================

  /**
   * Return the public profile of the authenticated user.
   *
   * @param userId The authenticated user's ID (from the JWT `sub` claim).
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  // ====================================================================
  // Internals
  // ====================================================================

  /**
   * Mint a fresh JWT pair (access + refresh) and persist a new
   * {@link UserSession} row keyed by `sha256(jti)`.
   *
   * Both tokens carry the same `jti` so either can be used to look up
   * the session for revocation.
   */
  private async createSessionAndTokens(
    user: {
      id: string;
      tenantId: string;
      email: string;
      role?: string | null;
    },
    ipAddress?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jti = randomBytes(16).toString('hex');
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      jti,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.jwtExpiresIn,
    });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.refreshExpiresIn,
    });

    // Decode the refresh token to get its actual `exp` (the JWT library
    // converts "7d" → epoch seconds for us).
    const decoded = this.jwtService.decode<{ exp?: number }>(refreshToken);
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const tokenHash = hashJti(jti);

    // Persist the session row. Best-effort — if it fails (e.g. unique
    // constraint violation because of a duplicate JTI, which is
    // cryptographically improbable), we still return the tokens; the
    // refresh flow will simply fail later if the session isn't found.
    await this.prisma.userSession
      .create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          tokenHash,
          ipAddress: ipAddress ?? null,
          expiresAt,
        },
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `Failed to persist session row for user ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
          ),
      );

    return { accessToken, refreshToken };
  }

  /**
   * Assign the default USER role to a freshly-registered user.
   *
   * Looks up the `Role` row named 'USER' in the user's tenant and creates
   * a `user_roles` row linking them. If the role doesn't exist (e.g. the
   * seed hasn't been run yet), the function silently no-ops — RBAC
   * checks will fall back to the denormalised `users.role` column.
   */
  private async assignDefaultRole(userId: string, tenantId: string) {
    const role = await this.prisma.role.findUnique({
      where: { tenantId_name: { tenantId, name: DEFAULT_USER_ROLE } },
    });
    if (!role) {
      this.logger.warn(
        `Default role '${DEFAULT_USER_ROLE}' not found in tenant ${tenantId} — skipping user_roles assignment`,
      );
      return;
    }
    await this.prisma.userRole.create({
      data: { userId, roleId: role.id, tenantId },
    });
  }

  /**
   * Issue an email-verification token for a user and queue the
   * verification email notification.
   */
  private async issueEmailVerificationToken(
    userId: string,
    tenantId: string,
    email: string,
  ): Promise<void> {
    const token = generateOpaqueToken();
    const expiresAt = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000,
    );

    await this.prisma.emailVerificationToken.create({
      data: { tenantId, userId, token, expiresAt },
    });

    await this.sendNotificationBestEffort({
      tenantId,
      userId,
      type: 'EMAIL',
      recipient: email,
      subject: 'Verify your Dayjoy email address',
      body: `Welcome to Dayjoy! Please verify your email address by entering the following token (valid for 24 hours):\n\n${token}\n\nIf you didn't create an account, you can safely ignore this email.`,
      metadata: { token, action: 'email_verification' },
    });

    this.logger.log(`Email verification token issued for user ${userId}.`);
  }

  /**
   * Delete all active sessions for a user. Used by resetPassword and
   * changePassword to force re-login on every device.
   */
  private async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.userSession
      .deleteMany({ where: { userId } })
      .catch((err: unknown) =>
        this.logger.warn(
          `Failed to revoke sessions for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  /**
   * Send a notification via {@link NotificationsService} if it's wired up.
   * Swallows all errors so a notification provider outage never breaks
   * the auth flow.
   */
  private async sendNotificationBestEffort(payload: {
    tenantId: string;
    userId: string;
    type: string;
    recipient: string;
    subject: string;
    body: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.notifications) {
      // NotificationsService is @Optional — when not wired up (e.g. unit
      // tests), we just log and move on.
      this.logger.log(
        `[notification.skip] ${payload.subject} → ${payload.recipient}`,
      );
      return;
    }

    try {
      await this.notifications.send({
        tenantId: payload.tenantId,
        userId: payload.userId,
        type: payload.type,
        recipient: payload.recipient,
        subject: payload.subject,
        body: payload.body,
        metadata: payload.metadata,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Notification send failed (${payload.subject} → ${payload.recipient}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// Re-exported for backward compatibility with legacy imports.
export interface TokenPayload extends JwtPayload {}
