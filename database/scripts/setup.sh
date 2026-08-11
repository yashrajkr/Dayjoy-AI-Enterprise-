#!/usr/bin/env bash
# =====================================================================
# Dayjoy AI Enterprise — Database Setup Script
# =====================================================================
# Purpose: One-command setup for the complete database layer.
#          Run on a fresh PostgreSQL instance.
#
# Usage:   bash database/scripts/setup.sh
# =====================================================================

set -e  # exit on any error

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Dayjoy AI Enterprise — Database Setup${NC}"
echo -e "${GREEN}========================================${NC}"

# --- 1. Check prerequisites ---
echo -e "\n${YELLOW}[1/8] Checking prerequisites...${NC}"

if ! command -v psql &> /dev/null; then
  echo -e "${RED}Error: psql (PostgreSQL client) not found. Install PostgreSQL first.${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} psql found: $(psql --version)"

if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js not found. Install Node.js 18+ first.${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Node.js found: $(node --version)"

if ! command -v npx &> /dev/null; then
  echo -e "${RED}Error: npx not found. Install Node.js 18+ first.${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} npx found"

# --- 2. Load env ---
echo -e "\n${YELLOW}[2/8] Loading environment...${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -f "$DB_DIR/.env" ]; then
  if [ -f "$DB_DIR/.env.example" ]; then
    echo -e "  ${YELLOW}!${NC} No .env found. Copying .env.example to .env"
    cp "$DB_DIR/.env.example" "$DB_DIR/.env"
    echo -e "  ${RED}Please edit $DB_DIR/.env with your database credentials, then re-run.${NC}"
    exit 1
  else
    echo -e "${RED}Error: No .env or .env.example found in $DB_DIR${NC}"
    exit 1
  fi
fi

# Load DATABASE_URL from .env
set -a
source "$DB_DIR/.env"
set +a

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}Error: DATABASE_URL not set in .env${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} DATABASE_URL loaded"

# Extract DB name from DATABASE_URL for raw psql commands
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
echo -e "  ${GREEN}✓${NC} Database: $DB_NAME"

# --- 3. Create database (if not exists) ---
echo -e "\n${YELLOW}[3/8] Creating database (if not exists)...${NC}"

# Connect to 'postgres' default DB to create our DB
PSQL_ADMIN_URL=$(echo "$DATABASE_URL" | sed "s|/$DB_NAME|/postgres|")

if psql "$PSQL_ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
  echo -e "  ${GREEN}✓${NC} Database '$DB_NAME' already exists"
else
  psql "$PSQL_ADMIN_URL" -c "CREATE DATABASE \"$DB_NAME\";"
  echo -e "  ${GREEN}✓${NC} Database '$DB_NAME' created"
fi

# --- 4. Run migrations ---
echo -e "\n${YELLOW}[4/8] Running migrations (001-014)...${NC}"

MIGRATIONS_DIR="$DB_DIR/migrations"
for migration in $(ls "$MIGRATIONS_DIR"/[0-9][0-9][0-9]_*.sql | sort); do
  name=$(basename "$migration")
  echo -e "  ${YELLOW}→${NC} Applying $name..."
  if psql "$DATABASE_URL" -f "$migration" > /tmp/migration_$name.log 2>&1; then
    echo -e "  ${GREEN}✓${NC} $name"
  else
    echo -e "  ${RED}✗${NC} $name FAILED"
    cat /tmp/migration_$name.log
    exit 1
  fi
done

# --- 5. Apply database functions, views, triggers ---
echo -e "\n${YELLOW}[5/8] Applying database functions...${NC}"
for func_file in "$DB_DIR"/functions/*.sql; do
  name=$(basename "$func_file")
  echo -e "  ${YELLOW}→${NC} $name"
  psql "$DATABASE_URL" -f "$func_file" > /tmp/func_$name.log 2>&1 || {
    echo -e "  ${RED}✗${NC} $name FAILED"
    cat /tmp/func_$name.log
  }
  echo -e "  ${GREEN}✓${NC} $name"
done

echo -e "\n${YELLOW}[6/8] Applying database views...${NC}"
for view_file in "$DB_DIR"/views/*.sql; do
  name=$(basename "$view_file")
  echo -e "  ${YELLOW}→${NC} $name"
  psql "$DATABASE_URL" -f "$view_file" > /tmp/view_$name.log 2>&1 || {
    echo -e "  ${RED}✗${NC} $name FAILED"
    cat /tmp/view_$name.log
  }
  echo -e "  ${GREEN}✓${NC} $name"
done

echo -e "\n${YELLOW}[7/8] Applying database triggers...${NC}"
for trigger_file in "$DB_DIR"/triggers/*.sql; do
  name=$(basename "$trigger_file")
  echo -e "  ${YELLOW}→${NC} $name"
  psql "$DATABASE_URL" -f "$trigger_file" > /tmp/trigger_$name.log 2>&1 || {
    echo -e "  ${RED}✗${NC} $name FAILED"
    cat /tmp/trigger_$name.log
  }
  echo -e "  ${GREEN}✓${NC} $name"
done

# --- 6. Generate Prisma client ---
echo -e "\n${YELLOW}[8/8] Generating Prisma client...${NC}"

cd "$DB_DIR"
npx prisma generate --schema prisma/schema.prisma
echo -e "  ${GREEN}✓${NC} Prisma client generated"

# --- 7. Seed ---
echo -e "\n${YELLOW}Running seed script...${NC}"

if [ -f "$DB_DIR/seed/seed.ts" ]; then
  npx tsx "$DB_DIR/seed/seed.ts" || {
    echo -e "${YELLOW}Warning: Seed script failed. You can run it manually later.${NC}"
    echo -e "  Command: cd $DB_DIR && npx tsx seed/seed.ts"
  }
else
  echo -e "${YELLOW}No seed.ts found. Skipping.${NC}"
fi

# --- Done ---
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Database setup complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\nNext steps:"
echo -e "  1. Verify: bash database/scripts/validate.sh"
echo -e "  2. Open Prisma Studio: cd database && npx prisma studio --schema prisma/schema.prisma"
echo -e "  3. Start backend: cd backend && pnpm start:dev"
echo -e ""
