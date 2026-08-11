export interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  email: string;
  /**
   * JWT ID — unique per token. Used by the JwtBlocklistService to support
   * logout / token revocation. Optional for backward compat with tokens
   * issued before the blocklist existed.
   */
  jti?: string;
}
