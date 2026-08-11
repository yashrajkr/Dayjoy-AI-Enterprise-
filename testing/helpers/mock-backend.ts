/**
 * Dayjoy AI Enterprise — Mock Backend HTTP Surface
 * ================================================
 *
 * A lightweight in-memory mock of the NestJS backend used by the portal,
 * security, performance, ai-eval, and edge-case test suites.
 *
 * Why not run the real NestJS app?
 *  - The real app needs Postgres + Redis + OpenAI + Vapi + WhatsApp
 *    credentials — none of which are available in the CI sandbox.
 *  - Security + performance tests need deterministic, scriptable responses
 *    (e.g. "respond 401 to the 6th login attempt") that the real backend
 *    can't easily provide.
 *  - The portal tests are E2E specs against a *running frontend*, not the
 *    backend itself — the mock just needs to satisfy the fetch() calls the
 *    portal pages make.
 *
 * The mock is built on the native `http` module so it has zero external
 * dependencies and starts in <5ms. It exposes the same URL surface + JSON
 * envelope (`{ data, meta }`) the real backend uses, plus a small admin
 * API (`/__mock/state`, `/__mock/reset`) so tests can introspect + reset
 * the in-memory state between cases.
 *
 * Routes implemented (selection — see `router` for the full list):
 *   POST   /api/auth/login                 -> 200 + tokens | 401 | 429
 *   POST   /api/auth/register              -> 201 + user
 *   POST   /api/auth/refresh               -> 200 + new tokens | 401
 *   POST   /api/auth/logout                -> 204
 *   POST   /api/auth/forgot-password       -> 202
 *   POST   /api/auth/reset-password        -> 200
 *   GET    /api/auth/me                    -> 200 + user
 *   GET    /api/products                   -> 200 + paginated list
 *   GET    /api/products/:id               -> 200 + product | 404
 *   POST   /api/cart/add                   -> 200 + cart
 *   GET    /api/orders                     -> 200 + paginated list
 *   GET    /api/orders/:id                 -> 200 + order | 404
 *   POST   /api/orders/:id/return          -> 200 | 409
 *   POST   /api/knowledge/query            -> 200 + answer + citations
 *   POST   /api/ai/conversations           -> 201 + conversation
 *   POST   /api/ai/conversations/:id/messages -> 200 + assistant message
 *   GET    /api/ai/conversations           -> 200 + list
 *   POST   /api/support/tickets            -> 201 + ticket
 *   GET    /api/support/tickets            -> 200 + list
 *   GET    /api/support/faqs               -> 200 + list
 *   GET    /api/support/knowledge-base     -> 200 + list
 *   GET    /api/distributors/me            -> 200 + distributor profile
 *   GET    /api/distributors/me/team       -> 200 + downline tree
 *   GET    /api/distributors/me/sales      -> 200 + sales summary
 *   GET    /api/distributors/me/earnings   -> 200 + earnings summary
 *   GET    /api/distributors/me/commissions -> 200 + list
 *   GET    /api/distributors/me/leads      -> 200 + list
 *   POST   /api/distributors/me/leads      -> 201 + lead
 *   POST   /api/distributors/me/leads/:id/convert -> 200
 *   GET    /api/employees/me/dashboard     -> 200 + KPIs
 *   GET    /api/employees/me/tasks         -> 200 + list
 *   POST   /api/employees/me/tasks         -> 201 + task
 *   GET    /api/employees/me/tickets       -> 200 + list
 *   POST   /api/employees/attendance/check-in  -> 200
 *   POST   /api/employees/attendance/check-out -> 200
 *   GET    /api/admin/dashboard            -> 200 + KPIs (admin only)
 *   GET    /api/admin/users                -> 200 + list (admin only)
 *   POST   /api/admin/users                -> 201 (admin only)
 *   PATCH  /api/admin/users/:id            -> 200 (admin only)
 *   DELETE /api/admin/users/:id            -> 204 (admin only)
 *   GET    /api/admin/analytics            -> 200 + analytics (admin only)
 *
 * Test introspection:
 *   GET    /__mock/state                   -> full in-memory state
 *   POST   /__mock/reset                   -> reset state to fixtures
 *   POST   /__mock/fail-next               -> force the next N calls to a path to fail
 *   POST   /__mock/slow-next               -> force the next N calls to a path to sleep
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { FIXTURES, type FixturesUser, type Role } from './fixtures.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MockState {
  users: FixturesUser[];
  products: typeof FIXTURES.products;
  orders: typeof FIXTURES.orders.list;
  tickets: typeof FIXTURES.tickets.list;
  faqs: typeof FIXTURES.faqs;
  knowledgeArticles: typeof FIXTURES.knowledgeArticles;
  aiConversations: typeof FIXTURES.aiConversations.list;
  aiMessages: typeof FIXTURES.aiConversations.messages;
  leads: typeof FIXTURES.leads.list;
  commissions: typeof FIXTURES.commissions.list;
  tasks: typeof FIXTURES.tasks.list;
  attendance: (typeof FIXTURES.attendance)[keyof typeof FIXTURES.attendance][];
  cart: { productId: string; qty: number }[];
  /** Rate-limit counters. Key = `${kind}:${identifier}`, value = count. */
  rateLimits: Map<string, { count: number; windowStart: number }>;
  /** Blocklisted JTIs (set by `/api/auth/logout`). */
  blocklist: Set<string>;
  /** Email → reset-token map. */
  passwordResets: Map<string, string>;
  /** Fail-next overrides. */
  failNext: Map<string, number>;
  /** Slow-next overrides (ms). */
  slowNext: Map<string, { count: number; delayMs: number }>;
  /** Captured requests for assertion in tests. */
  requestLog: { method: string; path: string; status: number; at: number }[];
}

function freshState(): MockState {
  return {
    users: [
      FIXTURES.users.superAdmin,
      FIXTURES.users.admin,
      FIXTURES.users.manager,
      FIXTURES.users.agent,
      FIXTURES.users.viewer,
      FIXTURES.users.customer,
      FIXTURES.users.distributor,
      FIXTURES.users.employee,
      FIXTURES.users.locked,
      FIXTURES.users.pending,
      FIXTURES.users.terminated,
      FIXTURES.users.crossTenant,
    ],
    products: [...FIXTURES.products],
    orders: [...FIXTURES.orders.list],
    tickets: [...FIXTURES.tickets.list],
    faqs: [...FIXTURES.faqs],
    knowledgeArticles: [...FIXTURES.knowledgeArticles],
    aiConversations: [...FIXTURES.aiConversations.list],
    aiMessages: [...FIXTURES.aiConversations.messages],
    leads: [...FIXTURES.leads.list],
    commissions: [...FIXTURES.commissions.list],
    tasks: [...FIXTURES.tasks.list],
    attendance: [FIXTURES.attendance.checkedIn, FIXTURES.attendance.completed],
    cart: [],
    rateLimits: new Map(),
    blocklist: new Set(),
    passwordResets: new Map(),
    failNext: new Map(),
    slowNext: new Map(),
    requestLog: [],
  };
}

let state: MockState = freshState();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  });
  res.end(payload);
  return status;
}

function ok<T>(res: ServerResponse, data: T, meta?: Record<string, unknown>) {
  return send(res, 200, meta ? { data, meta } : { data });
}

function created<T>(res: ServerResponse, data: T) {
  return send(res, 201, { data });
}

function fail(res: ServerResponse, status: number, message: string, code?: string) {
  return send(res, status, { error: { message, code: code ?? message.toUpperCase().replace(/\s+/g, '_') } });
}

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function extractToken(req: IncomingMessage): string | null {
  const h = req.headers['authorization'];
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

/** Decode the (unverified) payload of a mock JWT. Real signature checks happen
 *  against the token strings in `FIXTURES.tokens`. */
function decodeToken(token: string): { userId: string; role?: Role; jti?: string; type?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64').toString('utf8'));
    return payload;
  } catch {
    return null;
  }
}

function userFromToken(req: IncomingMessage): FixturesUser | null {
  const token = extractToken(req);
  if (!token) return null;

  // Blocklist check.
  const decoded = decodeToken(token);
  if (decoded?.jti && state.blocklist.has(decoded.jti)) return null;

  // Expired / invalid signature tokens can't be matched against fixtures.
  if (
    token === FIXTURES.tokens.expiredToken ||
    token === FIXTURES.tokens.invalidSignatureToken ||
    token === FIXTURES.tokens.blocklistedToken
  ) {
    return null;
  }

  // The mock access token encodes `userId` — use it to look up the user.
  if (decoded?.userId) {
    return state.users.find((u) => u.id === decoded.userId) ?? null;
  }
  return null;
}

function requireAuth(req: IncomingMessage, res: ServerResponse): FixturesUser | null {
  const user = userFromToken(req);
  if (!user) {
    fail(res, 401, 'Unauthorized');
    return null;
  }
  return user;
}

function requireRole(req: IncomingMessage, res: ServerResponse, ...roles: Role[]): FixturesUser | null {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!roles.includes(user.role)) {
    fail(res, 403, 'Forbidden — insufficient role');
    return null;
  }
  return user;
}

function paginate<T>(items: T[], page: number, limit: number) {
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    meta: { page, limit, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / limit)) },
  };
}

/** Apply a fail-next or slow-next override. Returns true if the request was
 *  handled (in which case the caller should return early). */
async function applyOverrides(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  const failCount = state.failNext.get(path);
  if (failCount && failCount > 0) {
    state.failNext.set(path, failCount - 1);
    send(res, 503, { error: { message: 'Service Unavailable (forced failure)', code: 'MOCK_FORCED_FAIL' } });
    return true;
  }
  const slow = state.slowNext.get(path);
  if (slow && slow.count > 0) {
    slow.count -= 1;
    await new Promise((r) => setTimeout(r, slow.delayMs));
  }
  return false;
}

/** Sliding-window rate limit check. Returns true if the request is allowed. */
function rateLimit(kind: string, identifier: string, limit: number, windowSeconds: number): boolean {
  const key = `${kind}:${identifier}`;
  const now = Date.now();
  const entry = state.rateLimits.get(key);
  if (!entry || now - entry.windowStart > windowSeconds * 1000) {
    state.rateLimits.set(key, { count: 1, windowStart: now });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => Promise<void> | void;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
  /** Public routes (no auth) — auth + register + health. */
  public?: boolean;
}

function r(method: string, pattern: string, handler: Handler, opts?: { public?: boolean }): Route {
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:([a-zA-Z]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  return { method, pattern: new RegExp(`^${regexStr}$`), paramNames, handler, public: opts?.public };
}

const router: Route[] = [
  // -- Mock introspection -------------------------------------------------
  r('GET', '/__mock/state', (req, res) => {
    ok(res, {
      userCount: state.users.length,
      productCount: state.products.length,
      orderCount: state.orders.length,
      rateLimits: Array.from(state.rateLimits.entries()),
      blocklist: Array.from(state.blocklist),
      requestLog: state.requestLog.slice(-50),
    });
  }),
  r('POST', '/__mock/reset', (req, res) => {
    state = freshState();
    ok(res, { reset: true });
  }),
  r('POST', '/__mock/fail-next', async (req, res) => {
    const body = await parseBody(req);
    state.failNext.set(body.path as string, body.count as number);
    ok(res, { ok: true });
  }),
  r('POST', '/__mock/slow-next', async (req, res) => {
    const body = await parseBody(req);
    state.slowNext.set(body.path as string, { count: body.count as number, delayMs: body.delayMs as number });
    ok(res, { ok: true });
  }),

  // -- Health -------------------------------------------------------------
  r('GET', '/api/health', (req, res) => ok(res, { status: 'ok', timestamp: Date.now() }), { public: true }),

  // -- Auth ---------------------------------------------------------------
  r('POST', '/api/auth/login', async (req, res) => {
    const body = await parseBody(req);
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';

    // Rate-limit by email + IP.
    if (body.email && !rateLimit('login:email', body.email, FIXTURES.rateLimit.authEmailLimit, FIXTURES.rateLimit.authEmailWindowSeconds)) {
      return fail(res, 429, 'Too many login attempts for this email. Try again in 15 minutes.', 'RATE_LIMITED');
    }
    if (!rateLimit('login:ip', ip, FIXTURES.rateLimit.authIpLimit, FIXTURES.rateLimit.authIpWindowSeconds)) {
      return fail(res, 429, 'Too many login attempts from this IP. Try again in 15 minutes.', 'RATE_LIMITED');
    }

    const user = state.users.find((u) => u.email === body.email);
    if (!user || user.password !== body.password) {
      return fail(res, 401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }
    if (user.status === 'SUSPENDED') {
      return fail(res, 401, 'Account locked. Try again in 15 minutes or reset your password.', 'ACCOUNT_LOCKED');
    }
    if (user.status === 'TERMINATED') {
      return fail(res, 401, 'Account terminated. Contact support.', 'ACCOUNT_TERMINATED');
    }
    if (user.status === 'PENDING') {
      return fail(res, 401, 'Email not verified. Please check your inbox.', 'EMAIL_NOT_VERIFIED');
    }

    ok(res, {
      accessToken: FIXTURES.tokens.validAccessToken.replace('usr_customer', user.id),
      refreshToken: FIXTURES.tokens.validRefreshToken.replace('usr_customer', user.id),
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, tenantId: user.tenantId },
    });
  }, { public: true }),

  r('POST', '/api/auth/register', async (req, res) => {
    const body = await parseBody(req);
    if (state.users.some((u) => u.email === body.email)) {
      return fail(res, 409, 'Email already registered', 'EMAIL_TAKEN');
    }
    const user: FixturesUser = {
      id: `usr_new_${Date.now()}`,
      email: body.email,
      password: body.password,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone ?? null,
      role: 'CUSTOMER',
      tenantId: 'default',
      status: 'PENDING',
      isEmailVerified: false,
      passwordHash: '$2a$10$mockhashnew',
    };
    state.users.push(user);
    created(res, {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
    });
  }, { public: true }),

  r('POST', '/api/auth/refresh', async (req, res) => {
    const body = await parseBody(req);
    if (!body.refreshToken || body.refreshToken === FIXTURES.tokens.expiredToken) {
      return fail(res, 401, 'Invalid or expired refresh token', 'REFRESH_EXPIRED');
    }
    const decoded = decodeToken(body.refreshToken);
    if (!decoded?.userId) return fail(res, 401, 'Invalid refresh token', 'REFRESH_INVALID');
    ok(res, {
      accessToken: FIXTURES.tokens.validAccessToken.replace('usr_customer', decoded.userId),
      refreshToken: FIXTURES.tokens.validRefreshToken.replace('usr_customer', decoded.userId),
    });
  }, { public: true }),

  r('POST', '/api/auth/logout', async (req, res) => {
    const token = extractToken(req);
    const decoded = token ? decodeToken(token) : null;
    if (decoded?.jti) state.blocklist.add(decoded.jti);
    res.writeHead(204);
    res.end();
  }),

  r('POST', '/api/auth/forgot-password', async (req, res) => {
    const body = await parseBody(req);
    const token = `reset_${Math.random().toString(36).slice(2)}`;
    state.passwordResets.set(body.email, token);
    res.writeHead(202);
    res.end();
  }, { public: true }),

  r('POST', '/api/auth/reset-password', async (req, res) => {
    const body = await parseBody(req);
    const email = body.email;
    const token = body.token;
    if (!state.passwordResets.has(email) || state.passwordResets.get(email) !== token) {
      return fail(res, 400, 'Invalid or expired reset token', 'RESET_TOKEN_INVALID');
    }
    const user = state.users.find((u) => u.email === email);
    if (!user) return fail(res, 404, 'User not found', 'USER_NOT_FOUND');
    user.password = body.newPassword;
    state.passwordResets.delete(email);
    ok(res, { success: true });
  }, { public: true }),

  r('GET', '/api/auth/me', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    ok(res, {
      id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
      phone: user.phone, role: user.role, tenantId: user.tenantId,
      isEmailVerified: user.isEmailVerified, status: user.status,
    });
  }),

  // -- Products -----------------------------------------------------------
  r('GET', '/api/products', (req, res) => {
    const url = new URL(req.url ?? '', 'http://mock');
    const search = url.searchParams.get('search')?.toLowerCase();
    const category = url.searchParams.get('category');
    const minPrice = Number(url.searchParams.get('minPrice') ?? 0);
    const maxPrice = url.searchParams.get('maxPrice') ? Number(url.searchParams.get('maxPrice')) : Infinity;
    const sort = url.searchParams.get('sort') ?? 'newest';
    const page = Number(url.searchParams.get('page') ?? 1);
    const limit = Number(url.searchParams.get('limit') ?? 20);

    let items = [...state.products];
    if (search) items = items.filter((p) => p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search));
    if (category) items = items.filter((p) => p.category === category);
    items = items.filter((p) => p.price >= minPrice && p.price <= maxPrice);
    if (sort === 'price-asc') items.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') items.sort((a, b) => b.price - a.price);
    if (sort === 'rating') items.sort((a, b) => b.rating - a.rating);
    if (sort === 'newest') items.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    ok(res, paginate(items, page, limit));
  }, { public: true }),

  r('GET', '/api/products/:id', (req, res, { id }) => {
    const product = state.products.find((p) => p.id === id || p.slug === id);
    if (!product) return fail(res, 404, 'Product not found', 'NOT_FOUND');
    ok(res, product);
  }, { public: true }),

  // -- Cart ---------------------------------------------------------------
  r('POST', '/api/cart/add', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const product = state.products.find((p) => p.id === body.productId);
    if (!product) return fail(res, 404, 'Product not found', 'NOT_FOUND');
    if (product.stock === 0) return fail(res, 409, 'Product out of stock', 'OUT_OF_STOCK');
    const existing = state.cart.find((c) => c.productId === body.productId);
    if (existing) existing.qty += body.qty ?? 1;
    else state.cart.push({ productId: body.productId, qty: body.qty ?? 1 });
    ok(res, { cart: state.cart, count: state.cart.reduce((s, c) => s + c.qty, 0) });
  }),

  // -- Orders -------------------------------------------------------------
  r('GET', '/api/orders', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const url = new URL(req.url ?? '', 'http://mock');
    const page = Number(url.searchParams.get('page') ?? 1);
    const limit = Number(url.searchParams.get('limit') ?? 20);
    let items = state.orders;
    if (user.role === 'CUSTOMER') items = items.filter((o) => o.customerId === user.id);
    if (user.role === 'DISTRIBUTOR') items = items.filter((o) => o.distributorId === user.id);
    ok(res, paginate(items, page, limit));
  }),

  r('GET', '/api/orders/:id', (req, res, { id }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const order = state.orders.find((o) => o.id === id);
    if (!order) return fail(res, 404, 'Order not found', 'NOT_FOUND');
    if (user.role === 'CUSTOMER' && order.customerId !== user.id) return fail(res, 403, 'Forbidden', 'FORBIDDEN');
    if (user.role === 'DISTRIBUTOR' && order.distributorId !== user.id) return fail(res, 403, 'Forbidden', 'FORBIDDEN');
    ok(res, order);
  }),

  r('GET', '/api/orders/:id/invoice', (req, res, { id }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const order = state.orders.find((o) => o.id === id);
    if (!order) return fail(res, 404, 'Order not found', 'NOT_FOUND');
    ok(res, { order, invoiceNumber: `INV-${order.id.toUpperCase()}`, generatedAt: new Date().toISOString() });
  }),

  r('POST', '/api/orders/:id/return', async (req, res, { id }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const order = state.orders.find((o) => o.id === id);
    if (!order) return fail(res, 404, 'Order not found', 'NOT_FOUND');
    if (order.status === 'CANCELLED') return fail(res, 409, 'Cannot return a cancelled order', 'RETURN_CONFLICT');
    if (order.status !== 'DELIVERED') return fail(res, 409, 'Order must be delivered before return', 'RETURN_NOT_DELIVERED');
    ok(res, { returnId: `ret_${Date.now()}`, status: 'REQUESTED' });
  }),

  // -- AI / Knowledge -----------------------------------------------------
  r('POST', '/api/knowledge/query', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const q = (body.query ?? '').toLowerCase();

    // Mock RAG: match against KB articles by keyword.
    let answer = 'I can help with that. ';
    let citations: { title: string; slug: string; score: number }[] = [];

    if (q.includes('return') || q.includes('refund')) {
      answer += 'You can return any unopened product within 30 days of delivery for a full refund. Refunds are processed within 5-7 business days.';
      citations = [{ title: 'Dayjoy Return & Refund Policy', slug: 'return-policy', score: 0.94 }];
    } else if (q.includes('distributor') && (q.includes('become') || q.includes('join'))) {
      answer += 'To become a distributor, register at /register, choose the distributor track, enter your sponsor code, and complete KYC verification.';
      citations = [{ title: 'How to Become a Dayjoy Distributor', slug: 'distributor-onboarding', score: 0.91 }];
    } else if (q.includes('shipping')) {
      answer += 'Standard delivery is 3-5 business days across India. Express delivery (1-2 days) is available in major metros.';
      citations = [{ title: 'Shipping FAQ', slug: 'shipping-faq', score: 0.88 }];
    } else if (q.includes('product') || q.includes('recommend')) {
      answer += 'Based on your past orders, I would recommend the Dayjoy Wellness Pack and the Dayjoy Skincare Combo.';
      citations = [];
    } else if (q.includes('order') && q.includes('status')) {
      answer += 'Your most recent order is currently being processed. You can view the full timeline on the orders page.';
    } else if (q.includes('human') || q.includes('agent')) {
      answer += 'I am transferring you to a human agent. Please hold on while I connect you.';
    } else {
      answer += 'Let me look that up for you. Could you provide more details?';
    }

    ok(res, { answer, citations, query: body.query });
  }),

  r('GET', '/api/ai/conversations', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    ok(res, { data: state.aiConversations, meta: { total: state.aiConversations.length } });
  }),

  r('POST', '/api/ai/conversations', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const conv = {
      id: `conv_${Date.now()}`,
      title: body.title ?? 'New conversation',
      createdAt: new Date().toISOString(),
      messageCount: 0,
      lastMessageAt: new Date().toISOString(),
    };
    state.aiConversations.push(conv);
    created(res, conv);
  }),

  r('POST', '/api/ai/conversations/:id/messages', async (req, res, { id }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await parseBody(req);
    const userMsg = { id: `msg_${Date.now()}`, role: 'user' as const, content: body.content, at: new Date().toISOString() };

    // Reuse the knowledge-query logic to generate the assistant reply.
    const q = (body.content ?? '').toLowerCase();
    let answer = 'I can help with that. ';
    let citations: { title: string; slug: string; score: number }[] = [];
    if (q.includes('return') || q.includes('refund')) {
      answer += 'You can return any unopened product within 30 days of delivery for a full refund.';
      citations = [{ title: 'Dayjoy Return & Refund Policy', slug: 'return-policy', score: 0.94 }];
    } else if (q.includes('distributor') && (q.includes('become') || q.includes('join'))) {
      answer += 'To become a distributor, register at /register, choose the distributor track, enter your sponsor code, and complete KYC verification.';
      citations = [{ title: 'How to Become a Dayjoy Distributor', slug: 'distributor-onboarding', score: 0.91 }];
    } else if (q.includes('shipping')) {
      answer += 'Standard delivery is 3-5 business days across India.';
    } else if (q.includes('order') && q.includes('status')) {
      answer += 'Your most recent order is currently being processed.';
    } else if (q.includes('human') || q.includes('agent')) {
      answer += 'I am transferring you to a human agent. Please hold on while I connect you.';
    } else if (q.trim() === '') {
      return fail(res, 400, 'Message content cannot be empty', 'EMPTY_MESSAGE');
    } else {
      answer += 'Let me look that up for you.';
    }

    const assistantMsg = { id: `msg_${Date.now() + 1}`, role: 'assistant' as const, content: answer, at: new Date().toISOString(), citations };
    state.aiMessages.push(userMsg, assistantMsg);
    ok(res, { userMessage: userMsg, assistantMessage: assistantMsg });
  }),

  // -- Support ------------------------------------------------------------
  r('GET', '/api/support/faqs', (req, res) => ok(res, { data: state.faqs }), { public: true }),
  r('GET', '/api/support/knowledge-base', (req, res) => ok(res, { data: state.knowledgeArticles }), { public: true }),
  r('GET', '/api/support/knowledge-base/:slug', (req, res, { slug }) => {
    const article = state.knowledgeArticles.find((a) => a.slug === slug);
    if (!article) return fail(res, 404, 'Article not found', 'NOT_FOUND');
    ok(res, article);
  }, { public: true }),

  r('GET', '/api/support/tickets', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    let items = state.tickets;
    if (user.role === 'CUSTOMER') items = items.filter((t) => t.customerId === user.id);
    ok(res, { data: items });
  }),

  r('POST', '/api/support/tickets', async (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const body = await parseBody(req);
    // Sanitize for XSS — strip raw <script> tags.
    const clean = (s: string) => (s ?? '').replace(/<script.*?<\/script>/gis, '').replace(/<[^>]+>/g, '');
    const ticket = {
      id: `tkt_${Date.now()}`,
      customerId: user.id,
      subject: clean(body.subject),
      description: clean(body.description),
      category: body.category ?? 'GENERAL',
      priority: body.priority ?? 'MEDIUM',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    state.tickets.push(ticket as any);
    created(res, ticket);
  }),

  r('GET', '/api/support/tickets/:id', (req, res, { id }) => {
    const user = requireAuth(req, res);
    if (!user) return;
    const ticket = state.tickets.find((t) => t.id === id);
    if (!ticket) return fail(res, 404, 'Ticket not found', 'NOT_FOUND');
    if (user.role === 'CUSTOMER' && ticket.customerId !== user.id) return fail(res, 403, 'Forbidden', 'FORBIDDEN');
    ok(res, ticket);
  }),

  // -- Distributor portal -------------------------------------------------
  r('GET', '/api/distributors/me', (req, res) => {
    const user = requireRole(req, res, 'DISTRIBUTOR', 'SUPER_ADMIN', 'ADMIN');
    if (!user) return;
    ok(res, { ...FIXTURES.distributor, userId: user.id });
  }),

  r('GET', '/api/distributors/me/team', (req, res) => {
    const user = requireRole(req, res, 'DISTRIBUTOR', 'SUPER_ADMIN', 'ADMIN');
    if (!user) return;
    ok(res, {
      data: [
        { id: 'dst_010', name: 'Anjali Mehta', tier: 'SILVER', level: 1, joinedAt: '2023-09-01', downline: 8 },
        { id: 'dst_011', name: 'Rohit Desai', tier: 'BRONZE', level: 1, joinedAt: '2023-10-15', downline: 3 },
        { id: 'dst_012', name: 'Pooja Shah', tier: 'GOLD', level: 2, joinedAt: '2023-11-20', downline: 12 },
      ],
      meta: { totalDownline: 47, byTier: { BRONZE: 18, SILVER: 14, GOLD: 9, PLATINUM: 5, DIAMOND: 1 }, byLevel: { 1: 12, 2: 18, 3: 12, 4: 5 } },
    });
  }),

  r('GET', '/api/distributors/me/sales', (req, res) => {
    const user = requireRole(req, res, 'DISTRIBUTOR', 'SUPER_ADMIN', 'ADMIN');
    if (!user) return;
    ok(res, {
      total: 1245000, count: 247, avgOrderValue: 5040,
      trend: [
        { month: '2024-01', total: 95000 },
        { month: '2024-02', total: 110000 },
        { month: '2024-03', total: 132000 },
        { month: '2024-04', total: 108000 },
        { month: '2024-05', total: 145000 },
      ],
      topProducts: [
        { productId: 'prd_001', name: 'Dayjoy Wellness Pack', units: 64, revenue: 95936 },
        { productId: 'prd_002', name: 'Dayjoy Skincare Combo', units: 48, revenue: 47952 },
      ],
    });
  }),

  r('GET', '/api/distributors/me/earnings', (req, res) => {
    const user = requireRole(req, res, 'DISTRIBUTOR', 'SUPER_ADMIN', 'ADMIN');
    if (!user) return;
    ok(res, {
      ytd: 87150, month: 14500, pending: 1240, nextPayout: '2024-06-01',
      breakdown: { personal: 62400, team: 24750 },
      history: [
        { month: '2024-05', amount: 14500, status: 'PAID' },
        { month: '2024-04', amount: 12800, status: 'PAID' },
        { month: '2024-03', amount: 15200, status: 'PAID' },
      ],
    });
  }),

  r('GET', '/api/distributors/me/commissions', (req, res) => {
    const user = requireRole(req, res, 'DISTRIBUTOR', 'SUPER_ADMIN', 'ADMIN');
    if (!user) return;
    ok(res, { data: state.commissions });
  }),

  r('GET', '/api/distributors/me/leads', (req, res) => {
    const user = requireRole(req, res, 'DISTRIBUTOR', 'SUPER_ADMIN', 'ADMIN');
    if (!user) return;
    ok(res, { data: state.leads });
  }),

  r('POST', '/api/distributors/me/leads', async (req, res) => {
    const user = requireRole(req, res, 'DISTRIBUTOR', 'SUPER_ADMIN', 'ADMIN');
    if (!user) return;
    const body = await parseBody(req);
    const lead = {
      id: `lead_${Date.now()}`,
      name: body.name, phone: body.phone, email: body.email,
      stage: 'NEW', source: body.source ?? 'MANUAL', distributorId: user.id, score: 50,
    };
    state.leads.push(lead as any);
    created(res, lead);
  }),

  r('POST', '/api/distributors/me/leads/:id/convert', (req, res, { id }) => {
    const user = requireRole(req, res, 'DISTRIBUTOR', 'SUPER_ADMIN', 'ADMIN');
    if (!user) return;
    const lead = state.leads.find((l) => l.id === id);
    if (!lead) return fail(res, 404, 'Lead not found', 'NOT_FOUND');
    lead.stage = 'CONVERTED';
    ok(res, { lead, customerId: `cust_${Date.now()}` });
  }),

  // -- Employee portal ----------------------------------------------------
  r('GET', '/api/employees/me/dashboard', (req, res) => {
    const user = requireRole(req, res, 'EMPLOYEE', 'MANAGER', 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    ok(res, {
      kpis: { openTickets: 8, myTasks: 5, slaBreaches: 1, customerSatisfaction: 92 },
      todaysTasks: state.tasks.filter((t) => t.assigneeId === 'usr_employee'),
      recentTickets: state.tickets.slice(0, 3),
    });
  }),

  r('GET', '/api/employees/me/tasks', (req, res) => {
    const user = requireRole(req, res, 'EMPLOYEE', 'MANAGER', 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    ok(res, { data: state.tasks });
  }),

  r('POST', '/api/employees/me/tasks', async (req, res) => {
    const user = requireRole(req, res, 'EMPLOYEE', 'MANAGER', 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    const body = await parseBody(req);
    const task = {
      id: `task_${Date.now()}`,
      assigneeId: user.id,
      title: body.title, status: 'OPEN', priority: body.priority ?? 'MEDIUM', dueAt: body.dueAt,
    };
    state.tasks.push(task as any);
    created(res, task);
  }),

  r('PATCH', '/api/employees/me/tasks/:id', async (req, res, { id }) => {
    const user = requireRole(req, res, 'EMPLOYEE', 'MANAGER', 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return fail(res, 404, 'Task not found', 'NOT_FOUND');
    const body = await parseBody(req);
    if (body.status) task.status = body.status;
    ok(res, task);
  }),

  r('GET', '/api/employees/me/tickets', (req, res) => {
    const user = requireRole(req, res, 'EMPLOYEE', 'MANAGER', 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    ok(res, { data: state.tickets });
  }),

  r('POST', '/api/employees/attendance/check-in', (req, res) => {
    const user = requireRole(req, res, 'EMPLOYEE', 'MANAGER', 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    ok(res, { id: `att_${Date.now()}`, checkInAt: new Date().toISOString(), status: 'PRESENT' });
  }),

  r('POST', '/api/employees/attendance/check-out', (req, res) => {
    const user = requireRole(req, res, 'EMPLOYEE', 'MANAGER', 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    ok(res, { id: `att_${Date.now()}`, checkOutAt: new Date().toISOString(), workHours: 8.5 });
  }),

  // -- Admin dashboard ----------------------------------------------------
  r('GET', '/api/admin/dashboard', (req, res) => {
    const user = requireRole(req, res, 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    ok(res, {
      kpis: { totalUsers: state.users.length, activeConversations: 12, revenue: 4580000, slaCompliance: 96.5 },
      charts: {
        usersOverTime: [{ month: '2024-05', count: 1247 }, { month: '2024-04', count: 1198 }],
        conversationsByChannel: { website: 412, voice: 187, whatsapp: 244 },
      },
      activityFeed: [
        { type: 'USER_REGISTERED', at: new Date().toISOString(), userId: 'usr_new' },
        { type: 'ORDER_PLACED', at: new Date().toISOString(), orderId: 'ord_new' },
      ],
      systemHealth: { api: 'ok', database: 'ok', redis: 'ok', ai: 'ok' },
    });
  }),

  r('GET', '/api/admin/users', (req, res) => {
    const user = requireRole(req, res, 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    const url = new URL(req.url ?? '', 'http://mock');
    const q = url.searchParams.get('search')?.toLowerCase();
    let items = state.users.map((u) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role, status: u.status, tenantId: u.tenantId }));
    if (q) items = items.filter((u) => u.email.toLowerCase().includes(q) || `${u.firstName} ${u.lastName}`.toLowerCase().includes(q));
    ok(res, { data: items, meta: { total: items.length } });
  }),

  r('POST', '/api/admin/users', async (req, res) => {
    const user = requireRole(req, res, 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    const body = await parseBody(req);
    if (state.users.some((u) => u.email === body.email)) return fail(res, 409, 'Email already registered', 'EMAIL_TAKEN');
    const newUser: FixturesUser = {
      id: `usr_${Date.now()}`,
      email: body.email, password: body.password ?? 'Temp#1234',
      firstName: body.firstName, lastName: body.lastName, phone: body.phone ?? null,
      role: body.role ?? 'VIEWER', tenantId: body.tenantId ?? 'default',
      status: 'ACTIVE', isEmailVerified: false, passwordHash: '$2a$10$mockhashadmincreated',
    };
    state.users.push(newUser);
    created(res, { id: newUser.id, email: newUser.email, role: newUser.role });
  }),

  r('PATCH', '/api/admin/users/:id', async (req, res, { id }) => {
    const user = requireRole(req, res, 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    const target = state.users.find((u) => u.id === id);
    if (!target) return fail(res, 404, 'User not found', 'NOT_FOUND');
    const body = await parseBody(req);
    if (body.role) target.role = body.role;
    if (body.status) target.status = body.status;
    if (body.firstName) target.firstName = body.firstName;
    if (body.lastName) target.lastName = body.lastName;
    ok(res, { id: target.id, email: target.email, role: target.role, status: target.status });
  }),

  r('DELETE', '/api/admin/users/:id', (req, res, { id }) => {
    const user = requireRole(req, res, 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    const idx = state.users.findIndex((u) => u.id === id);
    if (idx < 0) return fail(res, 404, 'User not found', 'NOT_FOUND');
    // Block delete if user has active orders.
    if (state.orders.some((o) => o.customerId === id && (o.status === 'PROCESSING' || o.status === 'SHIPPED'))) {
      return fail(res, 409, 'Cannot delete user with active orders', 'USER_HAS_ACTIVE_ORDERS');
    }
    state.users.splice(idx, 1);
    res.writeHead(204);
    res.end();
  }),

  r('GET', '/api/admin/analytics', (req, res) => {
    const user = requireRole(req, res, 'ADMIN', 'SUPER_ADMIN');
    if (!user) return;
    ok(res, {
      overview: { totalUsers: state.users.length, totalOrders: state.orders.length, totalRevenue: 4580000 },
      voice: { totalCalls: 1247, avgDuration: 184, deflectionRate: 68 },
      ai: { totalQueries: 8924, avgLatencyMs: 1840, satisfactionScore: 4.6, hallucinationRate: 0.024 },
      sales: { mtd: 380500, target: 500000, growth: 12.4 },
    });
  }),
];

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

let server: Server | null = null;
let portInUse = 0;

async function handle(req: IncomingMessage, res: ServerResponse) {
  // CORS preflight.
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-CSRF-Token',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://mock');
  const path = url.pathname;

  // Apply slow/fail overrides.
  if (await applyOverrides(req, res, path)) return;

  // Find a matching route.
  for (const route of router) {
    if (route.method !== req.method) continue;
    const match = route.pattern.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1] ?? '');
    });
    const status = await Promise.resolve(route.handler(req, res, params)).then(
      () => 200, // handler already wrote its own status — placeholder
      (err) => {
        fail(res, 500, `Internal mock error: ${(err as Error).message}`, 'MOCK_INTERNAL');
        return 500;
      },
    );
    state.requestLog.push({ method: req.method ?? 'GET', path, status, at: Date.now() });
    return;
  }

  // No route matched.
  state.requestLog.push({ method: req.method ?? 'GET', path, status: 404, at: Date.now() });
  fail(res, 404, `Not Found: ${path}`, 'NOT_FOUND');
}

export interface MockBackend {
  port: number;
  baseUrl: string;
  close: () => Promise<void>;
  reset: () => Promise<void>;
  getState: () => Promise<any>;
  failNext: (path: string, count?: number) => Promise<void>;
  slowNext: (path: string, count: number, delayMs: number) => Promise<void>;
}

export async function startMockBackend(port = 0): Promise<MockBackend> {
  if (server) await closeMockBackend();

  server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      try {
        fail(res, 500, `Mock error: ${(err as Error).message}`, 'MOCK_UNHANDLED');
      } catch {
        // ignore — response may already have been sent
      }
    });
  });

  await new Promise<void>((resolve) => {
    server!.listen(port, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  portInUse = typeof addr === 'object' && addr ? addr.port : port;

  return {
    port: portInUse,
    baseUrl: `http://127.0.0.1:${portInUse}`,
    close: closeMockBackend,
    reset: async () => {
      state = freshState();
    },
    getState: async () => {
      const res = await fetch(`http://127.0.0.1:${portInUse}/__mock/state`);
      return res.json();
    },
    failNext: async (path: string, count = 1) => {
      await fetch(`http://127.0.0.1:${portInUse}/__mock/fail-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, count }),
      });
    },
    slowNext: async (path: string, count: number, delayMs: number) => {
      await fetch(`http://127.0.0.1:${portInUse}/__mock/slow-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, count, delayMs }),
      });
    },
  };
}

export async function closeMockBackend(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
  portInUse = 0;
}
