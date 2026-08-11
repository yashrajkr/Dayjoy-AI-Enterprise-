#!/bin/bash
# PostgreSQL Restore Script
# Usage: ./restore_postgres.sh <backup_file>
# Requires: DB_PASSWORD environment variable (set in .env or CI secret).
set -euo pipefail
BACKUP_FILE="${1:?Usage: restore_postgres.sh <backup_file>}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-dayjoyai}"
DB_USER="${DB_USER:-dayjoy}"
: "${DB_PASSWORD:?DB_PASSWORD environment variable is required}"
echo "[$(date)] Starting PostgreSQL restore from: $BACKUP_FILE"
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi
echo "[$(date)] Restoring database $DB_NAME..."
gunzip -c "$BACKUP_FILE" | PGPASSWORD="$DB_PASSWORD" pg_restore \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges --clean --if-exists
echo "[$(date)] Restore complete!"
echo "[$(date)] Verifying..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
echo "[$(date)] Verification complete!"
