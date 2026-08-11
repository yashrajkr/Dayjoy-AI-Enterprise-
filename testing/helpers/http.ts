/**
 * Dayjoy AI Enterprise — HTTP Client Helper
 * ==========================================
 *
 * Thin wrapper around the native `fetch` API that targets the mock backend
 * (or a real backend if `baseUrl` points at one).
 *
 * Why a wrapper?
 *  - Tests need a consistent way to send authenticated requests with the
 *    fixture tokens (`FIXTURES.tokens.validAccessToken`).
 *  - The mock backend uses an envelope shape `{ data, meta }` — this helper
 *    unwraps it transparently so tests can `expect(res.data).toEqual(...)`.
 *  - Performance tests need a `concurrent()` helper that fires N requests
 *    in parallel and resolves to an array of `{ status, duration, body }`.
 *
 * The helper is intentionally side-effect-free: it doesn't throw on non-2xx
 * responses (the calling test decides what to assert). It DOES throw on
 * network errors (DNS, connection refused) because those almost always
 * indicate a test-setup bug, not a code-under-test bug.
 */

import { FIXTURES } from './fixtures.ts';

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: T;
  /** Time-to-first-byte in milliseconds. */
  durationMs: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  /** Bearer token shortcut — overrides `headers.Authorization`. */
  token?: string;
  /** CSRF token shortcut — sets the `X-CSRF-Token` header. */
  csrfToken?: string;
  /** Abort the request after N ms. Throws an `AbortError` on timeout. */
  timeoutMs?: number;
}

/** Default headers applied to every request unless overridden. */
const DEFAULT_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

/**
 * Issue a single HTTP request.
 *
 * @example
 *   const res = await http(mock.baseUrl, '/api/auth/login', {
 *     method: 'POST',
 *     body: { email: 'customer@example.com', password: 'Customer#2024' },
 *   });
 *   expect(res.status).toBe(200);
 */
export async function http<T = unknown>(
  baseUrl: string,
  path: string,
  opts: RequestOptions = {},
): Promise<HttpResponse<T>> {
  const controller = opts.timeoutMs ? new AbortController() : null;
  const timer = opts.timeoutMs
    ? setTimeout(() => controller!.abort(), opts.timeoutMs)
    : null;

  const start = performance.now();
  try {
    const headers: Record<string, string> = { ...DEFAULT_HEADERS, ...opts.headers };
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
    if (opts.csrfToken) headers['X-CSRF-Token'] = opts.csrfToken;

    const init: RequestInit = {
      method: opts.method ?? 'GET',
      headers,
      signal: controller?.signal,
    };
    if (opts.body !== undefined && opts.method !== 'GET') {
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }

    const res = await fetch(`${baseUrl}${path}`, init);
    const durationMs = performance.now() - start;
    const rawHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { rawHeaders[k] = v; });

    let body: any = null;
    const text = await res.text();
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    return { status: res.status, ok: res.ok, headers: rawHeaders, body, durationMs };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Issue N requests concurrently. Used by performance + load tests.
 *
 * Returns an array of responses in the SAME ORDER as the input factories
 * (so a test can assert on `responses[0]` specifically).
 *
 * @example
 *   const responses = await concurrent(100, () =>
 *     http(baseUrl, '/api/products', { token: FIXTURES.tokens.validAccessToken }),
 *   );
 *   expect(responses.every(r => r.status === 200)).toBe(true);
 */
export async function concurrent<T>(
  n: number,
  factory: (index: number) => Promise<T>,
): Promise<T[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => factory(i)));
}

/**
 * Issue requests in batches of `batchSize` with `gapMs` between batches.
 * Used by soak tests to sustain a steady request rate without overwhelming
 * the test runner's event loop.
 */
export async function sustained(
  totalRequests: number,
  requestsPerSecond: number,
  factory: (index: number) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ durationMs: number; errors: number }> {
  const batchSize = Math.max(1, Math.ceil(requestsPerSecond / 10));
  const gapMs = (batchSize / requestsPerSecond) * 1000;
  const start = performance.now();
  let errors = 0;
  let done = 0;

  for (let i = 0; i < totalRequests; i += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, totalRequests - i) }, (_, j) =>
      factory(i + j).catch(() => { errors++; }).then(() => { done++; if (onProgress) onProgress(done, totalRequests); }),
    );
    await Promise.all(batch);
    await new Promise((r) => setTimeout(r, gapMs));
  }

  return { durationMs: performance.now() - start, errors };
}

/** Authenticate against the mock backend and return an access token. */
export async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await http<{ accessToken: string }>(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
  return res.body.accessToken;
}

/** Pre-built token shortcuts for the most common test fixtures. */
export const tokens = {
  superAdmin: FIXTURES.tokens.validAccessToken.replace('usr_customer', FIXTURES.users.superAdmin.id),
  admin: FIXTURES.tokens.validAccessToken.replace('usr_customer', FIXTURES.users.admin.id),
  manager: FIXTURES.tokens.validAccessToken.replace('usr_customer', FIXTURES.users.manager.id),
  agent: FIXTURES.tokens.validAccessToken.replace('usr_customer', FIXTURES.users.agent.id),
  viewer: FIXTURES.tokens.validAccessToken.replace('usr_customer', FIXTURES.users.viewer.id),
  customer: FIXTURES.tokens.validAccessToken,
  distributor: FIXTURES.tokens.validAccessToken.replace('usr_customer', FIXTURES.users.distributor.id),
  employee: FIXTURES.tokens.validAccessToken.replace('usr_customer', FIXTURES.users.employee.id),
};
