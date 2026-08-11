/**
 * Auth domain types — login, register, token, and current-user shapes.
 *
 * Mirrors the backend auth DTOs:
 *   - `backend/auth/dto/login.dto.ts`
 *   - `backend/auth/dto/register.dto.ts`
 * and the `AuthenticatedUser` returned by `POST /api/auth/login`.
 */

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: string;
  tenantId?: string;
  avatarUrl?: string;
  isActive?: boolean;
  isVerified?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  tokenType?: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  tokenType?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
  tenantId?: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tenantId?: string;
  /** Distributor-specific — the sponsor/distributor code of who referred them. */
  sponsorCode?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}
