import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { JwtBlocklistService } from '../../_shared/security/jwt-blocklist.service';
import { PrismaService } from '../../_shared/database/prisma.service';

/**
 * JWT strategy.
 *
 * In addition to the standard signature + expiry checks performed by
 * passport-jwt, this strategy:
 *
 *  1. Consults the {@link JwtBlocklistService} on every authenticated
 *     request so logged-out / revoked tokens are rejected across ALL
 *     replicas (state lives in Redis).
 *
 *  2. Loads the user's denormalised `role` from Prisma so downstream
 *     guards (RolesGuard, PermissionsGuard) have the current value
 *     rather than a stale snapshot baked into the JWT at sign time.
 *     This is the same pattern used by {@link PermissionsGuard} —
 *     load-from-DB on every request so role changes take effect
 *     immediately, not after the next token refresh.
 *
 * If the user has been deleted (or the tenant relation is broken) since
 * the token was issued, we reject the request with a 401.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly blocklist: JwtBlocklistService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload) {
    // 1. Reject revoked tokens. Old tokens without a jti are allowed
    //    through for backward compatibility (they'll expire naturally).
    if (payload.jti) {
      const blocked = await this.blocklist.isBlocked(payload.jti);
      if (blocked) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    // 2. Load the user's current role + status from Prisma. We only
    //    select the fields we need — keeps the query cheap.
    const user = await this.prisma.user
      .findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          tenantId: true,
          email: true,
          role: true,
          status: true,
        },
      })
      .catch(() => null);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role ?? undefined,
      jti: payload.jti,
    };
  }
}
