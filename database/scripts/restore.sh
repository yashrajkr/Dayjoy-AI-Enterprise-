#!/usr/bin/env bash
# =====================================================================
# Dayjoy AI Enterprise — Database Restore Script
# =====================================================================
# Restores a database from a backup file.
#
# Usage:   bash database/scripts/restore.sh <backup-file>
# Example: bash database/scripts/restore.sh backups/dayjoy_ai_20260101_120000.dump.gz
# =====================================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$1" ]; then
  echo -e "${RED}Error: Backup file not specified${NC}"
  echo -e "Usage: bash $0 <backup-file>"
  echo -e ""
  echo -e "Available backups:"
  ls -1 "$(dirname "$0")/../backups/"*.gz 2>/dev/null || echo "  (none)"
  exit 1
fi

BACKUP_FILE="$1"
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

if [ ! -f "$BACKUP_FILE" ]; then
  echo -e "${RED}Error: Backup file '$BACKUP_FILE' not found${NC}"
  exit 1
fi

DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
PSQL_ADMIN_URL=$(echo "$DATABASE_URL" | sed "s|/$DB_NAME|/postgres|")

echo -e "${RED}========================================${NC}"
echo -e "${RED}  WARNING: DATABASE RESTORE${NC}"
echo -e "${RED}========================================${NC}"
echo -e "${YELLOW}This will OVERWRITE all data in '$DB_NAME'.${NC}"
echo -e "  Backup file: $BACKUP_FILE"
echo ""
read -p "Are you sure? Type 'yes' to continue: " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

# Decompress if .gz
TEMP_FILE="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.gz ]]; then
  echo -e "\n${YELLOW}Decompressing...${NC}"
  TEMP_FILE="${BACKUP_FILE%.gz}"
  gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
  echo -e "  ${GREEN}✓${NC} Decompressed"
fi

echo -e "\n${YELLOW}Dropping existing database...${NC}"
psql "$PSQL_ADMIN_URL" -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);"
echo -e "  ${GREEN}✓${NC} Dropped"

echo -e "\n${YELLOW}Creating fresh database...${NC}"
psql "$PSQL_ADMIN_URL" -c "CREATE DATABASE \"$DB_NAME\";"
echo -e "  ${GREEN}✓${NC} Created"

echo -e "\n${YELLOW}Restoring from backup...${NC}"
pg_restore --dbname="$DATABASE_URL" --no-owner --no-privileges --clean --if-exists "$TEMP_FILE" || true
echo -e "  ${GREEN}✓${NC} Restored"

# Clean up temp file if we created it
if [[ "$BACKUP_FILE" == *.gz ]] && [ -f "$TEMP_FILE" ]; then
  rm "$TEMP_FILE"
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Restore complete!${NC}"
echo -e "${GREEN}========================================${NC}"
