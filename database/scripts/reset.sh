#!/usr/bin/env bash
# =====================================================================
# Dayjoy AI Enterprise — Database Reset Script
# =====================================================================
# WARNING: This drops ALL data and recreates the database from scratch.
#          Use only in development.
#
# Usage:   bash database/scripts/reset.sh
# =====================================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}========================================${NC}"
echo -e "${RED}  DANGER: DATABASE RESET${NC}"
echo -e "${RED}========================================${NC}"
echo -e "${YELLOW}This will DROP all data and recreate the schema.${NC}"
echo -e "${YELLOW}Only use in development.${NC}"
echo ""

read -p "Are you sure? Type 'yes' to continue: " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$DB_DIR/.env" ]; then
  set -a
  source "$DB_DIR/.env"
  set +a
fi

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}Error: DATABASE_URL not set${NC}"
  exit 1
fi

DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
PSQL_ADMIN_URL=$(echo "$DATABASE_URL" | sed "s|/$DB_NAME|/postgres|")

echo -e "\n${YELLOW}Dropping database '$DB_NAME'...${NC}"
psql "$PSQL_ADMIN_URL" -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);"
echo -e "  ${GREEN}✓${NC} Dropped"

echo -e "\n${YELLOW}Creating database '$DB_NAME'...${NC}"
psql "$PSQL_ADMIN_URL" -c "CREATE DATABASE \"$DB_NAME\";"
echo -e "  ${GREEN}✓${NC} Created"

echo -e "\n${YELLOW}Running setup...${NC}"
bash "$SCRIPT_DIR/setup.sh"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Database reset complete!${NC}"
echo -e "${GREEN}========================================${NC}"
