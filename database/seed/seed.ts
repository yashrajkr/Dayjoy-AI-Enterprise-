/**
 * Dayjoy AI Enterprise Platform — Seed Script
 *
 * Purpose: Create initial seed data for development and testing.
 * Usage:   `npx prisma db seed` or `tsx database/seed/seed.ts`
 *
 * Idempotency: Every top-level entity uses `upsert` (or `createMany` with
 * `skipDuplicates`) so the script can be run repeatedly without errors.
 *
 * NOTE: All Prisma Client field accessors are camelCase (e.g. `tenantId`,
 * `passwordHash`, `firstName`) — never snake_case. This matches the
 * canonical Prisma schema at `database/prisma/schema.prisma`.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hash a password with bcrypt (10 rounds). */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Generate a RFC-4122 v4 UUID.
 * Used for deterministic-ish primary keys during seeding so re-runs
 * resolve to the same row via `upsert`.
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Seed entrypoint
// ---------------------------------------------------------------------------

async function main() {
  console.log('🌱 Starting Dayjoy seed...');

  // ===================================================================
  // 1. Create Default Tenant
  // ===================================================================
  console.log('📦 Creating default tenant...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'dayjoy' },
    update: {},
    create: {
      id: generateUUID(),
      name: 'Dayjoy',
      slug: 'dayjoy',
      status: 'ACTIVE',
      settings: {
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        language: 'en',
        countryCode: 'IN',
      },
    },
  });

  console.log(`✅ Tenant ready: ${tenant.name} (${tenant.slug}) → ${tenant.id}`);

  // ===================================================================
  // 2. Create System Roles (ADMIN, MANAGER, AGENT, VIEWER)
  // ===================================================================
  console.log('🔐 Creating system roles...');

  const roleSpecs = [
    { name: 'ADMIN', description: 'Full system access — all permissions' },
    { name: 'MANAGER', description: 'Manage users, customers, orders, and operations' },
    { name: 'AGENT', description: 'Customer support agent — read + update scope' },
    { name: 'VIEWER', description: 'Read-only access across the tenant' },
  ];

  // Composite unique key for `roles` is (tenantId, name) → Prisma exposes
  // it as the `tenantId_name` accessor.
  const roles = await Promise.all(
    roleSpecs.map((spec) =>
      prisma.role.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: spec.name } },
        update: { description: spec.description },
        create: {
          id: generateUUID(),
          tenantId: tenant.id,
          name: spec.name,
          description: spec.description,
          isSystem: true,
        },
      }),
    ),
  );

  const [adminRole, managerRole, agentRole, viewerRole] = roles;
  console.log(`✅ ${roles.length} system roles ready (ADMIN, MANAGER, AGENT, VIEWER)`);

  // ===================================================================
  // 3. Fetch all permissions (already seeded by migration 014_final.sql)
  // ===================================================================
  console.log('🔑 Loading permissions from DB...');

  const allPermissions = await prisma.permission.findMany();
  console.log(`   Found ${allPermissions.length} permissions`);

  // ===================================================================
  // 4. Assign permissions to roles
  //    - ADMIN   → all permissions
  //    - MANAGER → all except `admin:*` and `system:*`
  //    - AGENT   → read + update on business resources
  //    - VIEWER  → read-only on every resource
  // ===================================================================
  console.log('🔗 Assigning permissions to roles...');

  // 4a. ADMIN = all permissions
  await prisma.rolePermission.createMany({
    data: allPermissions.map((perm) => ({
      roleId: adminRole.id,
      permissionId: perm.id,
    })),
    skipDuplicates: true,
  });

  // 4b. MANAGER = all except admin/system-scoped permissions
  const managerPerms = allPermissions.filter(
    (p) => p.resource !== 'admin' && p.resource !== 'system',
  );
  await prisma.rolePermission.createMany({
    data: managerPerms.map((perm) => ({
      roleId: managerRole.id,
      permissionId: perm.id,
    })),
    skipDuplicates: true,
  });

  // 4c. AGENT = read + update on business resources
  const agentPerms = allPermissions.filter(
    (p) =>
      (p.action === 'read' || p.action === 'update') &&
      ['users', 'customers', 'distributors', 'products', 'orders', 'leads', 'ai', 'knowledge', 'voice', 'whatsapp', 'notifications'].includes(
        p.resource,
      ),
  );
  await prisma.rolePermission.createMany({
    data: agentPerms.map((perm) => ({
      roleId: agentRole.id,
      permissionId: perm.id,
    })),
    skipDuplicates: true,
  });

  // 4d. VIEWER = read-only on every resource
  const viewerPerms = allPermissions.filter((p) => p.action === 'read');
  await prisma.rolePermission.createMany({
    data: viewerPerms.map((perm) => ({
      roleId: viewerRole.id,
      permissionId: perm.id,
    })),
    skipDuplicates: true,
  });

  console.log(
    `✅ Permissions assigned → ADMIN: ${allPermissions.length}, ` +
      `MANAGER: ${managerPerms.length}, AGENT: ${agentPerms.length}, ` +
      `VIEWER: ${viewerPerms.length}`,
  );

  // ===================================================================
  // 5. Create Admin User (admin@dayjoy.com / Admin@123456)
  // ===================================================================
  console.log('👤 Creating admin user...');

  const adminPasswordHash = await hashPassword('Admin@123456');

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@dayjoy.com' },
    update: {
      // Re-hash password on every run so the demo credential always works.
      passwordHash: adminPasswordHash,
      status: 'ACTIVE',
      isEmailVerified: true,
    },
    create: {
      id: generateUUID(),
      tenantId: tenant.id,
      email: 'admin@dayjoy.com',
      passwordHash: adminPasswordHash,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'ADMIN',
      isEmailVerified: true,
      status: 'ACTIVE',
    },
  });

  // 5b. Assign ADMIN role to admin user (idempotent upsert on composite PK)
  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: adminUser.id, roleId: adminRole.id },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
      tenantId: tenant.id,
      assignedBy: adminUser.id,
    },
  });

  console.log(`✅ Admin user ready: ${adminUser.email} (role: ADMIN)`);

  // ===================================================================
  // 6. Create Demo Users (manager, agent, customer)
  // ===================================================================
  console.log('👥 Creating demo users...');

  const demoPasswordHash = await hashPassword('Demo@123456');

  const demoUsersSpec = [
    {
      email: 'manager@dayjoy.com',
      firstName: 'Manager',
      lastName: 'Demo',
      role: 'MANAGER',
      roleRef: managerRole,
    },
    {
      email: 'agent@dayjoy.com',
      firstName: 'Agent',
      lastName: 'Demo',
      role: 'AGENT',
      roleRef: agentRole,
    },
    {
      email: 'customer@dayjoy.com',
      firstName: 'Customer',
      lastName: 'Demo',
      role: 'VIEWER',
      roleRef: viewerRole,
    },
  ];

  const demoUsers = await Promise.all(
    demoUsersSpec.map(async (spec) => {
      const user = await prisma.user.upsert({
        where: { email: spec.email },
        update: {
          passwordHash: demoPasswordHash,
          status: 'ACTIVE',
        },
        create: {
          id: generateUUID(),
          tenantId: tenant.id,
          email: spec.email,
          passwordHash: demoPasswordHash,
          firstName: spec.firstName,
          lastName: spec.lastName,
          role: spec.role,
          isEmailVerified: true,
          status: 'ACTIVE',
        },
      });

      await prisma.userRole.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId: spec.roleRef.id },
        },
        update: {},
        create: {
          userId: user.id,
          roleId: spec.roleRef.id,
          tenantId: tenant.id,
          assignedBy: adminUser.id,
        },
      });

      console.log(`   ✅ ${user.email} (role: ${spec.role})`);
      return user;
    }),
  );

  // ===================================================================
  // 7. Create Product Categories (Health, Beauty, Home Care)
  // ===================================================================
  console.log('📂 Creating product categories...');

  const categorySpecs = [
    {
      name: 'Health',
      slug: 'health',
      description: 'Health supplements and wellness products',
    },
    {
      name: 'Beauty',
      slug: 'beauty',
      description: 'Skincare, haircare, and cosmetic products',
    },
    {
      name: 'Home Care',
      slug: 'home-care',
      description: 'Household cleaning and home care essentials',
    },
  ];

  const categories = await Promise.all(
    categorySpecs.map((spec) =>
      prisma.productCategory.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: spec.slug } },
        update: { description: spec.description },
        create: {
          id: generateUUID(),
          tenantId: tenant.id,
          name: spec.name,
          slug: spec.slug,
          description: spec.description,
          isActive: true,
        },
      }),
    ),
  );

  console.log(`✅ ${categories.length} categories ready`);

  // ===================================================================
  // 8. Create Demo Products (5 — one per category + bestsellers)
  // ===================================================================
  console.log('🛍️ Creating demo products...');

  const productSpecs = [
    // Health category — 2 products (one regular + bestseller)
    {
      sku: 'HLT-001',
      name: 'Dayjoy Multivitamin Daily',
      description: 'Complete daily multivitamin with 23 essential nutrients',
      price: 499.0,
      cost: 220.0,
      inventoryCount: 200,
      categoryId: categories[0].id,
      bestseller: true,
    },
    {
      sku: 'HLT-002',
      name: 'Dayjoy Vitamin C 1000mg',
      description: 'Immune-boosting Vitamin C with zinc',
      price: 299.0,
      cost: 130.0,
      inventoryCount: 150,
      categoryId: categories[0].id,
    },
    // Beauty category — 2 products (one bestseller)
    {
      sku: 'BTY-001',
      name: 'Dayjoy Glow Serum',
      description: 'Vitamin C + Hyaluronic acid face serum',
      price: 799.0,
      cost: 320.0,
      inventoryCount: 100,
      categoryId: categories[1].id,
      bestseller: true,
    },
    {
      sku: 'BTY-002',
      name: 'Dayjoy Hair Repair Oil',
      description: 'Ayurvedic hair oil with bhringraj and amla',
      price: 349.0,
      cost: 150.0,
      inventoryCount: 120,
      categoryId: categories[1].id,
    },
    // Home Care — 1 product
    {
      sku: 'HMC-001',
      name: 'Dayjoy Plant-Based Floor Cleaner',
      description: 'Eco-friendly floor cleaner — lemon fragrance, 1L',
      price: 199.0,
      cost: 80.0,
      inventoryCount: 300,
      categoryId: categories[2].id,
    },
  ];

  const products = await Promise.all(
    productSpecs.map((spec) =>
      prisma.product.upsert({
        where: { tenantId_sku: { tenantId: tenant.id, sku: spec.sku } },
        update: {
          name: spec.name,
          description: spec.description,
          price: spec.price,
          cost: spec.cost,
          inventoryCount: spec.inventoryCount,
          categoryId: spec.categoryId,
          status: 'ACTIVE',
        },
        create: {
          id: generateUUID(),
          tenantId: tenant.id,
          categoryId: spec.categoryId,
          sku: spec.sku,
          name: spec.name,
          description: spec.description,
          price: spec.price,
          cost: spec.cost,
          currency: 'INR',
          inventoryCount: spec.inventoryCount,
          tags: spec.bestseller ? ['bestseller', 'demo'] : ['demo'],
          status: 'ACTIVE',
        },
      }),
    ),
  );

  // 8b. Create matching Inventory rows for each product
  await Promise.all(
    products.map((p, idx) =>
      prisma.inventory.upsert({
        where: { productId: p.id },
        update: {
          quantity: productSpecs[idx].inventoryCount,
          lowStockThreshold: 10,
        },
        create: {
          id: generateUUID(),
          tenantId: tenant.id,
          productId: p.id,
          quantity: productSpecs[idx].inventoryCount,
          reserved: 0,
          lowStockThreshold: 10,
        },
      }),
    ),
  );

  console.log(`✅ ${products.length} products + inventory rows ready`);

  // ===================================================================
  // 9. Create Demo Customers (3)
  // ===================================================================
  console.log('👤 Creating demo customers...');

  const customerSpecs = [
    {
      customerType: 'INDIVIDUAL' as const,
      firstName: 'Alice',
      lastName: 'Johnson',
      email: 'alice.johnson@example.com',
      phone: '+91-9876543210',
    },
    {
      customerType: 'BUSINESS' as const,
      companyName: 'Tech Solutions Pvt Ltd',
      email: 'contact@techsolutions.in',
      phone: '+91-9876543211',
    },
    {
      customerType: 'INDIVIDUAL' as const,
      firstName: 'Mark',
      lastName: 'Brown',
      email: 'mark.brown@example.com',
      phone: '+91-9876543212',
    },
  ];

  const customers = await Promise.all(
    customerSpecs.map(async (spec) => {
      // Email is the natural id (no @@unique on customer.email, so we
      // findFirst + upsert-by-id fallback).
      const existing = await prisma.customer.findFirst({
        where: { tenantId: tenant.id, email: spec.email },
      });
      if (existing) {
        return prisma.customer.update({
          where: { id: existing.id },
          data: { ...spec, status: 'active' },
        });
      }
      return prisma.customer.create({
        data: {
          id: generateUUID(),
          tenantId: tenant.id,
          ...spec,
          status: 'active',
        },
      });
    }),
  );

  console.log(`✅ ${customers.length} customers ready`);

  // ===================================================================
  // 10. Create Demo Distributors (2)
  // ===================================================================
  console.log('🤝 Creating demo distributors...');

  const distributorSpecs = [
    {
      distributorCode: 'DIST-001',
      companyName: 'Global Health Distributors',
      contactPerson: 'Sarah Miller',
      email: 'sarah@globalhealth.in',
      phone: '+91-9000010001',
      commissionRate: 15.0,
    },
    {
      distributorCode: 'DIST-002',
      companyName: 'Wellness Partners',
      contactPerson: 'David Lee',
      email: 'david@wellnesspartners.in',
      phone: '+91-9000010002',
      commissionRate: 12.5,
    },
  ];

  const distributors = await Promise.all(
    distributorSpecs.map((spec) =>
      prisma.distributor.upsert({
        where: { distributorCode: spec.distributorCode },
        update: {
          companyName: spec.companyName,
          contactPerson: spec.contactPerson,
          email: spec.email,
          phone: spec.phone,
          commissionRate: spec.commissionRate,
          status: 'ACTIVE',
        },
        create: {
          id: generateUUID(),
          tenantId: tenant.id,
          distributorCode: spec.distributorCode,
          companyName: spec.companyName,
          contactPerson: spec.contactPerson,
          email: spec.email,
          phone: spec.phone,
          commissionRate: spec.commissionRate,
          status: 'ACTIVE',
        },
      }),
    ),
  );

  console.log(`✅ ${distributors.length} distributors ready`);

  // ===================================================================
  // 11. Create AI Agents (Support, Sales, Voice)
  // ===================================================================
  console.log('🤖 Creating AI agents...');

  const agentSpecs = [
    {
      name: 'Dayjoy Support Agent',
      type: 'SUPPORT' as const,
      description: 'Customer support agent — handles product inquiries, order status, returns.',
      configuration: {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 1000,
        systemPrompt: 'You are a helpful customer support agent for Dayjoy.',
      },
      capabilities: {
        tools: ['knowledge_base', 'order_lookup', 'customer_lookup'],
        integrations: ['whatsapp', 'web'],
      },
    },
    {
      name: 'Dayjoy Sales Agent',
      type: 'SALES' as const,
      description: 'Sales agent — product recommendations, lead qualification, cross-sell.',
      configuration: {
        model: 'gpt-4o',
        temperature: 0.8,
        maxTokens: 1500,
        systemPrompt: 'You are a helpful sales agent for Dayjoy products.',
      },
      capabilities: {
        tools: ['product_catalog', 'pricing', 'lead_qualification'],
        integrations: ['whatsapp', 'web'],
      },
    },
    {
      name: 'Dayjoy Voice Agent',
      type: 'VOICE' as const,
      description: 'Voice AI agent — handles inbound/outbound voice calls.',
      configuration: {
        model: 'gpt-4o-realtime',
        temperature: 0.7,
        maxTokens: 500,
        systemPrompt: 'You are a helpful voice assistant for Dayjoy.',
        voice: 'aria',
      },
      capabilities: {
        tools: ['knowledge_base', 'call_routing', 'appointment_booking'],
        integrations: ['voice'],
      },
    },
  ];

  const agents = await Promise.all(
    agentSpecs.map(async (spec) => {
      const existing = await prisma.aiAgent.findFirst({
        where: { tenantId: tenant.id, name: spec.name },
      });
      if (existing) {
        return prisma.aiAgent.update({
          where: { id: existing.id },
          data: {
            type: spec.type,
            description: spec.description,
            configuration: spec.configuration as any,
            capabilities: spec.capabilities as any,
            status: 'active',
          },
        });
      }
      return prisma.aiAgent.create({
        data: {
          id: generateUUID(),
          tenantId: tenant.id,
          name: spec.name,
          type: spec.type,
          description: spec.description,
          configuration: spec.configuration as any,
          capabilities: spec.capabilities as any,
          status: 'active',
        },
      });
    }),
  );

  console.log(`✅ ${agents.length} AI agents ready`);

  // ===================================================================
  // 12. Create Demo Leads (2)
  // ===================================================================
  console.log('🎯 Creating demo leads...');

  const leadSpecs = [
    {
      firstName: 'Emily',
      lastName: 'Davis',
      email: 'emily.davis@example.com',
      phone: '+91-9000020001',
      company: 'StartupXYZ',
      status: 'NEW' as const,
      score: 75,
    },
    {
      firstName: 'Michael',
      lastName: 'Chen',
      email: 'michael.chen@example.com',
      phone: '+91-9000020002',
      company: 'Chen & Co',
      status: 'QUALIFIED' as const,
      score: 85,
    },
  ];

  const leads = await Promise.all(
    leadSpecs.map(async (spec) => {
      const existing = await prisma.lead.findFirst({
        where: { tenantId: tenant.id, email: spec.email },
      });
      if (existing) {
        return prisma.lead.update({
          where: { id: existing.id },
          data: spec,
        });
      }
      return prisma.lead.create({
        data: {
          id: generateUUID(),
          tenantId: tenant.id,
          ...spec,
        },
      });
    }),
  );

  console.log(`✅ ${leads.length} leads ready`);

  // ===================================================================
  // 13. Create Demo Orders with Items (2)
  // ===================================================================
  console.log('📦 Creating demo orders...');

  const orderSpecs = [
    {
      orderNumber: 'ORD-2024-001',
      customerIdx: 0,
      distributorIdx: 0,
      status: 'DELIVERED' as const,
      paymentStatus: 'PAID',
      items: [
        { productIdx: 0, quantity: 2 }, // Multivitamin Daily x2
        { productIdx: 1, quantity: 1 }, // Vitamin C 1000mg x1
      ],
    },
    {
      orderNumber: 'ORD-2024-002',
      customerIdx: 1,
      distributorIdx: 1,
      status: 'PENDING' as const,
      paymentStatus: 'PENDING',
      items: [
        { productIdx: 2, quantity: 3 }, // Glow Serum x3 (bestseller)
      ],
    },
  ];

  const orders = await Promise.all(
    orderSpecs.map(async (spec) => {
      const customer = customers[spec.customerIdx];
      const distributor = distributors[spec.distributorIdx];

      // Compute totals from item spec + product price
      const lineItems = spec.items.map((i) => {
        const product = products[i.productIdx];
        const unitPrice = product.price;
        const subtotal = unitPrice * i.quantity;
        const taxRate = 0.18; // 18% GST
        const taxAmount = subtotal * taxRate;
        const total = subtotal + taxAmount;
        return {
          productId: product.id,
          productSku: product.sku,
          productName: product.name,
          quantity: i.quantity,
          unitPrice,
          taxRate,
          taxAmount,
          subtotal,
          total,
        };
      });

      const subtotal = lineItems.reduce((s, i) => s + i.subtotal, 0);
      const tax = lineItems.reduce((s, i) => s + i.taxAmount, 0);
      const total = subtotal + tax;

      const existing = await prisma.order.findUnique({
        where: { orderNumber: spec.orderNumber },
        include: { items: true },
      });

      if (existing) {
        // Replace items: delete old, then create new (simple idempotent refresh)
        await prisma.orderItem.deleteMany({ where: { orderId: existing.id } });
        return prisma.order.update({
          where: { id: existing.id },
          data: {
            customerId: customer.id,
            distributorId: distributor.id,
            status: spec.status,
            paymentStatus: spec.paymentStatus,
            subtotal,
            tax,
            total,
            currency: 'INR',
            placedAt: new Date(),
            items: {
              create: lineItems.map((li) => ({
                id: generateUUID(),
                tenantId: tenant.id,
                ...li,
              })),
            },
          },
          include: { items: true },
        });
      }

      return prisma.order.create({
        data: {
          id: generateUUID(),
          tenantId: tenant.id,
          customerId: customer.id,
          distributorId: distributor.id,
          orderNumber: spec.orderNumber,
          status: spec.status,
          subtotal,
          tax,
          total,
          currency: 'INR',
          paymentStatus: spec.paymentStatus,
          placedAt: new Date(),
          items: {
            create: lineItems.map((li) => ({
              id: generateUUID(),
              tenantId: tenant.id,
              ...li,
            })),
          },
        },
        include: { items: true },
      });
    }),
  );

  console.log(`✅ ${orders.length} orders with ${orders.reduce((s, o) => s + o.items.length, 0)} items ready`);

  // ===================================================================
  // 14. Create demo interactions (1 — light-weight)
  // ===================================================================
  console.log('💬 Creating demo interactions...');

  const existingInteraction = await prisma.interaction.findFirst({
    where: { tenantId: tenant.id, subject: 'Product inquiry' },
  });
  if (!existingInteraction) {
    await prisma.interaction.create({
      data: {
        id: generateUUID(),
        tenantId: tenant.id,
        customerId: customers[0].id,
        userId: adminUser.id,
        type: 'CALL',
        subject: 'Product inquiry',
        description: 'Customer called to ask about Dayjoy Multivitamin Daily',
        outcome: 'Interested — sent follow-up email with product brochure',
        followUpRequired: true,
        followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    console.log('✅ 1 interaction ready');
  } else {
    console.log('   (interaction already exists — skipping)');
  }

  // ===================================================================
  // 15. Summary
  // ===================================================================
  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   - 1 Tenant            : ${tenant.name} (slug: ${tenant.slug})`);
  console.log(`   - 4 System Roles      : ADMIN, MANAGER, AGENT, VIEWER`);
  console.log(`   - ${allPermissions.length} Permissions assigned`);
  console.log(`   - 1 Admin User        : admin@dayjoy.com`);
  console.log(`   - 3 Demo Users        : manager@/agent@/customer@dayjoy.com`);
  console.log(`   - 3 Product Categories: Health, Beauty, Home Care`);
  console.log(`   - 5 Products          : 2 bestsellers + 3 regular`);
  console.log(`   - 3 Customers         : 2 individual + 1 business`);
  console.log(`   - 2 Distributors      : DIST-001, DIST-002`);
  console.log(`   - 3 AI Agents         : Support, Sales, Voice`);
  console.log(`   - 2 Leads             : 1 NEW + 1 QUALIFIED`);
  console.log(`   - 2 Orders            : 1 DELIVERED + 1 PENDING`);

  console.log('\n🔐 Test Credentials:');
  console.log('   Admin   : admin@dayjoy.com     / Admin@123456');
  console.log('   Manager : manager@dayjoy.com   / Demo@123456');
  console.log('   Agent   : agent@dayjoy.com     / Demo@123456');
  console.log('   Viewer  : customer@dayjoy.com  / Demo@123456');
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
