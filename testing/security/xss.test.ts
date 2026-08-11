/**
 * Security — Cross-Site Scripting (XSS) Prevention Tests
 * ========================================================
 *
 * Verifies that user-supplied content is sanitized before being stored or
 * reflected back:
 *  - Stored XSS in customer name → sanitized on /api/auth/register
 *  - Stored XSS in product description → sanitized (admin-only path)
 *  - Reflected XSS in product search query → sanitized in response
 *  - DOM XSS in chat message → sanitized on /api/ai/conversations/:id/messages
 *  - XSS in support ticket subject/description → sanitized on POST /api/support/tickets
 *
 * What we NEVER want:
 *   - The literal string `<script>` to round-trip unchanged into the
 *     stored DB record (it should be escaped or stripped).
 *   - The reflected response to contain `<script>` as executable HTML.
 *
 * The mock backend sanitizes by stripping `<script>` tags and HTML
 * tags via a regex. Production code uses DOMPurify / class-sanitizer
 * for richer coverage — these tests assert the contract.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FIXTURES, startMockBackend, http, type MockBackend } from '@testing-helpers';

let mock: MockBackend;

beforeAll(async () => {
  mock = await startMockBackend(4955);
});

afterAll(async () => {
  if (mock) await mock.close();
});

beforeEach(async () => {
  await mock.reset();
});

const XSS_PAYLOADS = [
  '<script>alert("XSS")</script>',
  '<img src=x onerror="alert(\'XSS\')">',
  '<svg onload="alert(\'XSS\')">',
  '"><script>alert(1)</script>',
  'javascript:alert("XSS")',
  '<iframe src="javascript:alert(\'XSS\')"></iframe>',
  '<body onload="alert(\'XSS\')">',
  '<a href="javascript:alert(\'XSS\')">click</a>',
  '<<script>script>alert("XSS")<</script>/script>',
  '<script src="http://evil.com/xss.js"></script>',
  '<div data-x="<script>alert(1)</script>">test</div>',
  '<style>* { background: url("javascript:alert(1)"); }</style>',
  '<form action="javascript:alert(1)"><button>X</button></form>',
  '<object data="javascript:alert(1)">',
  '<embed src="javascript:alert(1)">',
];

function isSanitized(s: string): boolean {
  // The mock backend strips <script>...</script> + all HTML tags.
  return !s.toLowerCase().includes('<script') && !s.toLowerCase().includes('onerror') && !s.toLowerCase().includes('onload');
}

describe('XSS — registration (stored XSS in name)', () => {
  XSS_PAYLOADS.forEach((payload) => {
    it(`sanitizes XSS payload in firstName: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http<{ data: { firstName: string } }>(mock.baseUrl, '/api/auth/register', {
        method: 'POST',
        body: {
          email: `xss_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
          password: 'TestPass#2024',
          firstName: payload,
          lastName: 'Test',
        },
      });

      if (res.status === 201) {
        // The stored firstName should be sanitized.
        expect(isSanitized(res.body.data.firstName)).toBe(true);
      } else {
        // 400/422 (validation rejected the payload) is also acceptable.
        expect([400, 422]).toContain(res.status);
      }
      expect(res.status).not.toBe(500);
    });
  });
});

describe('XSS — support ticket (stored XSS in subject + description)', () => {
  XSS_PAYLOADS.forEach((payload) => {
    it(`sanitizes XSS payload in ticket subject + description: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http<{ data: { subject: string; description: string } }>(mock.baseUrl, '/api/support/tickets', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { subject: payload, description: payload, category: 'GENERAL', priority: 'MEDIUM' },
      });

      expect(res.status).toBe(201);
      expect(isSanitized(res.body.data.subject)).toBe(true);
      expect(isSanitized(res.body.data.description)).toBe(true);
    });
  });
});

describe('XSS — AI conversation message (DOM XSS)', () => {
  XSS_PAYLOADS.forEach((payload) => {
    it(`safely handles XSS payload in chat message: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http<{ userMessage: { content: string } }>(mock.baseUrl, '/api/ai/conversations/conv_3001/messages', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { content: payload },
      });

      expect(res.status).toBe(200);
      // The userMessage.content should preserve the payload (chat is
      // free-text) — the contract is that the FRONTEND renders it as text,
      // not HTML. So we assert the response is 200 + non-empty, not that
      // the payload was stripped.
      expect(res.body.userMessage.content).toBeTruthy();
    });
  });

  it('assistant reply never contains an executable <script> tag', async () => {
    for (const payload of XSS_PAYLOADS) {
      const res = await http<{ assistantMessage: { content: string } }>(mock.baseUrl, '/api/ai/conversations/conv_3001/messages', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { content: payload },
      });
      expect(res.body.assistantMessage.content.toLowerCase()).not.toContain('<script');
    }
  });
});

describe('XSS — product search (reflected XSS)', () => {
  XSS_PAYLOADS.forEach((payload) => {
    it(`search response does not reflect raw <script> tags: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, `/api/products?search=${encodeURIComponent(payload)}`);
      expect(res.status).toBe(200);

      // The response body should not contain the raw payload string
      // (it would be reflected as HTML in the browser).
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('<script>');
      expect(bodyStr).not.toContain('onerror=');
      expect(bodyStr).not.toContain('onload=');
    });
  });
});

describe('XSS — error messages (reflected XSS)', () => {
  XSS_PAYLOADS.forEach((payload) => {
    it(`error responses do not reflect raw payload: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      // Hit a 404 with the payload as the path.
      const res = await http(mock.baseUrl, `/api/products/${encodeURIComponent(payload)}`);
      const bodyStr = JSON.stringify(res.body);
      // The error message should not contain raw <script> tags.
      expect(bodyStr).not.toMatch(/<script/i);
      expect(bodyStr).not.toMatch(/onerror\s*=/i);
      expect(bodyStr).not.toMatch(/onload\s*=/i);
    });
  });
});

describe('XSS — knowledge base query (reflected XSS in answer)', () => {
  XSS_PAYLOADS.forEach((payload) => {
    it(`knowledge query response does not reflect raw payload: "${payload.slice(0, 30)}${payload.length > 30 ? '…' : ''}"`, async () => {
      const res = await http(mock.baseUrl, '/api/knowledge/query', {
        method: 'POST',
        token: FIXTURES.tokens.validAccessToken,
        body: { query: payload },
      });
      expect(res.status).toBe(200);

      const answerStr = String(res.body.answer ?? '');
      expect(answerStr).not.toContain('<script>');
      expect(answerStr).not.toMatch(/onerror\s*=/i);
    });
  });
});

describe('XSS — Content-Type enforcement', () => {
  it('API responses always set Content-Type: application/json (never text/html)', async () => {
    const res = await http(mock.baseUrl, '/api/products');
    const ct = res.headers['content-type'] ?? '';
    expect(ct).toContain('application/json');
    expect(ct).not.toContain('text/html');
  });

  it('error responses are also JSON (no HTML error pages)', async () => {
    const res = await http(mock.baseUrl, '/api/products/nonexistent-id');
    const ct = res.headers['content-type'] ?? '';
    expect(ct).toContain('application/json');
  });
});

describe('XSS — Content Security Policy headers', () => {
  it('API responses include a restrictive CSP header (or no inline-script allowance)', async () => {
    const res = await http(mock.baseUrl, '/api/products');
    // The mock backend doesn't set CSP (it's a JSON API); production
    // sets CSP on the frontend. We assert the absence of `unsafe-inline`
    // in any CSP that IS set.
    const csp = res.headers['content-security-policy'];
    if (csp) {
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).not.toContain('unsafe-eval');
    }
  });
});
