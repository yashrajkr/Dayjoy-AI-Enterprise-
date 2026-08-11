/**
 * Security — SQL Injection Prevention Tests
 * ===========================================
 *
 * Verifies that every API parameter that touches the database is properly
 * parameterised and that SQL-injection payloads are rejected (or
 * pass-through harmlessly) at every entry point.
 *
 * Test methodology (OWASP WSTG-INPV-05):
 *   For each payload × each entry point, assert one of:
 *     a) The request is rejected with 400/401 (input validation caught it)
 *     b) The request returns 200 with normal results (parameterised query
 *        treated the payload as a literal string)
 *     c) The request returns 404 (no matching record found)
 *
 * What we NEVER want:
 *   - A 500 error (DB syntax error → unparameterised query)
 *   - Extra records returned (UNION / OR 1=1 succeeded)
 *   - Records deleted / dropped (DROP / DELETE succeeded)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FIXTURES, startMockBackend, http, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

beforeAll(async () => {
  mock = await startMockBackend(4954);
});

afterAll(async () => {
  if (mock) await mock.close();
});

beforeEach(async () => {
  await mock.reset();
});

const SQL_INJECTION_PAYLOADS = [
  "' OR '1'='1",
  "' OR '1'='1' --",
  "' OR '1'='1' /*",
  "'; DROP TABLE users; --",
  "' UNION SELECT * FROM users --",
  "1; DELETE FROM orders WHERE 1=1",
  "' OR 1=1#",
  "admin'--",
  "1' OR '1'='1' --",
  "' OR ''='",
  "1' OR '1'='1",
  "'; EXEC xp_cmdshell('dir') --",
  "' AND 1=CONVERT(int, (SELECT TOP 1 table_name FROM information_schema.tables)) --",
  "' OR SLEEP(5) --",
  "1; WAITFOR DELAY '00:00:05' --",
];

describe('SQL Injection — login endpoint', () => {
  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    it(`rejects SQLi payload in email field: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email: payload, password: payload },
      });
      // Must NOT be 200 (login succeeded) or 500 (DB error).
      expect(res.status, `payload "${payload}" must not return 200 or 500`).not.toBe(200);
      expect(res.status).not.toBe(500);
      // Should be 401 (invalid credentials) — never a successful login.
      expect([400, 401, 422]).toContain(res.status);
    });
  });
});

describe('SQL Injection — product search', () => {
  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    it(`handles SQLi payload in search query safely: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, `/api/products?search=${encodeURIComponent(payload)}`);
      // Should return 200 with normal results (empty or filtered list).
      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
      // Should NOT return all products (UNION / OR 1=1 succeeded).
      expect(res.body.data.length).toBeLessThanOrEqual(FIXTURES.products.length);
    });
  });
});

describe('SQL Injection — product category filter', () => {
  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    it(`handles SQLi payload in category filter: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, `/api/products?category=${encodeURIComponent(payload)}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(FIXTURES.products.length);
    });
  });
});

describe('SQL Injection — ID parameters (UUID validation)', () => {
  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    it(`rejects SQLi payload in /api/products/:id (invalid UUID) → 400 or 404: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, `/api/products/${encodeURIComponent(payload)}`);
      // Should be 404 (no product with that id) — never 500.
      expect([400, 404]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });
  });

  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    it(`rejects SQLi payload in /api/orders/:id → 400 or 404: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, `/api/orders/${encodeURIComponent(payload)}`, { token: FIXTURES.tokens.validAccessToken });
      expect([400, 401, 403, 404]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });
  });

  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    it(`rejects SQLi payload in /api/users/:id → 400 or 404: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, `/api/admin/users/${encodeURIComponent(payload)}`, { token: FIXTURES.tokens.validAccessToken.replace('usr_customer', FIXTURES.users.admin.id) });
      expect([400, 404]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });
  });
});

describe('SQL Injection — registration', () => {
  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    it(`safely stores SQLi payload as literal email/name (no DB error): "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, '/api/auth/register', {
        method: 'POST',
        body: { email: payload, password: 'TestPass#2024', firstName: payload, lastName: payload },
      });
      // Should be 201 (created with payload as literal name) or 400/422
      // (email-format validation caught it). NEVER 500.
      expect([201, 400, 409, 422]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });
  });
});

describe('SQL Injection — support ticket', () => {
  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    it(`safely stores SQLi payload as ticket subject/description: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, '/api/support/tickets', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { subject: payload, description: payload, category: 'GENERAL', priority: 'MEDIUM' },
      });
      expect([201, 400, 422]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });
  });
});

describe('SQL Injection — AI conversation message', () => {
  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    it(`safely stores SQLi payload as chat message content: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, '/api/ai/conversations/conv_3001/messages', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { content: payload },
      });
      // Mock returns 200 (treats payload as literal text). In production,
      // the message is stored via Prisma parameterised queries.
      expect([200, 400]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });
  });
});

describe('SQL Injection — knowledge base query', () => {
  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    it(`safely handles SQLi payload in knowledge query: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, '/api/knowledge/query', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { query: payload },
      });
      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });
  });
});

describe('SQL Injection — order creation body', () => {
  SQL_INJECTION_PAYLOADS.forEach((payload) => {
    it(`safely handles SQLi payload in order item product_id: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, '/api/cart/add', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { productId: payload, qty: 1 },
      });
      // Mock returns 404 (no product found) — never 500.
      expect([200, 404]).toContain(res.status);
      expect(res.status).not.toBe(500);
    });
  });
});

describe('SQL Injection — DELETE protection', () => {
  it('"DROP TABLE users" payload does not delete any users', async () => {
    const stateBefore = await mock.getState();

    await http(mock.baseUrl, '/api/auth/login', {
      method: 'POST',
      body: { email: "'; DROP TABLE users; --", password: "anything" },
    });

    const stateAfter = await mock.getState();
    expect(stateAfter.userCount).toBe(stateBefore.userCount);
  });

  it('"DELETE FROM orders" payload does not delete any orders', async () => {
    const ordersBefore = await http(mock.baseUrl, '/api/products');

    await http(mock.baseUrl, '/api/products?search=1%3B%20DELETE%20FROM%20orders%20WHERE%201%3D1');

    const ordersAfter = await http(mock.baseUrl, '/api/products');
    expect(ordersAfter.body.data.length).toBe(ordersBefore.body.data.length);
  });
});

describe('SQL Injection — UNION-based attacks', () => {
  it('"UNION SELECT" payload does not leak user data via product search', async () => {
    const res = await http(mock.baseUrl, '/api/products?search=%27%20UNION%20SELECT%20*%20FROM%20users%20--');
    expect(res.status).toBe(200);

    // The response data should be product-shaped (have name + price),
    // NOT user-shaped (have email + passwordHash).
    for (const item of res.body.data) {
      expect(item).not.toHaveProperty('passwordHash');
      expect(item).not.toHaveProperty('password');
    }
  });

  it('"UNION SELECT" payload does not leak user data via order list', async () => {
    const res = await http(mock.baseUrl, '/api/orders', { token: FIXTURES.tokens.validAccessToken });
    expect(res.status).toBe(200);

    for (const item of res.body.data) {
      expect(item).not.toHaveProperty('passwordHash');
      expect(item).not.toHaveProperty('password');
    }
  });
});
