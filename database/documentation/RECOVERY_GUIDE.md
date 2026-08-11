# Recovery Guide

How to recover the Dayjoy AI Enterprise database from backup.

## Recovery Scenarios

| Scenario | When to Use | RTO |
|---|---|---|
| **Accidental row deletion** | User deleted data by mistake | 5-15 min |
| **Accidental table drop** | Migration dropped wrong table | 15-30 min |
| **Database corruption** | Disk failure, corruption | 30-60 min |
| **Point-in-time recovery** | Need data from a specific time | 15-30 min |
| **Complete disaster** | RDS failure, region outage | 1-4 hours |

## Prerequisites

- Access to the backup file (local or S3)
- `psql` and `pg_restore` installed
- Database admin credentials
- Sufficient disk space (2x backup size)

## Recovery Procedures

### Scenario 1: Restore from Local Backup

```bash
# 1. List available backups
ls -lh database/backups/

# 2. Restore
bash database/scripts/restore.sh database/backups/dayjoy_ai_20260101_020000.dump.gz

# 3. Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM public.users;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM public.orders;"
```

### Scenario 2: Restore from S3

```bash
# 1. Download backup from S3
aws s3 cp s3://dayjoy-prod-backups/dayjoy_ai_20260101_020000.dump.gz database/backups/

# 2. Restore
bash database/scripts/restore.sh database/backups/dayjoy_ai_20260101_020000.dump.gz

# 3. Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM public.users;"
```

### Scenario 3: Point-in-Time Recovery (RDS)

Use this when you need to recover to a specific point in time (e.g., before a bad migration ran).

**Via AWS Console:**

1. Go to RDS → Databases → dayjoy-prod
2. Click "Actions" → "Restore to point in time"
3. Choose "Custom" under "Restore time"
4. Select the date/time to restore to
5. Specify a new DB instance identifier (e.g., `dayjoy-prod-restored`)
6. Click "Restore to point in time"

**Via AWS CLI:**

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier dayjoy-prod \
  --target-db-instance-identifier dayjoy-prod-restored \
  --restore-time 2024-01-15T14:30:00Z \
  --db-instance-class db.r6g.large \
  --storage-encrypted
```

Wait for the new instance to become available (10-30 minutes), then update your application's `DATABASE_URL` to point to it.

### Scenario 4: Restore Specific Table Only

Useful when only one table was affected and you don't want to restore the entire database.

```bash
# 1. Restore backup to a temporary database
createdb dayjoy_temp
pg_restore --dbname=postgresql://dayjoy:dayjoy@localhost:5432/dayjoy_temp \
  --no-owner --no-privileges database/backups/dayjoy_ai_20260101_020000.dump

# 2. Copy specific table from temp to production
psql $DATABASE_URL << 'EOF'
-- Drop the corrupted table
DROP TABLE public.orders CASCADE;

-- Copy from temp database
CREATE TABLE public.orders AS SELECT * FROM dblink(
  'host=localhost dbname=dayjoy_temp user=dayjoy password=dayjoy',
  'SELECT * FROM public.orders'
) AS t1 (
  id UUID, tenant_id UUID, customer_id UUID, distributor_id UUID,
  order_number VARCHAR, status public.order_status, ...
);

-- Recreate indexes, constraints, triggers
-- (Run the relevant parts of migrations 005_orders.sql, 012_indexes.sql, 013_constraints.sql)
EOF

# 3. Drop temp database
dropdb dayjoy_temp
```

### Scenario 5: Complete Disaster Recovery

Use this when the entire database is lost.

```bash
# 1. Create a new RDS instance (or use the existing one if reachable)
aws rds create-db-instance \
  --db-instance-identifier dayjoy-prod-new \
  --db-instance-class db.r6g.large \
  --engine postgres \
  --master-username dayjoy \
  --master-user-password <new-password> \
  --allocated-storage 100 \
  --storage-encrypted

# 2. Wait for it to become available
aws rds wait db-instance-available --db-instance-identifier dayjoy-prod-new

# 3. Download latest backup from S3
aws s3 cp s3://dayjoy-prod-backups/dayjoy_ai_20260101_020000.dump.gz /tmp/

# 4. Restore
gunzip /tmp/dayjoy_ai_20260101_020000.dump.gz
pg_restore --dbname=postgresql://dayjoy:<password>@<new-host>:5432/dayjoy_ai \
  --no-owner --no-privileges /tmp/dayjoy_ai_20260101_020000.dump

# 5. Update application DATABASE_URL to point to new instance
# 6. Restart application
# 7. Verify
curl https://api.dayjoy.ai/health
```

## Recovery Verification

After restoring, verify the database is in a good state:

```bash
# 1. Check row counts
psql $DATABASE_URL << 'EOF'
SELECT 'tenants' AS table, COUNT(*) FROM public.tenants
UNION ALL SELECT 'users', COUNT(*) FROM public.users
UNION ALL SELECT 'customers', COUNT(*) FROM public.customers
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL SELECT 'products', COUNT(*) FROM public.products
UNION ALL SELECT 'conversations', COUNT(*) FROM public.conversations
UNION ALL SELECT 'voice_sessions', COUNT(*) FROM public.voice_sessions;
EOF

# 2. Check RLS is enabled
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;"
# Should be 50+

# 3. Check triggers are present
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'public';"
# Should be 30+

# 4. Check views exist
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.views WHERE table_schema = 'public';"
# Should be 10+

# 5. Check functions exist
psql $DATABASE_URL -c "SELECT COUNT(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace;"
# Should be 15+

# 6. Run health check
curl http://localhost:3000/health/ready
```

## Recovery Runbook

### Before You Start

1. **Notify stakeholders** — inform the team that recovery is in progress
2. **Stop the application** — prevent writes to the database during recovery
3. **Take a snapshot of the current state** — even if corrupted, it may be useful for forensics
4. **Document the timeline** — when did the issue start, what was the cause

### During Recovery

1. **Communicate progress** — every 15 minutes, update the team
2. **Don't rush** — verify each step before moving to the next
3. **Take screenshots** — for post-mortem documentation

### After Recovery

1. **Verify data integrity** — run the verification queries above
2. **Run smoke tests** — `cd testing/e2e && npx playwright test --grep @smoke`
3. **Resume the application** — start backend, then frontend
4. **Monitor closely** — watch logs and metrics for 1 hour
5. **Write a post-mortem** — what happened, how we recovered, how to prevent

## Common Recovery Issues

### Issue: "role dayjoy does not exist"

**Cause:** The backup was created by a different user.

**Fix:**
```bash
# Create the role first
psql postgres -c "CREATE ROLE dayjoy WITH LOGIN PASSWORD 'dayjoy' SUPERUSER;"

# Then restore
pg_restore --dbname=$DATABASE_URL --no-owner --no-privileges backup.dump
```

### Issue: "extension vector does not exist"

**Cause:** Target database doesn't have pgvector installed.

**Fix:**
```bash
# Connect to the target database
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Then restore
```

### Issue: "permission denied for table"

**Cause:** User doesn't have privileges.

**Fix:**
```bash
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE dayjoy_ai TO dayjoy;"
psql $DATABASE_URL -c "GRANT ALL ON SCHEMA public TO dayjoy;"
```

### Issue: Restore is very slow

**Cause:** Large database, slow disk, or no parallelism.

**Fix:**
```bash
# Use parallel jobs (4 workers)
pg_restore --dbname=$DATABASE_URL --no-owner --no-privileges --jobs=4 backup.dump

# Disable synchronous commits during restore (faster, less safe)
psql $DATABASE_URL -c "SET synchronous_commit = off;"

# Re-enable after restore
psql $DATABASE_URL -c "SET synchronous_commit = on;"
```

## Recovery Testing (DR Drill)

**Quarterly:** Perform a disaster recovery drill to verify backups work.

```bash
# 1. Pick a recent backup
LATEST_BACKUP=$(ls -t database/backups/*.dump.gz | head -1)
echo "Testing restore of: $LATEST_BACKUP"

# 2. Restore to a test database
dropdb dayjoy_dr_test --if-exists
createdb dayjoy_dr_test
pg_restore --dbname=postgresql://dayjoy:dayjoy@localhost:5432/dayjoy_dr_test \
  --no-owner --no-privileges <(gunzip -c $LATEST_BACKUP)

# 3. Verify row counts
psql postgresql://dayjoy:dayjoy@localhost:5432/dayjoy_dr_test -c "
  SELECT 'users' AS t, COUNT(*) FROM public.users
  UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
  UNION ALL SELECT 'customers', COUNT(*) FROM public.customers;
"

# 4. Document results in ops wiki

# 5. Clean up
dropdb dayjoy_dr_test
```

## Recovery Checklist

- [ ] Backup file located and downloaded
- [ ] Target database created (or existing one dropped)
- [ ] pgvector extension installed on target
- [ ] Restore completed without errors
- [ ] Row counts match production
- [ ] RLS policies present (50+ tables)
- [ ] Triggers present (30+)
- [ ] Views present (10+)
- [ ] Functions present (15+)
- [ ] Application health check passes
- [ ] Smoke tests pass
- [ ] Stakeholders notified of recovery
- [ ] Post-mortem written
