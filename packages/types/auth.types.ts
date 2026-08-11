export interface AuthUser {
  id: string;
  email: string;
  tenantId: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  permissions: string[];
}

export interface JwtPayload {
  sub: string;        // user id
  email: string;
  tenantId: string;
  roles?: string[];
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}
