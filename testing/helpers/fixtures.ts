/**
 * Static test fixtures — stable sample records with known IDs.
 *
 * Use these when a test needs a specific, predictable shape. For
 * dynamic multi-row creation, use the factories in `factories.ts`
 * instead.
 *
 * All fixtures are written against the camelCase Prisma schema
 * (matching `backend/_shared/testing/mock-prisma.service.ts`). IDs are
 * fixed so tests can hard-code assertions on them.
 */

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------

export const testTenant = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Dayjoy Test Tenant',
  slug: 'dayjoy-test',
  status: 'ACTIVE',
  domain: 'test.dayjoy.ai',
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

export const secondTenant = {
  id: '00000000-0000-0000-0000-000000000002',
  name: 'Acme Corp',
  slug: 'acme',
  status: 'ACTIVE',
  domain: 'acme.dayjoy.ai',
  createdAt: new Date('2025-01-02T00:00:00.000Z'),
  updatedAt: new Date('2025-01-02T00:00:00.000Z'),
};

// ---------------------------------------------------------------------
// Users / Auth
// ---------------------------------------------------------------------

export const testUser = {
  id: 'user-00000001',
  tenantId: testTenant.id,
  email: 'admin@dayjoy.test',
  firstName: 'Ada',
  lastName: 'Admin',
  phone: '+15550000001',
  passwordHash: '$2a$12$mockhashadminadminadminadminadminadminadmi',
  role: 'ADMIN',
  status: 'ACTIVE',
  isEmailVerified: true,
  lastLoginAt: new Date('2025-06-01T10:00:00.000Z'),
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-06-01T10:00:00.000Z'),
};

export const testSuperAdmin = {
  id: 'user-00000000',
  tenantId: testTenant.id,
  email: 'superadmin@dayjoy.test',
  firstName: 'Sue',
  lastName: 'Superadmin',
  phone: '+15550000000',
  passwordHash: '$2a$12$mockhashsuperadminsuperadminsuperadminsup',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  isEmailVerified: true,
  lastLoginAt: new Date('2025-06-01T10:00:00.000Z'),
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-06-01T10:00:00.000Z'),
};

export const testEmployee = {
  id: 'user-00000002',
  tenantId: testTenant.id,
  email: 'employee@dayjoy.test',
  firstName: 'Eve',
  lastName: 'Employee',
  phone: '+15550000002',
  passwordHash: '$2a$12$mockhashemployeeemployeeemployeeemployeeem',
  role: 'EMPLOYEE',
  status: 'ACTIVE',
  isEmailVerified: true,
  lastLoginAt: null,
  createdAt: new Date('2025-02-01T00:00:00.000Z'),
  updatedAt: new Date('2025-02-01T00:00:00.000Z'),
};

export const testCustomerUser = {
  id: 'user-00000003',
  tenantId: testTenant.id,
  email: 'customer@dayjoy.test',
  firstName: 'Cory',
  lastName: 'Customer',
  phone: '+15550000003',
  passwordHash: '$2a$12$mockhashcustomercustomercustomercustomerc',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  isEmailVerified: true,
  lastLoginAt: null,
  createdAt: new Date('2025-03-01T00:00:00.000Z'),
  updatedAt: new Date('2025-03-01T00:00:00.000Z'),
};

// Authenticated-user shape (what `req.user` looks like after JWT decode)
export const testAuthUser = {
  userId: testUser.id,
  tenantId: testTenant.id,
  email: testUser.email,
  jti: 'jti-test-0001',
};

export const testSuperAdminAuthUser = {
  userId: testSuperAdmin.id,
  tenantId: testTenant.id,
  email: testSuperAdmin.email,
  jti: 'jti-test-0000',
};

// ---------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------

export const testCustomer = {
  id: 'cust-00000001',
  tenantId: testTenant.id,
  firstName: 'Cory',
  lastName: 'Customer',
  email: 'customer@example.com',
  phone: '+15551234567',
  type: 'INDIVIDUAL',
  source: 'WEBSITE',
  status: 'ACTIVE',
  lifetimeValue: 0,
  totalOrders: 0,
  totalSpent: 0,
  createdBy: testUser.id,
  createdAt: new Date('2025-03-01T00:00:00.000Z'),
  updatedAt: new Date('2025-03-01T00:00:00.000Z'),
};

// ---------------------------------------------------------------------
// Distributors
// ---------------------------------------------------------------------

export const testDistributor = {
  id: 'dist-00000001',
  tenantId: testTenant.id,
  userId: testEmployee.id,
  companyName: 'Acme Distribution Co.',
  contactName: 'Dana Distributor',
  email: 'dana@acme-dist.test',
  phone: '+15557651234',
  tier: 'GOLD',
  status: 'ACTIVE',
  commissionRate: 8,
  totalSales: 0,
  totalCommission: 0,
  totalOrders: 0,
  createdAt: new Date('2025-01-15T00:00:00.000Z'),
  updatedAt: new Date('2025-01-15T00:00:00.000Z'),
};

// ---------------------------------------------------------------------
// Products + inventory
// ---------------------------------------------------------------------

export const testProductCategory = {
  id: 'cat-00000001',
  tenantId: testTenant.id,
  name: 'Skincare',
  slug: 'skincare',
  description: 'Skincare products',
  createdAt: new Date('2025-01-05T00:00:00.000Z'),
  updatedAt: new Date('2025-01-05T00:00:00.000Z'),
};

export const testProduct = {
  id: 'prod-00000001',
  tenantId: testTenant.id,
  categoryId: testProductCategory.id,
  sku: 'SKU-0001',
  name: 'Vitamin C Serum',
  slug: 'vitamin-c-serum',
  description: 'Brightening vitamin C serum',
  price: 49.99,
  costPrice: 18.0,
  status: 'ACTIVE',
  images: ['https://cdn.dayjoy.test/vitc.jpg'],
  attributes: { size: '30ml', shade: 'n/a' },
  createdAt: new Date('2025-01-10T00:00:00.000Z'),
  updatedAt: new Date('2025-01-10T00:00:00.000Z'),
};

export const testInventory = {
  id: 'inv-00000001',
  tenantId: testTenant.id,
  productId: testProduct.id,
  quantity: 100,
  reserved: 0,
  lowStockThreshold: 10,
  createdAt: new Date('2025-01-10T00:00:00.000Z'),
  updatedAt: new Date('2025-01-10T00:00:00.000Z'),
};

// ---------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------

export const testOrder = {
  id: 'order-00000001',
  tenantId: testTenant.id,
  orderNumber: 'DJ-2025-000001',
  customerId: testCustomer.id,
  distributorId: testDistributor.id,
  status: 'PENDING',
  paymentStatus: 'PENDING',
  subtotal: 99.98,
  tax: 8.0,
  shipping: 5.0,
  discount: 0,
  total: 112.98,
  currency: 'USD',
  notes: 'Test order',
  shippingAddress: {
    line1: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    postalCode: '62701',
    country: 'US',
  },
  billingAddress: {
    line1: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    postalCode: '62701',
    country: 'US',
  },
  placedAt: new Date('2025-05-15T12:00:00.000Z'),
  createdAt: new Date('2025-05-15T12:00:00.000Z'),
  updatedAt: new Date('2025-05-15T12:00:00.000Z'),
};

export const testOrderItem = {
  id: 'item-00000001',
  orderId: testOrder.id,
  productId: testProduct.id,
  productName: testProduct.name,
  productSku: testProduct.sku,
  quantity: 2,
  unitPrice: testProduct.price,
  tax: 8.0,
  discount: 0,
  total: 99.98,
  createdAt: new Date('2025-05-15T12:00:00.000Z'),
};

// ---------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------

export const testAiAgent = {
  id: 'agent-00000001',
  tenantId: testTenant.id,
  name: 'Dayjoy Assistant',
  description: 'Main customer-facing AI assistant',
  type: 'CUSTOMER_SUPPORT',
  status: 'active',
  model: 'gpt-4o',
  systemPrompt: 'You are a helpful assistant for Dayjoy customers.',
  temperature: 0.7,
  maxTokens: 1000,
  toolsEnabled: true,
  createdAt: new Date('2025-01-20T00:00:00.000Z'),
  updatedAt: new Date('2025-01-20T00:00:00.000Z'),
};

export const testConversation = {
  id: 'conv-00000001',
  tenantId: testTenant.id,
  agentId: testAiAgent.id,
  userId: testCustomerUser.id,
  customerId: testCustomer.id,
  channel: 'WEBSITE',
  status: 'active',
  title: 'Customer support conversation',
  messageCount: 0,
  lastMessageAt: new Date('2025-06-01T10:00:00.000Z'),
  createdAt: new Date('2025-06-01T09:30:00.000Z'),
  updatedAt: new Date('2025-06-01T10:00:00.000Z'),
};

export const testMessage = {
  id: 'msg-00000001',
  conversationId: testConversation.id,
  role: 'user',
  content: 'Hello, I have a question about my order.',
  tokens: 12,
  createdAt: new Date('2025-06-01T10:00:00.000Z'),
};

export const testAiMemory = {
  id: 'mem-00000001',
  tenantId: testTenant.id,
  agentId: testAiAgent.id,
  userId: testCustomerUser.id,
  customerId: testCustomer.id,
  type: 'PREFERENCE',
  content: 'Customer prefers email over SMS.',
  importance: 0.8,
  createdAt: new Date('2025-06-01T10:00:00.000Z'),
  updatedAt: new Date('2025-06-01T10:00:00.000Z'),
};

// ---------------------------------------------------------------------
// RAG / Knowledge
// ---------------------------------------------------------------------

export const testRagSource = {
  id: 'src-00000001',
  tenantId: testTenant.id,
  name: 'Product Manual',
  type: 'manual',
  status: 'active',
  documentCount: 0,
  chunkCount: 0,
  createdAt: new Date('2025-01-25T00:00:00.000Z'),
  updatedAt: new Date('2025-01-25T00:00:00.000Z'),
};

export const testRagDocument = {
  id: 'doc-00000001',
  tenantId: testTenant.id,
  sourceId: testRagSource.id,
  title: 'Vitamin C Serum Usage Guide',
  content: 'Apply 2-3 drops to clean skin morning and evening.',
  contentType: 'text/plain',
  contentHash: 'sha256-mockhash',
  status: 'ready',
  chunkCount: 0,
  createdAt: new Date('2025-01-25T00:00:00.000Z'),
  updatedAt: new Date('2025-01-25T00:00:00.000Z'),
};

export const testRagChunk = {
  id: 'chunk-00000001',
  tenantId: testTenant.id,
  documentId: testRagDocument.id,
  sourceId: testRagSource.id,
  content: 'Apply 2-3 drops to clean skin morning and evening.',
  chunkIndex: 0,
  tokenCount: 12,
  createdAt: new Date('2025-01-25T00:00:00.000Z'),
};

// ---------------------------------------------------------------------
// Voice (Vapi)
// ---------------------------------------------------------------------

export const testVoiceSession = {
  id: 'vs-00000001',
  tenantId: testTenant.id,
  callId: 'call-mock-0001',
  assistantId: 'assistant-mock-0001',
  agentId: testAiAgent.id,
  customerId: testCustomer.id,
  customerNumber: '+15551234567',
  direction: 'inbound',
  status: 'in-progress',
  startedAt: new Date('2025-06-01T10:00:00.000Z'),
  endedAt: null,
  durationSeconds: 0,
  cost: 0,
  transcript: '',
  summary: '',
  createdAt: new Date('2025-06-01T10:00:00.000Z'),
  updatedAt: new Date('2025-06-01T10:00:00.000Z'),
};

// ---------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------

export const testWhatsAppContact = {
  id: 'wa-c-00000001',
  tenantId: testTenant.id,
  phoneNumber: '+15551234567',
  name: 'Cory Customer',
  waId: '15551234567',
  isOptedIn: true,
  optedOutAt: null,
  createdAt: new Date('2025-04-01T00:00:00.000Z'),
  updatedAt: new Date('2025-04-01T00:00:00.000Z'),
};

export const testWhatsAppSession = {
  id: 'wa-s-00000001',
  tenantId: testTenant.id,
  contactId: testWhatsAppContact.id,
  contactPhone: testWhatsAppContact.phoneNumber,
  status: 'open',
  lastMessageAt: new Date('2025-06-01T10:00:00.000Z'),
  lastMessageDirection: 'inbound',
  totalMessages: 0,
  unreadCount: 0,
  createdAt: new Date('2025-06-01T09:00:00.000Z'),
  updatedAt: new Date('2025-06-01T10:00:00.000Z'),
};

export const testWhatsAppMessage = {
  id: 'wa-m-00000001',
  tenantId: testTenant.id,
  sessionId: testWhatsAppSession.id,
  contactId: testWhatsAppContact.id,
  waMessageId: 'wamid-mock-0001',
  direction: 'inbound',
  type: 'text',
  content: 'Hi, I want to know about Vitamin C Serum',
  status: 'read',
  timestamp: new Date('2025-06-01T10:00:00.000Z'),
  createdAt: new Date('2025-06-01T10:00:00.000Z'),
};

// ---------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------

export const testNotificationTemplate = {
  id: 'tmpl-00000001',
  tenantId: testTenant.id,
  code: 'order_confirmation',
  name: 'Order Confirmation',
  channel: 'EMAIL',
  subject: 'Your order {{orderNumber}} is confirmed',
  body: 'Hi {{firstName}}, your order {{orderNumber}} totaling {{total}} is confirmed.',
  variables: ['orderNumber', 'firstName', 'total'],
  isActive: true,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

export const testNotification = {
  id: 'notif-00000001',
  tenantId: testTenant.id,
  userId: testUser.id,
  type: 'ORDER_UPDATE',
  priority: 'NORMAL',
  title: 'Order shipped',
  body: 'Your order DJ-2025-000001 has shipped.',
  channel: 'IN_APP',
  status: 'unread',
  data: { orderId: testOrder.id },
  readAt: null,
  createdAt: new Date('2025-06-01T10:00:00.000Z'),
  updatedAt: new Date('2025-06-01T10:00:00.000Z'),
};

// ---------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------

export const testLead = {
  id: 'lead-00000001',
  tenantId: testTenant.id,
  firstName: 'Larry',
  lastName: 'Lead',
  email: 'larry@example.com',
  phone: '+15559876543',
  source: 'WEBSITE',
  status: 'NEW',
  score: 50,
  assignedTo: testEmployee.id,
  notes: 'Inquired about Vitamin C Serum',
  createdAt: new Date('2025-05-20T00:00:00.000Z'),
  updatedAt: new Date('2025-05-20T00:00:00.000Z'),
};

// ---------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------

export const testSupportTicket = {
  id: 'tkt-00000001',
  tenantId: testTenant.id,
  ticketNumber: 'TKT-2025-000001',
  subject: 'Damaged product received',
  description: 'The serum bottle arrived cracked.',
  status: 'OPEN',
  priority: 'HIGH',
  customerId: testCustomer.id,
  assignedTo: testEmployee.id,
  slaDueAt: new Date('2025-06-02T10:00:00.000Z'),
  resolvedAt: null,
  createdAt: new Date('2025-06-01T10:00:00.000Z'),
  updatedAt: new Date('2025-06-01T10:00:00.000Z'),
};

// ---------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------

export const testAuditLog = {
  id: randomUUID(),
  tenantId: testTenant.id,
  actorId: testUser.id,
  actorEmail: testUser.email,
  action: 'UPDATE',
  resourceType: 'Order',
  resourceId: testOrder.id,
  oldValues: { status: 'PENDING' },
  newValues: { status: 'CONFIRMED' },
  ipAddress: '192.0.2.1',
  userAgent: 'vitest/1.0',
  createdAt: new Date('2025-06-01T10:00:00.000Z'),
};
