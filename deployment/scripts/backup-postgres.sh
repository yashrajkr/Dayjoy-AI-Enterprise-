#!/bin/bash
# PostgreSQL Backup Script
# Usage: ./backup_postgres.sh [S3_BUCKET]
# Requires: DB_PASSWORD environment variable (set in .env or CI secret).
set -euo pipefail
BACKUP_DIR="/backups"
S3_BUCKET="${1:-dayjoyai-backups}"
RETENTION_DAYS=7
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-dayjoyai}"
DB_USER="${DB_USER:-dayjoy}"
: "${DB_PASSWORD:?DB_PASSWORD environment variable is required}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
echo "[$(date)] Starting PostgreSQL backup..."
mkdir -p "$BACKUP_DIR"
echo "[$(date)] Dumping database $DB_NAME..."
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges --format=custom | gzip > "$BACKUP_FILE"
echo "[$(date)] Backup saved: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
if command -v aws &> /dev/null; then
    echo "[$(date)] Uploading to S3..."
    aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/postgres/$(basename "$BACKUP_FILE")" --sse AES256
    echo "[$(date)] Upload complete."
else
    echo "[$(date)] AWS CLI not found — skipping S3 upload."
fi
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +$RETENTION_DAYS -delete
echo "[$(date)] Backup complete!"
