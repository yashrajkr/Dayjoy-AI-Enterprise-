# Migration Guide

How to manage database schema changes with the Dayjoy AI Enterprise database.

## Migration Workflow

### When to Create a New Migration

Create a new migration when you need to:
- Add a new table
- Add a column to an existing table
- Modify a column type
- Add an index
- Add a constraint
- Add a trigger, function, or view
- Change RLS policies

### Naming Convention

Migrations are named `NNN_description.sql` where:
- `NNN` is a 3-digit zero-padded sequence number (001, 002, ..., 015, 016, ...)
- `description` is a snake_case summary

Examples:
- `015_add_marketing_campaigns.sql`
- `016_add_user_avatar_column.sql`
- `017_index_orders_by_created_at.sql`

### Migration File Structure

Every migration MUST follow this template:

```sql
-- =====================================================================
-- Migration NNN: <Title>
-- =====================================================================
-- Purpose: <one-line description>
--
-- Run order: Nth (after NNN-1_<previous>)
-- Idempotent: YES (uses IF NOT EXISTS / DO $$ blocks)
-- =====================================================================

BEGIN;

-- Migration content here
-- All statements must be idempotent (safe to run multiple times)
-- Use:
--   CREATE TABLE IF NOT EXISTS
--   CREATE INDEX IF NOT EXISTS
--   ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--   DO $$ BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMIT;

-- =====================================================================
-- End of Migration NNN
-- =====================================================================
```

### Creating a New Migration

#### Option 1: Add a New Table

```bash
# Create the file
touch migrations/015_add_marketing_campaigns.sql
```

Edit the file:

```sql
-- =====================================================================
-- Migration 015: Add Marketing Campaigns
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  type        VARCHAR(50) NOT NULL,  -- EMAIL, SMS, WHATSAPP, SOCIAL
  status      VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  start_date  DATE,
  end_date    DATE,
  budget      DECIMAL(12, 2),
  metadata    JSONB DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON public.campaigns (tenant_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns (status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_campaigns ON public.campaigns
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

COMMIT;
```

#### Option 2: Add a Column to an Existing Table

```sql
-- =====================================================================
-- Migration 016: Add Avatar Column to Users
-- =====================================================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Backfill if needed
UPDATE public.users SET avatar_url = NULL WHERE avatar_url IS NULL;

COMMIT;
```

#### Option 3: Add an Index

```sql
-- =====================================================================
-- Migration 017: Add Index on Orders Created At
-- =====================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (created_at);

COMMIT;
```

### Running Migrations

#### Apply a Single Migration

```bash
psql $DATABASE_URL -f migrations/015_add_marketing_campaigns.sql
```

#### Apply All Pending Migrations

```bash
# Run all migrations in order
for f in migrations/0*.sql; do
  echo "Applying $f..."
  psql $DATABASE_URL -f $f
done
```

#### Use the Setup Script (Re-runnable)

```bash
bash scripts/setup.sh
```

This is idempotent — running it multiple times is safe.

### Updating the Prisma Schema

After adding a migration that creates a new table, you MUST also update `prisma/schema.prisma`:

```prisma
model Campaign {
  id          String   @id @default(uuid())
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  tenantId    String
  name        String
  description String?  @db.Text
  type        String
  status      String   @default("DRAFT")
  startDate   DateTime? @map("start_date") @db.Date
  endDate     DateTime? @map("end_date") @db.Date
  budget      Decimal? @db.Decimal(12, 2)
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  deletedAt   DateTime? @map("deleted_at")

  @@index([tenantId, createdAt])
  @@map("campaigns")
}
```

Then regenerate the Prisma client:

```bash
npx prisma generate --schema prisma/schema.prisma
```

### Migration Rollback

**PostgreSQL does not support automatic rollback.** To undo a migration:

1. **Drop the table/column manually:**
   ```sql
   DROP TABLE IF EXISTS public.campaigns CASCADE;
   ```

2. **Or restore from backup:**
   ```bash
   bash scripts/restore.sh backups/dayjoy_ai_YYYYMMDD_HHMMSS.dump.gz
   ```

3. **In production:** Always test migrations in staging first. Have a rollback plan ready.

### Production Migration Strategy

1. **Test in staging first** — Apply the migration to staging, run smoke tests.
2. **Backup before applying** — `bash scripts/backup.sh`
3. **Apply during low-traffic window** — Schedule maintenance window.
4. **Use `CREATE INDEX CONCURRENTLY`** for new indexes on large tables (doesn't lock the table):
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_new ON public.orders (some_column);
   ```
   Note: `CONCURRENTLY` cannot be used inside a transaction block, so remove `BEGIN;` / `COMMIT;` for that migration.
5. **Monitor after applying** — Watch for errors, slow queries, lock contention.

### Common Migration Patterns

#### Add a NOT NULL Column to a Large Table

```sql
-- Step 1: Add column as nullable
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS new_field VARCHAR(100);

-- Step 2: Backfill in batches (avoid locking the table)
DO $$
DECLARE
  v_count INT := 1;
BEGIN
  WHILE v_count > 0 LOOP
    UPDATE public.orders
    SET new_field = 'default_value'
    WHERE new_field IS NULL
    LIMIT 10000;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    PERFORM pg_sleep(0.1);  -- throttle
  END LOOP;
END $$;

-- Step 3: Add NOT NULL constraint
ALTER TABLE public.orders ALTER COLUMN new_field SET NOT NULL;
```

#### Rename a Column

```sql
-- 1. Add new column
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_address CITEXT;

-- 2. Copy data
UPDATE public.users SET email_address = email WHERE email_address IS NULL;

-- 3. Drop old column (after verifying app uses new column)
-- ALTER TABLE public.users DROP COLUMN email;

-- 4. Or rename (but this breaks the old name immediately)
-- ALTER TABLE public.users RENAME COLUMN email TO email_address;
```

#### Drop a Table (Safely)

```sql
-- 1. First verify no foreign keys reference it
SELECT tc.table_name, tc.constraint_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND kcu.table_name = 'table_to_drop';

-- 2. Drop foreign keys that reference it (if any)
-- ALTER TABLE public.other_table DROP CONSTRAINT fk_name;

-- 3. Drop the table
DROP TABLE IF EXISTS public.table_to_drop CASCADE;
```

### Migration Best Practices

1. **Always use `IF NOT EXISTS`** — makes migrations idempotent.
2. **Always wrap in `BEGIN;` / `COMMIT;`** — atomic (all or nothing).
3. **Never delete data** — use soft delete (`deleted_at` column).
4. **Add RLS policies to new tenant-scoped tables** — security.
5. **Add audit triggers to critical tables** — compliance.
6. **Update the Prisma schema in the same PR** — keep them in sync.
7. **Test on a copy of production data** — catch issues early.
8. **Document breaking changes** — update `CHANGELOG.md`.
