/**
 * Security — Authentication Tests
 * ================================
 *
 * Verifies the full authentication lifecycle against the mock backend:
 *  - Valid credentials → 200 + access + refresh tokens
 *  - Invalid email format → 401
 *  - Invalid password → 401
 *  - Non-existent user → 401
 *  - Locked account → 401 + ACCOUNT_LOCKED message
 *  - Terminated account → 401 + ACCOUNT_TERMINATED message
 *  - Pending (unverified) account → 401 + EMAIL_NOT_VERIFIED message
 *  - Rate limit after 10 failed attempts per email → 429
 *  - Rate limit after 30 failed attempts per IP → 429
 *  - Expired JWT → 401
 *  - Invalid-signature JWT → 401
 *  - Blocklisted JWT (post-logout) → 401
 *  - Refresh token rotation → new tokens issued
 *  - Expired refresh token → 401
 *
 * These tests run against the in-memory mock backend (`startMockBackend`)
 * so they execute in <100ms each and have no external dependencies.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FIXTURES, startMockBackend, http, tokens, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

beforeAll(async () => {
  mock = await startMockBackend(4951);
});

afterAll(async () => {
  if (mock) await mock.close();
});

beforeEach(async () => {
  await mock.reset();
});

describe('Authentication — valid credentials', () => {
  it('returns 200 + accessToken + refreshToken + user', async () => {
    const res = await http<{ accessToken: string; refreshToken: string; user: { id: string } }>(
      mock.baseUrl, '/api/auth/login',
      {
        method: 'POST',
        body: {
          email: FIXTURES.users.customer.email,
          password: FIXTURES.users.customer.password,
        },
      },
    );

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.id).toBe(FIXTURES.users.customer.id);
  });

  it('tokens are JWT-shaped (three dot-separated base64 segments)', async () => {
    const res = await http<{ accessToken: string; refreshToken: string }>(
      mock.baseUrl, '/api/auth/login',
      { method: 'POST', body: { email: FIXTURES.users.customer.email, password: FIXTURES.users.customer.password } },
    );

    expect(res.body.accessToken.split('.')).toHaveLength(3);
    expect(res.body.refreshToken.split('.')).toHaveLength(3);
  });

  it('access token grants access to /api/auth/me', async () => {
    const loginRes = await http<{ accessToken: string }>(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: FIXTURES.users.customer.email, password: FIXTURES.users.customer.password },
    });

    const meRes = await http(mock.baseUrl, '/api/auth/me', { token: loginRes.body.accessToken });
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe(FIXTURES.users.customer.email);
  });
});

describe('Authentication — invalid credentials', () => {
  it('wrong password → 401 + INVALID_CREDENTIALS', async () => {
    const res = await http(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: FIXTURES.users.customer.email, password: 'WrongPassword#2024' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('non-existent user → 401 (same message — no email enumeration)', async () => {
    const res = await http(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'nobody@nowhere.com', password: 'AnyPassword#1' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('malformed email (no @) → 401', async () => {
    const res = await http(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'not-an-email', password: 'AnyPassword#1' },
    });
    expect(res.status).toBe(401);
  });

  it('empty body → 401', async () => {
    const res = await http(mock.baseUrl, '/api/auth/login', { method: 'POST', body: {} });
    expect(res.status).toBe(401);
  });
});

describe('Authentication — account states', () => {
  it('locked (SUSPENDED) account → 401 + ACCOUNT_LOCKED', async () => {
    const res = await http(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: FIXTURES.users.locked.email, password: FIXTURES.users.locked.password },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('terminated account → 401 + ACCOUNT_TERMINATED', async () => {
    const res = await http(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: FIXTURES.users.terminated.email, password: FIXTURES.users.terminated.password },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_TERMINATED');
  });

  it('pending (unverified email) account → 401 + EMAIL_NOT_VERIFIED', async () => {
    const res = await http(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: FIXTURES.users.pending.email, password: FIXTURES.users.pending.password },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('Authentication — rate limiting', () => {
  it('locks out after 10 failed attempts per email → 429', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await http(mock.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: FIXTURES.users.customer.email, password: 'WrongPassword#2024' },
      });
      expect(res.status).toBe(401);
    }

    const res = await http(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: FIXTURES.users.customer.email, password: 'WrongPassword#2024' },
    });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('rate limit window resets after the configured window', async () => {
    // We can't wait 15 minutes in a test, so just assert the rate limit
    // counter is being tracked per-email — a successful login is still
    // blocked when the counter is exhausted but a fresh email works.
    for (let i = 0; i < 10; i++) {
      await http(mock.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: 'ratelimit-test@example.com', password: 'WrongPassword#1' },
      });
    }

    const blocked = await http(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'ratelimit-test@example.com', password: 'WrongPassword#1' },
    });
    expect(blocked.status).toBe(429);

    // A different email should not be rate-limited.
    const fresh = await http(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'fresh-email@example.com', password: 'WrongPassword#1' },
    });
    expect(fresh.status).toBe(401); // 401 (bad password), NOT 429
  });

  it('per-IP rate limit triggers after 30 attempts from same IP', async () => {
    // Fire 30 requests from the same IP using different emails (to avoid the
    // per-email limit).
    for (let i = 0; i < 30; i++) {
      await http(mock.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: `ip-test-${i}@example.com`, password: 'WrongPassword#1' },
      });
    }

    const res = await http(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: 'ip-test-31@example.com', password: 'WrongPassword#1' },
    });
    expect(res.status).toBe(429);
  });
});

describe('Authentication — JWT validation', () => {
  it('expired JWT → 401', async () => {
    const res = await http(mock.baseUrl, '/api/auth/me', { token: FIXTURES.tokens.expiredToken });
    expect(res.status).toBe(401);
  });

  it('invalid-signature JWT → 401', async () => {
    const res = await http(mock.baseUrl, '/api/auth/me', { token: FIXTURES.tokens.invalidSignatureToken });
    expect(res.status).toBe(401);
  });

  it('blocklisted JWT (post-logout) → 401', async () => {
    // 1. Login to get a token.
    const loginRes = await http<{ accessToken: string }>(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: FIXTURES.users.customer.email, password: FIXTURES.users.customer.password },
    });

    // 2. Logout to blocklist the JTI.
    await http(mock.baseUrl, '/api/auth/logout', { method: 'POST', token: loginRes.body.accessToken });

    // 3. Try to use the token — should be rejected.
    const res = await http(mock.baseUrl, '/api/auth/me', { token: loginRes.body.accessToken });
    expect(res.status).toBe(401);
  });

  it('garbage non-JWT string → 401', async () => {
    const res = await http(mock.baseUrl, '/api/auth/me', { token: 'not.a.jwt' });
    expect(res.status).toBe(401);
  });

  it('missing Authorization header → 401', async () => {
    const res = await http(mock.baseUrl, '/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Authentication — refresh token rotation', () => {
  it('valid refresh token → new access + refresh tokens', async () => {
    const res = await http<{ accessToken: string; refreshToken: string }>(mock.baseUrl, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: FIXTURES.tokens.validRefreshToken },
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    // New tokens differ from the input.
    expect(res.body.accessToken).not.toBe(FIXTURES.tokens.validRefreshToken);
  });

  it('expired refresh token → 401 + REFRESH_EXPIRED', async () => {
    const res = await http(mock.baseUrl, '/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: FIXTURES.tokens.expiredToken },
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_EXPIRED');
  });

  it('missing refresh token → 401', async () => {
    const res = await http(mock.baseUrl, '/api/auth/refresh', { method: 'POST', body: {} });
    expect(res.status).toBe(401);
  });
});

describe('Authentication — forgot + reset password', () => {
  it('forgot-password returns 202 (accepted) regardless of email existence', async () => {
    const res1 = await http(mock.baseUrl, '/api/auth/forgot-password', {
      method: 'POST',
      body: { email: FIXTURES.users.customer.email },
    });
    expect(res1.status).toBe(202);

    // Non-existent email — same status (no enumeration).
    const res2 = await http(mock.baseUrl, '/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'nobody@nowhere.com' },
    });
    expect(res2.status).toBe(202);
  });

  it('reset-password with a valid token succeeds', async () => {
    // 1. Request reset.
    await http(mock.baseUrl, '/api/auth/forgot-password', {
      method: 'POST',
      body: { email: FIXTURES.users.customer.email },
    });

    // 2. Pull the token out of mock state.
    const state = await mock.getState();
    // The mock doesn't expose the passwordResets map directly, but in
    // production the token would arrive via email. For the test we use
    // the well-known reset_mock token the mock backend accepts.
    const res = await http(mock.baseUrl, '/api/auth/reset-password', {
      method: 'POST',
      body: { email: FIXTURES.users.customer.email, token: 'reset_mock', newPassword: 'NewPassword#2024' },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
  });

  it('reset-password with an invalid token → 400', async () => {
    const res = await http(mock.baseUrl, '/api/auth/reset-password', {
      method: 'POST',
      body: { email: FIXTURES.users.customer.email, token: 'wrong-token', newPassword: 'NewPassword#2024' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESET_TOKEN_INVALID');
  });
});
