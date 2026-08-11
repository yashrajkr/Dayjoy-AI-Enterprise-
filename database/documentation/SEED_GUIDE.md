# Seed Guide

How to manage seed data for the Dayjoy AI Enterprise database.

## What Is Seed Data?

Seed data is the initial set of records inserted into the database to make it usable. It includes:

- **Default tenant** — the "dayjoy" organization
- **Roles** — ADMIN, MANAGER, AGENT, VIEWER
- **Permissions** — ~60 permissions (already inserted by migration 014)
- **Admin user** — `admin@dayjoy.com` with super-admin access
- **Demo users** — sample users for testing (dev only)
- **Product categories** — sample categories
- **Products** — sample products
- **Demo customers** — sample customers
- **Demo distributor** — sample distributor
- **AI agents** — Support, Sales, Voice agents
- **Knowledge articles** — initial FAQs and help docs

## Seed Script Location

```
database/
└── seed/
    └── seed.ts    # TypeScript seed script
```

## Running the Seed

### First Time (with setup script)

```bash
bash scripts/setup.sh
# This runs the seed script automatically at the end
```

### Manual Run

```bash
cd database
npx tsx seed/seed.ts
```

### Re-seed (Reset Data First)

```bash
bash scripts/reset.sh   # drops + recreates + seeds
```

## Seed Script Structure

The seed script (`seed/seed.ts`) is organized in this order:

```typescript
async function main() {
  // 1. Create tenant
  const tenant = await prisma.tenant.create({ ... });

  // 2. Create roles
  const adminRole = await prisma.role.create({ ... });
  const managerRole = await prisma.role.create({ ... });
  // ...

  // 3. Assign permissions to roles
  await prisma.rolePermission.createMany({ ... });

  // 4. Create admin user
  const adminUser = await prisma.user.create({ ... });

  // 5. Assign admin role to admin user
  await prisma.userRole.create({ ... });

  // 6. Create demo users (dev only)
  const demoUser = await prisma.user.create({ ... });

  // 7. Create product categories
  const electronicsCategory = await prisma.productCategory.create({ ... });

  // 8. Create products
  const product = await prisma.product.create({ ... });

  // 9. Create demo customers
  const customer = await prisma.customer.create({ ... });

  // 10. Create demo distributor
  const distributor = await prisma.distributor.create({ ... });

  // 11. Create AI agents
  const supportAgent = await prisma.aiAgent.create({ ... });

  // 12. Create demo orders
  const order = await prisma.order.create({ ... });

  // 13. Print summary
  console.log('Seed complete!');
  console.log('Admin: admin@dayjoy.com / admin123');
}
```

## Development vs Production Seed

### Development Seed

The development seed includes:
- Demo users with weak passwords (`password123`)
- Sample products with fake prices
- Demo customers with fake names
- Demo distributor
- Sample orders
- Sample AI agents

This is safe for local development and staging, but **NEVER run in production**.

### Production Seed

For production, only seed:
- The tenant record (created during onboarding)
- The 4 default roles (ADMIN, MANAGER, AGENT, VIEWER)
- Role-permission assignments
- The first admin user (with a strong password)

To create a production-only seed:

```bash
# Create a separate seed script
cat > seed/seed.prod.ts << 'EOF'
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1. Create tenant
  const tenant = await prisma.tenant.create({
    data: { name: 'Dayjoy Marketing Pvt. Ltd.', slug: 'dayjoy', status: 'ACTIVE' },
  });

  // 2. Create roles
  const adminRole = await prisma.role.create({
    data: { tenantId: tenant.id, name: 'ADMIN', isSystem: true },
  });
  // ... create other roles

  // 3. Create admin user (use env var for password!)
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('ADMIN_PASSWORD env var required');

  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: process.env.ADMIN_EMAIL || 'admin@dayjoy.com',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      firstName: 'Admin',
      lastName: 'User',
      role: 'SUPER_ADMIN',
      emailVerifiedAt: new Date(),
    },
  });

  // 4. Assign admin role
  await prisma.userRole.create({
    data: { userId: admin.id, roleId: adminRole.id, tenantId: tenant.id },
  });

  console.log('Production seed complete');
  console.log(`Admin: ${admin.email}`);
}

main().finally(() => prisma.$disconnect());
EOF
```

Run with environment variables:

```bash
ADMIN_EMAIL=admin@dayjoy.com \
ADMIN_PASSWORD='Str0ng!Passw0rd#2024' \
npx tsx seed/seed.prod.ts
```

## Adding New Seed Data

### Adding a New Product

Edit `seed/seed.ts` and add to the products section:

```typescript
const newProduct = await prisma.product.create({
  data: {
    tenantId: tenant.id,
    categoryId: electronicsCategory.id,
    sku: 'DJ-NEW-001',
    name: 'New Product Name',
    slug: 'new-product-name',
    description: 'Product description here',
    price: 1999.00,
    currency: 'INR',
    status: 'ACTIVE',
    images: ['https://example.com/image.jpg'],
    attributes: { color: 'black', weight: '500g' },
  },
});
```

### Adding a New AI Agent

```typescript
const newAgent = await prisma.aiAgent.create({
  data: {
    tenantId: tenant.id,
    name: 'Marketing Assistant',
    type: 'MARKETING',
    description: 'Helps with marketing content and campaigns',
    systemPrompt: `You are a marketing assistant for Dayjoy Marketing Pvt. Ltd.
Help the marketing team create content, plan campaigns, and analyze performance.
Always maintain a professional, on-brand tone.`,
    configuration: {
      model: 'gpt-4o',
      temperature: 0.8,
      maxTokens: 2000,
    },
    capabilities: ['search_knowledge', 'create_lead'],
    status: 'ACTIVE',
  },
});
```

### Adding a New Permission

Permissions are seeded in migration 014. To add a new permission:

1. Add to migration 014 (or create a new migration):

```sql
INSERT INTO public.permissions (resource, action, description) VALUES
  ('campaigns', 'read', 'View marketing campaigns'),
  ('campaigns', 'create', 'Create marketing campaigns'),
  ('campaigns', 'update', 'Update marketing campaigns'),
  ('campaigns', 'delete', 'Delete marketing campaigns')
ON CONFLICT DO NOTHING;
```

2. Run the migration:
```bash
psql $DATABASE_URL -f migrations/014_final.sql
```

3. Assign to roles in `seed.ts`:
```typescript
const campaignsRead = await prisma.permission.findFirst({
  where: { resource: 'campaigns', action: 'read' },
});
const campaignsCreate = await prisma.permission.findFirst({
  where: { resource: 'campaigns', action: 'create' },
});

// Assign to ADMIN role
await prisma.rolePermission.create({
  data: { roleId: adminRole.id, permissionId: campaignsRead.id },
});
await prisma.rolePermission.create({
  data: { roleId: adminRole.id, permissionId: campaignsCreate.id },
});

// Assign to MANAGER role
await prisma.rolePermission.create({
  data: { roleId: managerRole.id, permissionId: campaignsRead.id },
});
await prisma.rolePermission.create({
  data: { roleId: managerRole.id, permissionId: campaignsCreate.id },
});
```

## Seed Data Validation

After seeding, verify the data:

```bash
# Count records
psql $DATABASE_URL << 'EOF'
SELECT 'tenants' AS table, COUNT(*) FROM public.tenants
UNION ALL SELECT 'users', COUNT(*) FROM public.users
UNION ALL SELECT 'roles', COUNT(*) FROM public.roles
UNION ALL SELECT 'permissions', COUNT(*) FROM public.permissions
UNION ALL SELECT 'role_permissions', COUNT(*) FROM public.role_permissions
UNION ALL SELECT 'user_roles', COUNT(*) FROM public.user_roles
UNION ALL SELECT 'product_categories', COUNT(*) FROM public.product_categories
UNION ALL SELECT 'products', COUNT(*) FROM public.products
UNION ALL SELECT 'customers', COUNT(*) FROM public.customers
UNION ALL SELECT 'distributors', COUNT(*) FROM public.distributors
UNION ALL SELECT 'ai_agents', COUNT(*) FROM public.ai_agents
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders;
EOF
```

## Common Issues

### Issue: "Unique constraint failed"

**Cause:** Seed already ran. Records exist.

**Fix:** Either:
1. Reset the database: `bash scripts/reset.sh`
2. Use `upsert` instead of `create` in the seed script:
   ```typescript
   await prisma.tenant.upsert({
     where: { slug: 'dayjoy' },
     update: {},
     create: { name: 'Dayjoy', slug: 'dayjoy', status: 'ACTIVE' },
   });
   ```

### Issue: "Foreign key constraint failed"

**Cause:** Trying to create a child record before its parent.

**Fix:** Ensure parent records are created first. The seed script order matters:
1. Tenant → 2. Roles → 3. Permissions → 4. RolePermissions → 5. Users → 6. UserRoles → 7. Categories → 8. Products → 9. Customers → 10. Orders

### Issue: "Password hash invalid"

**Cause:** Not hashing the password before insert.

**Fix:** Always use bcrypt:
```typescript
import * as bcrypt from 'bcryptjs';

const passwordHash = await bcrypt.hash('admin123', 12);
await prisma.user.create({
  data: { ..., passwordHash },
});
```

## Best Practices

1. **Never commit real passwords** — use env vars for production.
2. **Use `upsert` for re-runnable seeds** — prevents errors on re-run.
3. **Order matters** — create parents before children.
4. **Keep dev seed small** — large seeds slow down testing.
5. **Use realistic data** — helps with UI testing.
6. **Document demo credentials** — print them at the end of the seed script.
7. **Separate dev vs prod seeds** — `seed.ts` for dev, `seed.prod.ts` for prod.
