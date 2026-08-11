# Database Setup Guide

Complete step-by-step guide to set up the Dayjoy AI Enterprise database from scratch.

## Prerequisites

### 1. PostgreSQL 15+

**Install on Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Install on macOS (Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Install on Windows:**
Download from https://www.postgresql.org/download/windows/ and run the installer.

**Use Docker (recommended for development):**
```bash
docker run -d \
  --name dayjoy-postgres \
  -e POSTGRES_USER=dayjoy \
  -e POSTGRES_PASSWORD=dayjoy \
  -e POSTGRES_DB=dayjoy_ai \
  -p 5432:5432 \
  pgvector/pgvector:pg15
```

### 2. Node.js 18+

Download from https://nodejs.org/ or use nvm:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 18
nvm use 18
```

### 3. pnpm 8+

```bash
npm install -g pnpm
```

### 4. pgvector Extension

If using Docker, the `pgvector/pgvector:pg15` image already has it. Otherwise:

```bash
# Ubuntu/Debian
sudo apt install postgresql-15-pgvector

# macOS
brew install pgvector
```

## Setup Steps

### Step 1: Configure Environment

```bash
cd database
cp .env.example .env
```

Edit `.env`:

```bash
# For local development
DATABASE_URL=postgresql://dayjoy:dayjoy@localhost:5432/dayjoy_ai

# For Docker
# DATABASE_URL=postgresql://dayjoy:dayjoy@localhost:5432/dayjoy_ai

# For production
# DATABASE_URL=postgresql://user:password@rds-host:5432/dayjoy_ai?sslmode=require
```

### Step 2: Run the Setup Script

```bash
bash scripts/setup.sh
```

This script:
1. Verifies prerequisites (psql, node, npx)
2. Loads `.env`
3. Creates the database if it doesn't exist
4. Runs all 14 migrations in order (001 → 014)
5. Applies database functions (`functions/*.sql`)
6. Applies database views (`views/*.sql`)
7. Applies database triggers (`triggers/*.sql`)
8. Generates the Prisma client (`npx prisma generate`)
9. Runs the seed script (`tsx seed/seed.ts`)

### Step 3: Validate

```bash
bash scripts/validate.sh
```

Expected output:
```
[1/8] Checking extensions...        ✓ pgcrypto, pg_trgm, vector, citext
[2/8] Checking tables...            ✓ 67 tables
[3/8] Checking indexes...           ✓ 120+ indexes
[4/8] Checking functions...         ✓ 17 functions
[5/8] Checking views...             ✓ 10 views
[6/8] Checking triggers...          ✓ 35+ triggers
[7/8] Checking RLS...               ✓ 55+ tables with RLS
[8/8] Checking seed data...         ✓ permissions, tenants, users, roles

✓ All checks passed! Database is ready.
```

### Step 4: Open Prisma Studio (GUI)

```bash
npx prisma studio --schema prisma/schema.prisma
```

Opens a web UI at http://localhost:5555 where you can browse and edit tables.

### Step 5: Verify with psql

```bash
psql $DATABASE_URL

# List all tables
\dt public.*

# Show table structure
\d public.users

# Count rows in each table
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

# Check RLS policies
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';

# Exit
\q
```

## Manual Setup (Without Script)

If you prefer to run commands manually:

```bash
# 1. Create database
psql postgres -c "CREATE DATABASE dayjoy_ai;"

# 2. Run migrations in order
for f in migrations/0*.sql; do
  echo "Applying $f..."
  psql $DATABASE_URL -f $f
done

# 3. Apply functions, views, triggers
psql $DATABASE_URL -f functions/utility_functions.sql
psql $DATABASE_URL -f views/common_views.sql
psql $DATABASE_URL -f triggers/business_triggers.sql

# 4. Generate Prisma client
npx prisma generate --schema prisma/schema.prisma

# 5. Seed
npx tsx seed/seed.ts
```

## Common Issues

### Issue: "extension vector does not exist"

**Cause:** pgvector extension not installed.

**Fix:**
```bash
# Docker: use pgvector/pgvector:pg15 image
# Ubuntu: sudo apt install postgresql-15-pgvector
# macOS: brew install pgvector

# Verify:
psql $DATABASE_URL -c "SELECT * FROM pg_available_extensions WHERE name = 'vector';"
```

### Issue: "permission denied for table"

**Cause:** Database user lacks privileges.

**Fix:**
```bash
psql postgres -c "ALTER USER dayjoy WITH SUPERUSER;"  # dev only
# OR grant specific privileges:
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE dayjoy_ai TO dayjoy;"
```

### Issue: "database dayjoy_ai already exists"

**Cause:** Database was created previously.

**Fix:** Either drop and recreate:
```bash
psql postgres -c "DROP DATABASE dayjoy_ai;"
bash scripts/setup.sh
```

Or skip the create step and just run migrations:
```bash
for f in migrations/0*.sql; do psql $DATABASE_URL -f $f; done
```

### Issue: "role dayjoy does not exist"

**Cause:** PostgreSQL user not created.

**Fix:**
```bash
psql postgres -c "CREATE USER dayjoy WITH PASSWORD 'dayjoy' CREATEDB SUPERUSER;"
```

## Next Steps

After setup is complete:

1. **Start the backend** — `cd backend && pnpm start:dev`
2. **Start the frontend** — `cd apps/admin-dashboard && pnpm dev`
3. **Read the [Migration Guide](MIGRATION_GUIDE.md)** — for making schema changes
4. **Read the [Seed Guide](SEED_GUIDE.md)** — for adding seed data
5. **Read the [Backup Guide](BACKUP_GUIDE.md)** — for production backups
