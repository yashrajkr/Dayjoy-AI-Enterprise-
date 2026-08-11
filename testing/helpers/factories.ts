/**
 * Test data factories — dynamic builders for fresh records.
 *
 * Use these when a test needs multiple distinct rows (e.g. "create 50
 * customers and verify pagination"). Each factory generates a fresh
 * UUID by default and accepts an `overrides?` object so tests can pin
 * specific fields while letting the rest randomise.
 *
 * Every factory returns a plain object matching the camelCase Prisma
 * model shape — it does NOT write to the database. Tests pass the
 * returned object to `prisma.<model>.create.mockResolvedValue(...)` (in
 * unit tests) or `prisma.<model>.create({ data: factory(...) })` (in
 * integration tests).
 */

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

/** Generate a short random suffix for human-readable identifiers. */
function suffix(len = 6): string {
  return Math.random().toString(36).slice(2, 2 + len);
}

/** Generate a unique email under the test domain. */
function uniqueEmail(prefix: string): string {
  return `${prefix}-${suffix()}@dayjoy.test`;
}

/** Default tenant ID used by all factories. */
const DEFAULT_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------

export interface UserOverrides {
  id?: string;
  tenantId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  passwordHash?: string;
  role?: string;
  status?: string;
  isEmailVerified?: boolean;
  lastLoginAt?: Date | null;
}

export function createUser(overrides: UserOverrides = {}) {
  const n = suffix();
  return {
    id: overrides.id ?? `user-${n}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    email: overrides.email ?? uniqueEmail(`user-${n}`),
    firstName: overrides.firstName ?? 'Test',
    lastName: overrides.lastName ?? `User-${n}`,
    phone: overrides.phone ?? `+1555${suffix(7).padStart(7, '0')}`,
    passwordHash: overrides.passwordHash ?? '$2a$12$mockhashmockhashmockhashmockhashmockhash',
    role: overrides.role ?? 'USER',
    status: overrides.status ?? 'ACTIVE',
    isEmailVerified: overrides.isEmailVerified ?? true,
    lastLoginAt: overrides.lastLoginAt ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createAdmin(overrides: UserOverrides = {}) {
  return createUser({ ...overrides, role: 'ADMIN' });
}

export function createSuperAdmin(overrides: UserOverrides = {}) {
  return createUser({ ...overrides, role: 'SUPER_ADMIN' });
}

export function createEmployeeUser(overrides: UserOverrides = {}) {
  return createUser({ ...overrides, role: 'EMPLOYEE' });
}

// ---------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------

export interface CustomerOverrides {
  id?: string;
  tenantId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  type?: 'INDIVIDUAL' | 'BUSINESS';
  source?: string;
  status?: string;
  lifetimeValue?: number;
  totalOrders?: number;
  totalSpent?: number;
  createdBy?: string;
}

export function createCustomer(overrides: CustomerOverrides = {}) {
  const n = suffix();
  return {
    id: overrides.id ?? `cust-${n}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    firstName: overrides.firstName ?? 'Customer',
    lastName: overrides.lastName ?? `#${n}`,
    email: overrides.email ?? uniqueEmail(`cust-${n}`),
    phone: overrides.phone ?? `+1555${suffix(7).padStart(7, '0')}`,
    type: overrides.type ?? 'INDIVIDUAL',
    source: overrides.source ?? 'WEBSITE',
    status: overrides.status ?? 'ACTIVE',
    lifetimeValue: overrides.lifetimeValue ?? 0,
    totalOrders: overrides.totalOrders ?? 0,
    totalSpent: overrides.totalSpent ?? 0,
    createdBy: overrides.createdBy ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------
// Distributors
// ---------------------------------------------------------------------

export interface DistributorOverrides {
  id?: string;
  tenantId?: string;
  userId?: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  tier?: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  status?: string;
  commissionRate?: number;
  totalSales?: number;
  totalCommission?: number;
  totalOrders?: number;
}

export function createDistributor(overrides: DistributorOverrides = {}) {
  const n = suffix();
  return {
    id: overrides.id ?? `dist-${n}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    userId: overrides.userId ?? null,
    companyName: overrides.companyName ?? `Distributor Co ${n}`,
    contactName: overrides.contactName ?? `Distributor ${n}`,
    email: overrides.email ?? uniqueEmail(`dist-${n}`),
    phone: overrides.phone ?? `+1555${suffix(7).padStart(7, '0')}`,
    tier: overrides.tier ?? 'BRONZE',
    status: overrides.status ?? 'ACTIVE',
    commissionRate: overrides.commissionRate ?? 3,
    totalSales: overrides.totalSales ?? 0,
    totalCommission: overrides.totalCommission ?? 0,
    totalOrders: overrides.totalOrders ?? 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------

export interface ProductOverrides {
  id?: string;
  tenantId?: string;
  categoryId?: string;
  sku?: string;
  name?: string;
  slug?: string;
  description?: string;
  price?: number;
  costPrice?: number;
  status?: string;
  images?: string[];
  attributes?: Record<string, unknown>;
}

export function createProduct(overrides: ProductOverrides = {}) {
  const n = suffix();
  const name = overrides.name ?? `Test Product ${n}`;
  return {
    id: overrides.id ?? `prod-${n}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    categoryId: overrides.categoryId ?? null,
    sku: overrides.sku ?? `SKU-${n.toUpperCase()}`,
    name,
    slug: overrides.slug ?? name.toLowerCase().replace(/\s+/g, '-'),
    description: overrides.description ?? 'A test product',
    price: overrides.price ?? 29.99,
    costPrice: overrides.costPrice ?? 10.0,
    status: overrides.status ?? 'ACTIVE',
    images: overrides.images ?? [],
    attributes: overrides.attributes ?? {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createInventory(productId: string, overrides: { quantity?: number; reserved?: number; lowStockThreshold?: number; tenantId?: string } = {}) {
  return {
    id: `inv-${suffix()}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    productId,
    quantity: overrides.quantity ?? 100,
    reserved: overrides.reserved ?? 0,
    lowStockThreshold: overrides.lowStockThreshold ?? 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------
// Orders + items
// ---------------------------------------------------------------------

export interface OrderOverrides {
  id?: string;
  tenantId?: string;
  orderNumber?: string;
  customerId?: string;
  distributorId?: string | null;
  status?: string;
  paymentStatus?: string;
  subtotal?: number;
  tax?: number;
  shipping?: number;
  discount?: number;
  total?: number;
  currency?: string;
  notes?: string;
  shippingAddress?: Record<string, unknown>;
  billingAddress?: Record<string, unknown>;
  placedAt?: Date;
}

export function createOrder(overrides: OrderOverrides = {}) {
  const n = suffix();
  return {
    id: overrides.id ?? `order-${n}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    orderNumber:
      overrides.orderNumber ?? `DJ-2025-${n.toUpperCase().padStart(6, '0')}`,
    customerId: overrides.customerId ?? `cust-${n}`,
    distributorId: overrides.distributorId ?? null,
    status: overrides.status ?? 'PENDING',
    paymentStatus: overrides.paymentStatus ?? 'PENDING',
    subtotal: overrides.subtotal ?? 0,
    tax: overrides.tax ?? 0,
    shipping: overrides.shipping ?? 0,
    discount: overrides.discount ?? 0,
    total: overrides.total ?? 0,
    currency: overrides.currency ?? 'USD',
    notes: overrides.notes ?? null,
    shippingAddress: overrides.shippingAddress ?? {
      line1: '123 Test St',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701',
      country: 'US',
    },
    billingAddress: overrides.billingAddress ?? {
      line1: '123 Test St',
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701',
      country: 'US',
    },
    placedAt: overrides.placedAt ?? new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export interface OrderItemOverrides {
  id?: string;
  orderId?: string;
  productId?: string;
  productName?: string;
  productSku?: string;
  quantity?: number;
  unitPrice?: number;
  tax?: number;
  discount?: number;
  total?: number;
}

export function createOrderItem(overrides: OrderItemOverrides = {}) {
  const qty = overrides.quantity ?? 1;
  const unit = overrides.unitPrice ?? 29.99;
  const tax = overrides.tax ?? 0;
  const discount = overrides.discount ?? 0;
  return {
    id: overrides.id ?? `item-${suffix()}`,
    orderId: overrides.orderId ?? `order-${suffix()}`,
    productId: overrides.productId ?? `prod-${suffix()}`,
    productName: overrides.productName ?? 'Test Product',
    productSku: overrides.productSku ?? 'SKU-TEST',
    quantity: qty,
    unitPrice: unit,
    tax,
    discount,
    total: overrides.total ?? qty * unit + tax - discount,
    createdAt: new Date(),
  };
}

/**
 * Build a complete order with N items — convenient for order-flow tests.
 */
export function createOrderWithItems(
  itemCount: number,
  overrides: OrderOverrides = {},
  itemOverrides: Partial<OrderItemOverrides> = {},
) {
  const order = createOrder(overrides);
  const items = Array.from({ length: itemCount }, () =>
    createOrderItem({ ...itemOverrides, orderId: order.id }),
  );
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const tax = items.reduce((s, i) => s + i.tax, 0);
  const total = subtotal + tax + (overrides.shipping ?? 0) - (overrides.discount ?? 0);
  return { ...order, subtotal, tax, total, items };
}

// ---------------------------------------------------------------------
// AI — agents / conversations / messages / memory
// ---------------------------------------------------------------------

export interface AiAgentOverrides {
  id?: string;
  tenantId?: string;
  name?: string;
  description?: string;
  type?: string;
  status?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  toolsEnabled?: boolean;
}

export function createAiAgent(overrides: AiAgentOverrides = {}) {
  const n = suffix();
  return {
    id: overrides.id ?? `agent-${n}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    name: overrides.name ?? `Test Agent ${n}`,
    description: overrides.description ?? 'A test AI agent',
    type: overrides.type ?? 'CUSTOMER_SUPPORT',
    status: overrides.status ?? 'active',
    model: overrides.model ?? 'gpt-4o',
    systemPrompt: overrides.systemPrompt ?? 'You are a helpful assistant.',
    temperature: overrides.temperature ?? 0.7,
    maxTokens: overrides.maxTokens ?? 1000,
    toolsEnabled: overrides.toolsEnabled ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export interface ConversationOverrides {
  id?: string;
  tenantId?: string;
  agentId?: string;
  userId?: string;
  customerId?: string;
  channel?: string;
  status?: string;
  title?: string;
  messageCount?: number;
  lastMessageAt?: Date | null;
}

export function createConversation(overrides: ConversationOverrides = {}) {
  const n = suffix();
  return {
    id: overrides.id ?? `conv-${n}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    agentId: overrides.agentId ?? null,
    userId: overrides.userId ?? null,
    customerId: overrides.customerId ?? null,
    channel: overrides.channel ?? 'WEBSITE',
    status: overrides.status ?? 'active',
    title: overrides.title ?? `Test Conversation ${n}`,
    messageCount: overrides.messageCount ?? 0,
    lastMessageAt: overrides.lastMessageAt ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export interface MessageOverrides {
  id?: string;
  conversationId?: string;
  role?: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  toolCalls?: unknown;
  toolCallId?: string | null;
  tokens?: number;
}

export function createMessage(overrides: MessageOverrides = {}) {
  return {
    id: overrides.id ?? `msg-${suffix()}`,
    conversationId: overrides.conversationId ?? `conv-${suffix()}`,
    role: overrides.role ?? 'user',
    content: overrides.content ?? 'test message',
    toolCalls: overrides.toolCalls ?? null,
    toolCallId: overrides.toolCallId ?? null,
    tokens: overrides.tokens ?? 10,
    createdAt: new Date(),
  };
}

export interface AiMemoryOverrides {
  id?: string;
  tenantId?: string;
  agentId?: string;
  userId?: string;
  customerId?: string;
  type?: 'FACT' | 'PREFERENCE' | 'HISTORY' | 'CONTEXT';
  content?: string;
  importance?: number;
}

export function createAiMemory(overrides: AiMemoryOverrides = {}) {
  return {
    id: overrides.id ?? `mem-${suffix()}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    agentId: overrides.agentId ?? null,
    userId: overrides.userId ?? null,
    customerId: overrides.customerId ?? null,
    type: overrides.type ?? 'FACT',
    content: overrides.content ?? 'A test memory',
    importance: overrides.importance ?? 0.5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------
// RAG / Knowledge
// ---------------------------------------------------------------------

export function createRagSource(overrides: { id?: string; tenantId?: string; name?: string; type?: string; status?: string } = {}) {
  return {
    id: overrides.id ?? `src-${suffix()}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    name: overrides.name ?? `Test Source ${suffix()}`,
    type: overrides.type ?? 'manual',
    status: overrides.status ?? 'active',
    documentCount: 0,
    chunkCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createRagDocument(overrides: { id?: string; tenantId?: string; sourceId?: string; title?: string; content?: string; contentType?: string; status?: string } = {}) {
  return {
    id: overrides.id ?? `doc-${suffix()}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    sourceId: overrides.sourceId ?? null,
    title: overrides.title ?? `Test Document ${suffix()}`,
    content: overrides.content ?? 'Test content for RAG document.',
    contentType: overrides.contentType ?? 'text/plain',
    contentHash: `sha256-${suffix(20)}`,
    status: overrides.status ?? 'ready',
    chunkCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createRagChunk(overrides: { id?: string; tenantId?: string; documentId?: string; sourceId?: string; content?: string; chunkIndex?: number; tokenCount?: number } = {}) {
  return {
    id: overrides.id ?? `chunk-${suffix()}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    documentId: overrides.documentId ?? null,
    sourceId: overrides.sourceId ?? null,
    content: overrides.content ?? 'Test chunk content.',
    chunkIndex: overrides.chunkIndex ?? 0,
    tokenCount: overrides.tokenCount ?? 10,
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------
// Voice (Vapi)
// ---------------------------------------------------------------------

export interface VoiceSessionOverrides {
  id?: string;
  tenantId?: string;
  callId?: string;
  assistantId?: string;
  agentId?: string;
  customerId?: string;
  customerNumber?: string;
  direction?: string;
  status?: string;
  startedAt?: Date;
  endedAt?: Date | null;
  durationSeconds?: number;
  cost?: number;
  transcript?: string;
  summary?: string;
}

export function createVoiceSession(overrides: VoiceSessionOverrides = {}) {
  const n = suffix();
  return {
    id: overrides.id ?? `vs-${n}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    callId: overrides.callId ?? `call-mock-${n}`,
    assistantId: overrides.assistantId ?? `assistant-mock-${n}`,
    agentId: overrides.agentId ?? null,
    customerId: overrides.customerId ?? null,
    customerNumber: overrides.customerNumber ?? `+1555${suffix(7).padStart(7, '0')}`,
    direction: overrides.direction ?? 'inbound',
    status: overrides.status ?? 'in-progress',
    startedAt: overrides.startedAt ?? new Date(),
    endedAt: overrides.endedAt ?? null,
    durationSeconds: overrides.durationSeconds ?? 0,
    cost: overrides.cost ?? 0,
    transcript: overrides.transcript ?? '',
    summary: overrides.summary ?? '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------

export function createWhatsAppContact(overrides: { id?: string; tenantId?: string; phoneNumber?: string; name?: string; waId?: string; isOptedIn?: boolean } = {}) {
  const phone = overrides.phoneNumber ?? `+1555${suffix(7).padStart(7, '0')}`;
  return {
    id: overrides.id ?? `wa-c-${suffix()}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    phoneNumber: phone,
    name: overrides.name ?? 'WA Contact',
    waId: overrides.waId ?? phone.replace('+', ''),
    isOptedIn: overrides.isOptedIn ?? true,
    optedOutAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createWhatsAppSession(overrides: { id?: string; tenantId?: string; contactId?: string; contactPhone?: string; status?: string } = {}) {
  return {
    id: overrides.id ?? `wa-s-${suffix()}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    contactId: overrides.contactId ?? null,
    contactPhone: overrides.contactPhone ?? `+1555${suffix(7).padStart(7, '0')}`,
    status: overrides.status ?? 'open',
    lastMessageAt: new Date(),
    lastMessageDirection: 'inbound',
    totalMessages: 0,
    unreadCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createWhatsAppMessage(overrides: { id?: string; tenantId?: string; sessionId?: string; contactId?: string; waMessageId?: string; direction?: string; type?: string; content?: string; status?: string } = {}) {
  return {
    id: overrides.id ?? `wa-m-${suffix()}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    sessionId: overrides.sessionId ?? null,
    contactId: overrides.contactId ?? null,
    waMessageId: overrides.waMessageId ?? `wamid-mock-${suffix(12)}`,
    direction: overrides.direction ?? 'inbound',
    type: overrides.type ?? 'text',
    content: overrides.content ?? 'test message',
    status: overrides.status ?? 'sent',
    timestamp: new Date(),
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------

export function createNotification(overrides: { id?: string; tenantId?: string; userId?: string; type?: string; priority?: string; title?: string; body?: string; channel?: string; status?: string; data?: unknown } = {}) {
  return {
    id: overrides.id ?? `notif-${suffix()}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    userId: overrides.userId ?? `user-${suffix()}`,
    type: overrides.type ?? 'SYSTEM',
    priority: overrides.priority ?? 'NORMAL',
    title: overrides.title ?? 'Test notification',
    body: overrides.body ?? 'Test body',
    channel: overrides.channel ?? 'IN_APP',
    status: overrides.status ?? 'unread',
    data: overrides.data ?? {},
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------
// Leads + support tickets
// ---------------------------------------------------------------------

export function createLead(overrides: { id?: string; tenantId?: string; firstName?: string; lastName?: string; email?: string; phone?: string; source?: string; status?: string; score?: number; assignedTo?: string | null } = {}) {
  const n = suffix();
  return {
    id: overrides.id ?? `lead-${n}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    firstName: overrides.firstName ?? 'Lead',
    lastName: overrides.lastName ?? `#${n}`,
    email: overrides.email ?? uniqueEmail(`lead-${n}`),
    phone: overrides.phone ?? `+1555${suffix(7).padStart(7, '0')}`,
    source: overrides.source ?? 'WEBSITE',
    status: overrides.status ?? 'NEW',
    score: overrides.score ?? 50,
    assignedTo: overrides.assignedTo ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createSupportTicket(overrides: { id?: string; tenantId?: string; ticketNumber?: string; subject?: string; description?: string; status?: string; priority?: string; customerId?: string; assignedTo?: string | null; slaDueAt?: Date } = {}) {
  const n = suffix();
  return {
    id: overrides.id ?? `tkt-${n}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    ticketNumber: overrides.ticketNumber ?? `TKT-2025-${n.toUpperCase().padStart(6, '0')}`,
    subject: overrides.subject ?? `Test ticket ${n}`,
    description: overrides.description ?? 'A test support ticket',
    status: overrides.status ?? 'OPEN',
    priority: overrides.priority ?? 'NORMAL',
    customerId: overrides.customerId ?? null,
    assignedTo: overrides.assignedTo ?? null,
    slaDueAt: overrides.slaDueAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------
// Misc — audit log, role, permission
// ---------------------------------------------------------------------

export function createAuditLog(overrides: { id?: string; tenantId?: string; actorId?: string; actorEmail?: string; action?: string; resourceType?: string; resourceId?: string; oldValues?: unknown; newValues?: unknown } = {}) {
  return {
    id: overrides.id ?? randomUUID(),
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    actorId: overrides.actorId ?? null,
    actorEmail: overrides.actorEmail ?? null,
    action: overrides.action ?? 'UPDATE',
    resourceType: overrides.resourceType ?? 'Unknown',
    resourceId: overrides.resourceId ?? null,
    oldValues: overrides.oldValues ?? null,
    newValues: overrides.newValues ?? null,
    ipAddress: '192.0.2.1',
    userAgent: 'vitest/1.0',
    createdAt: new Date(),
  };
}

export function createRole(overrides: { id?: string; tenantId?: string; name?: string; description?: string } = {}) {
  return {
    id: overrides.id ?? `role-${suffix()}`,
    tenantId: overrides.tenantId ?? DEFAULT_TENANT_ID,
    name: overrides.name ?? `ROLE_${suffix(4).toUpperCase()}`,
    description: overrides.description ?? 'Test role',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function createPermission(overrides: { id?: string; name?: string; description?: string; resource?: string; action?: string } = {}) {
  return {
    id: overrides.id ?? `perm-${suffix()}`,
    name: overrides.name ?? `${overrides.resource ?? 'test'}:${overrides.action ?? 'read'}`,
    description: overrides.description ?? 'Test permission',
    resource: overrides.resource ?? 'test',
    action: overrides.action ?? 'read',
    createdAt: new Date(),
  };
}
