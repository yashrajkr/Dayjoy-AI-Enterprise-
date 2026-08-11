import type { CustomerRole } from "@/lib/constants";

/**
 * Auth & user types — consumed by `useAuth()` hook, the auth stores,
 * and all auth pages (login, register, OTP, reset password).
 */

export type UserStatus = "active" | "inactive" | "suspended" | "unverified";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
  role: CustomerRole | string;
  status: UserStatus;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  twoFactorEnabled: boolean;
  /** Customer record id (if different from auth user id). */
  customerId?: string;
  rewardPoints?: number;
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** ISO date string when the access token expires. */
  expiresAt?: string;
  tokenType?: string;
}

export interface AuthSession {
  user: User;
  tokens: AuthTokens;
}

// ===== DTOs =====

export interface LoginDto {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterDto {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  /** Optional referral / invite code. */
  referralCode?: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  token: string;
  password: string;
}

export interface VerifyOtpDto {
  email: string;
  otp: string;
  /** Distinguishes email-verification OTPs from login 2FA OTPs. */
  purpose?: "verify_email" | "login_2fa" | "reset_password";
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface ResendOtpDto {
  email: string;
  purpose?: VerifyOtpDto["purpose"];
}

// ===== API responses =====

export interface LoginResponse extends AuthSession {}

export interface RegisterResponse {
  user: User;
  /** Some flows require email verification before issuing tokens. */
  requiresVerification?: boolean;
  tokens?: AuthTokens;
}

export interface ForgotPasswordResponse {
  message: string;
  /** Token expiry hint for the UI countdown, if provided. */
  expiresInSeconds?: number;
}

export interface VerifyOtpResponse {
  message: string;
  tokens?: AuthTokens;
  user?: User;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}
