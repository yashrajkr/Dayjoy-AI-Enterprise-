import * as bcrypt from 'bcryptjs';

/**
 * Centralised password policy.
 *
 * Used by the auth service for both validation (registration, password reset,
 * password change) and the actual bcrypt hashing / verification. Keeping the
 * rules in one place guarantees that every entrypoint enforces the same
 * strength requirements.
 *
 * The bcrypt cost factor is fixed at 12 rounds — high enough to make brute
 * force impractical on commodity hardware while still being fast enough not
 * to dominate request latency on the auth endpoints.
 */
export class PasswordPolicy {
  private static readonly MIN_LENGTH = 8;
  private static readonly BCRYPT_ROUNDS = 12;

  /**
   * Validate that a password meets the platform's strength rules.
   *
   * @returns An object with `valid` and a list of human-readable `errors`
   *          describing every rule that was violated.
   */
  static validate(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (password.length < this.MIN_LENGTH) {
      errors.push(`Password must be at least ${this.MIN_LENGTH} characters`);
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Must contain uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Must contain lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Must contain a number');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Must contain a special character');
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Hash a password using bcrypt with the platform-standard cost factor.
   */
  static async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  /**
   * Verify a plaintext password against a stored bcrypt hash.
   */
  static async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
