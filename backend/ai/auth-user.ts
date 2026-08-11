/**
 * Authenticated principal shape.
 *
 * Mirrors what {@link JwtStrategy.validate()} puts on `request.user`:
 *   `{ userId, tenantId, email, jti }`.
 *
 * Defined in the AI module (rather than `_shared/`) so we don't have to touch
 * shared infrastructure — but imported across the AI/Knowledge/Analytics/Admin
 * modules as the canonical "current user" type for service method signatures.
 */
export interface AuthUser {
  userId?: string;
  tenantId?: string;
  email?: string;
  /** JWT id — present on tokens minted after the JTI rollout. */
  jti?: string;
  /**
   * Denormalized role field from `users.role`. Populated by some middleware
   * (not the JWT strategy on its own), but typed here so admin / analytics
   * services that consult `user.role` compile without `any`.
   */
  role?: string;
}
