#!/usr/bin/env bash
# =====================================================================
# Dayjoy AI Enterprise — Database Backup Script
# =====================================================================
# Creates a timestamped backup of the database.
#
# Usage:   bash database/scripts/backup.sh
# =====================================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

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

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$DB_DIR/backups"
BACKUP_FILE="$BACKUP_DIR/dayjoy_ai_$TIMESTAMP.dump"

mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Dayjoy AI Enterprise — Backup${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "  Backup file: $BACKUP_FILE"
echo -e "  Timestamp: $TIMESTAMP"
echo ""

echo -e "${YELLOW}Creating backup (pg_dump)...${NC}"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" -f "$BACKUP_FILE"
echo -e "  ${GREEN}✓${NC} Backup created"

# Compress
echo -e "\n${YELLOW}Compressing...${NC}"
gzip -f "$BACKUP_FILE"
echo -e "  ${GREEN}✓${NC} Compressed: ${BACKUP_FILE}.gz"

# Show size
SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
echo -e "\n  Backup size: $SIZE"

# Cleanup old backups (keep last 30)
echo -e "\n${YELLOW}Cleaning up backups older than 30 days...${NC}"
find "$BACKUP_DIR" -name "dayjoy_ai_*.dump.gz" -mtime +30 -delete
echo -e "  ${GREEN}✓${NC} Cleanup done"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Backup complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "  File: ${BACKUP_FILE}.gz"
echo -e "  Size: $SIZE"
echo ""
echo -e "To restore:"
echo -e "  bash database/scripts/restore.sh ${BACKUP_FILE}.gz"
