# Troubleshooting Guide

Common database issues and how to resolve them.

## Connection Issues

### Issue: "connection refused"

**Cause:** PostgreSQL not running, or wrong host/port.

**Diagnosis:**
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check if port 5432 is listening
ss -tlnp | grep 5432

# Try connecting
psql -h localhost -p 5432 -U dayjoy -d dayjoy_ai
```

**Fix:**
```bash
# Start PostgreSQL
sudo systemctl start postgresql

# If using Docker
docker start dayjoy-postgres

# Check DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://user:password@host:5432/dbname
```

### Issue: "authentication failed for user"

**Cause:** Wrong password, or user doesn't exist.

**Diagnosis:**
```bash
# List PostgreSQL users
sudo -u postgres psql -c "\du"

# Check if user exists
sudo -u postgres psql -c "SELECT usename FROM pg_user WHERE usename = 'dayjoy';"
```

**Fix:**
```bash
# Create user
sudo -u postgres psql -c "CREATE USER dayjoy WITH PASSWORD 'dayjoy' CREATEDB SUPERUSER;"

# Or reset password
sudo -u postgres psql -c "ALTER USER dayjoy WITH PASSWORD 'dayjoy';"
```

### Issue: "database dayjoy_ai does not exist"

**Cause:** Database not created.

**Fix:**
```bash
sudo -u postgres psql -c "CREATE DATABASE dayjoy_ai OWNER dayjoy;"
```

### Issue: "too many connections"

**Cause:** Connection pool exhausted.

**Diagnosis:**
```bash
# Check max connections
psql $DATABASE_URL -c "SHOW max_connections;"

# Check current connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# See what's using connections
psql $DATABASE_URL -c "SELECT usename, application_name, count(*) FROM pg_stat_activity GROUP BY usename, application_name ORDER BY count DESC;"
```

**Fix:**
```bash
# Increase max_connections (requires restart)
sudo -u postgres psql -c "ALTER SYSTEM SET max_connections = '200';"
sudo systemctl restart postgresql

# Or kill idle connections
psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < NOW() - INTERVAL '1 hour';"

# In production: use PgBouncer for connection pooling
```

## Migration Issues

### Issue: "extension vector does not exist"

**Cause:** pgvector extension not installed on the database server.

**Diagnosis:**
```bash
psql $DATABASE_URL -c "SELECT * FROM pg_available_extensions WHERE name = 'vector';"
```

**Fix:**
```bash
# Ubuntu/Debian
sudo apt install postgresql-15-pgvector

# macOS
brew install pgvector

# Docker: use pgvector/pgvector:pg15 image

# Then create the extension
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Issue: "type order_status already exists"

**Cause:** Migration 002 was partially applied, then re-run.

**Fix:**
```bash
# Drop the type and re-run
psql $DATABASE_URL -c "DROP TYPE IF EXISTS public.order_status CASCADE;"
psql $DATABASE_URL -f migrations/005_orders.sql
```

### Issue: "cannot drop table because other objects depend on it"

**Cause:** Foreign key constraints prevent dropping.

**Fix:**
```bash
# Drop with CASCADE
psql $DATABASE_URL -c "DROP TABLE public.orders CASCADE;"

# Or find what depends on it first
psql $DATABASE_URL -c "
  SELECT tc.table_name, tc.constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND kcu.table_name = 'orders';
"
```

### Issue: Migration takes too long

**Cause:** Adding NOT NULL column to large table, or creating index without `CONCURRENTLY`.

**Fix:** See [Migration Guide](MIGRATION_GUIDE.md) for batch update patterns.

## Performance Issues

### Issue: Slow queries

**Diagnosis:**
```bash
# Enable slow query log (1 second threshold)
psql $DATABASE_URL -c "ALTER DATABASE dayjoy_ai SET log_min_duration_statement = 1000;"

# Check current slow queries
psql $DATABASE_URL -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
  FROM pg_stat_activity
  WHERE state = 'active' AND now() - pg_stat_activity.query_start > INTERVAL '5 seconds';
"

# Find queries waiting on locks
psql $DATABASE_URL -c "
  SELECT pid, mode, granted, query
  FROM pg_stat_activity
  JOIN pg_locks USING (pid)
  WHERE NOT granted;
"
```

**Fix:**
```bash
# Kill a long-running query
psql $DATABASE_URL -c "SELECT pg_terminate_backend(<pid>);"

# Analyze a slow query
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT * FROM public.orders WHERE customer_id = '...' AND status = 'DELIVERED';"

# Add missing indexes (check pg_stat_user_indexes for unused indexes)
psql $DATABASE_URL -c "SELECT relname, indexrelname, idx_scan FROM pg_stat_user_indexes WHERE idx_scan = 0 ORDER BY relname;"
```

### Issue: High CPU usage

**Diagnosis:**
```bash
# Top queries by CPU
psql $DATABASE_URL -c "
  SELECT query, calls, total_exec_time, mean_exec_time, rows
  FROM pg_stat_statements
  ORDER BY total_exec_time DESC
  LIMIT 10;
"

# Active queries
psql $DATABASE_URL -c "SELECT pid, state, query FROM pg_stat_activity WHERE state = 'active';"
```

**Fix:**
- Add indexes for missing queries
- Optimize queries (avoid SELECT *, use LIMIT)
- Increase `work_mem` for sorting operations
- Consider read replicas for read-heavy workloads

### Issue: High disk usage

**Diagnosis:**
```bash
# Database size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size('dayjoy_ai'));"

# Table sizes
psql $DATABASE_URL -c "
  SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
  FROM pg_catalog.pg_statio_user_tables
  ORDER BY pg_total_relation_size(relid) DESC
  LIMIT 20;
"

# Index sizes
psql $DATABASE_URL -c "
  SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS size
  FROM pg_catalog.pg_statio_user_indexes
  ORDER BY pg_relation_size(indexrelid) DESC
  LIMIT 20;
"
```

**Fix:**
```bash
# Vacuum to reclaim space
psql $DATABASE_URL -c "VACUUM ANALYZE;"

# For specific table
psql $DATABASE_URL -c "VACUUM FULL ANALYZE public.audit_logs;"

# Drop unused indexes
psql $DATABASE_URL -c "SELECT indexrelname FROM pg_stat_user_indexes WHERE idx_scan = 0;"
# Then: DROP INDEX ...
```

### Issue: Table bloat

**Diagnosis:**
```bash
# Check for bloat (requires pgstattuple extension)
psql $DATABASE_URL -c "CREATE EXTENSION IF NOT EXISTS pgstattuple;"
psql $DATABASE_URL -c "SELECT * FROM pgstattuple('public.orders');"
```

**Fix:**
```bash
# Regular VACUUM
psql $DATABASE_URL -c "VACUUM ANALYZE public.orders;"

# VACUUM FULL (locks the table, but reclaims all space)
psql $DATABASE_URL -c "VACUUM FULL public.orders;"

# Or use pg_repack for online vacuum (no lock)
# pg_repack -d $DATABASE_URL -t public.orders
```

## RLS Issues

### Issue: "permission denied for table"

**Cause:** User doesn't have SELECT/INSERT/UPDATE/DELETE privileges, or RLS is blocking access.

**Diagnosis:**
```bash
# Check table privileges
psql $DATABASE_URL -c "
  SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_name = 'users';
"

# Check RLS status
psql $DATABASE_URL -c "
  SELECT tablename, rowsecurity, forcerowsecurity
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'users';
"

# Check current tenant setting
psql $DATABASE_URL -c "SELECT current_setting('app.current_tenant', true);"
```

**Fix:**
```bash
# Grant privileges
psql $DATABASE_URL -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dayjoy;"

# Set tenant context
psql $DATABASE_URL -c "SET app.current_tenant = '<tenant-uuid>';"

# Bypass RLS (admin only)
psql $DATABASE_URL -c "ALTER USER dayjoy BYPASSRLS;"
```

### Issue: "new row violates row-level security policy"

**Cause:** Trying to insert a row with a different `tenant_id` than the current tenant.

**Fix:**
```bash
# Either set the correct tenant
psql $DATABASE_URL -c "SET app.current_tenant = '<correct-tenant-uuid>';"

# Or ensure the INSERT uses the current tenant_id
psql $DATABASE_URL -c "INSERT INTO public.users (..., tenant_id) VALUES (..., '<correct-tenant-uuid>');"
```

## Prisma Issues

### Issue: "Prisma Client not generated"

**Cause:** Need to run `prisma generate`.

**Fix:**
```bash
cd database
npx prisma generate --schema prisma/schema.prisma
```

### Issue: "Unknown argument" or "Unknown field"

**Cause:** Prisma schema is out of sync with the database.

**Fix:**
```bash
# 1. Update schema.prisma to match the database
# 2. Regenerate the client
npx prisma generate --schema prisma/schema.prisma

# Or pull the schema from the database
npx prisma db pull --schema prisma/schema.prisma
```

### Issue: "Cannot reach database server"

**Cause:** Database not running, or wrong connection string.

**Fix:**
```bash
# Test the connection
psql $DATABASE_URL -c "SELECT 1;"

# Check if DATABASE_URL is set
echo $DATABASE_URL

# Verify format
# Should be: postgresql://user:password@host:port/database?sslmode=require
```

## Replication Issues (Production)

### Issue: Replication lag

**Diagnosis:**
```bash
# On primary
psql $DATABASE_URL -c "SELECT * FROM pg_stat_replication;"

# Check WAL size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn)) FROM pg_stat_replication;"
```

**Fix:**
- Increase `max_wal_senders`
- Tune `wal_keep_segments`
- Check network bandwidth between primary and replica
- Check replica load (CPU, disk I/O)

## Common Error Messages

### "relation does not exist"

**Cause:** Table or view not created.

**Fix:** Run the appropriate migration.

### "duplicate key value violates unique constraint"

**Cause:** Trying to insert a duplicate.

**Fix:** Use `ON CONFLICT DO NOTHING` or `ON CONFLICT DO UPDATE`.

### "value too long for type character varying"

**Cause:** String exceeds column length.

**Fix:** Either shorten the value or alter the column:
```sql
ALTER TABLE public.users ALTER COLUMN first_name TYPE VARCHAR(200);
```

### "invalid input syntax for type uuid"

**Cause:** Passing a non-UUID string to a UUID column.

**Fix:** Use `gen_random_uuid()` or pass a valid UUID.

### "null value in column violates not-null constraint"

**Cause:** Missing required field.

**Fix:** Provide a value, or alter the column to allow NULL:
```sql
ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;
```

## Getting Help

If you can't resolve an issue:

1. **Check the logs:**
   ```bash
   sudo tail -f /var/log/postgresql/postgresql-15-main.log
   ```

2. **Check PostgreSQL documentation:** https://www.postgresql.org/docs/15/

3. **Check Prisma documentation:** https://www.prisma.io/docs

4. **Ask the team:** Slack `#dayjoy-engineering`

5. **Escalate to DBA:** For production issues, page the on-call DBA

## Performance Monitoring Queries

Keep these handy for diagnostics:

```sql
-- Active queries
SELECT pid, now() - query_start AS duration, state, query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- Lock waits
SELECT pid, mode, granted, query
FROM pg_stat_activity
JOIN pg_locks USING (pid)
WHERE NOT granted;

-- Database size
SELECT pg_size_pretty(pg_database_size('dayjoy_ai'));

-- Table sizes (top 20)
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;

-- Unused indexes
SELECT relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY relname;

-- Connection count
SELECT count(*), state FROM pg_stat_activity GROUP BY state;

-- Cache hit ratio
SELECT sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) AS ratio
FROM pg_statio_user_tables;
```
