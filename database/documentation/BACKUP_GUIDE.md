# Backup Guide

How to back up the Dayjoy AI Enterprise database.

## Backup Strategy

### Production Backup Strategy

| Type | Frequency | Retention | Storage |
|---|---|---|---|
| **Full backup** | Daily (2 AM IST) | 30 days | S3 `dayjoy-prod-backups/` |
| **WAL archive** | Continuous | 7 days | S3 `dayjoy-prod-backups/wal/` |
| **Monthly backup** | 1st of month | 12 months | S3 Glacier |
| **Annual backup** | Jan 1 | 7 years | S3 Glacier Deep Archive |
| **Pre-migration snapshot** | Before each migration | 90 days | S3 `dayjoy-prod-backups/pre-migration/` |

### RDS Automated Backups (if using AWS RDS)

If using AWS RDS, enable:
- **Automated backups:** Retention 30 days
- **Point-in-time recovery:** 35 days (allows restore to any second in the last 35 days)
- **Automated snapshots:** Daily during maintenance window
- **Manual snapshots:** Before each migration

## Manual Backups

### Create a Backup

```bash
cd database
bash scripts/backup.sh
```

Output:
```
========================================
Dayjoy AI Enterprise — Backup
========================================
  Backup file: /path/to/database/backups/dayjoy_ai_20260101_020000.dump.gz
  Timestamp: 20260101_020000

Creating backup (pg_dump)...
  ✓ Backup created

Compressing...
  ✓ Compressed

  Backup size: 12M

Cleaning up backups older than 30 days...
  ✓ Cleanup done

========================================
Backup complete!
========================================
  File: /path/to/database/backups/dayjoy_ai_20260101_020000.dump.gz
  Size: 12M

To restore:
  bash database/scripts/restore.sh backups/dayjoy_ai_20260101_020000.dump.gz
```

### Manual pg_dump Command

```bash
# Full backup (custom format, compressed)
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" -f backup.dump

# Compress
gzip backup.dump

# Or in one command:
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" | gzip > backup.dump.gz
```

### Backup Only Specific Tables

```bash
# Backup only users and customers
pg_dump --format=custom \
  --table=public.users \
  --table=public.customers \
  "$DATABASE_URL" -f users_customers.dump
```

### Backup Only Schema (No Data)

```bash
pg_dump --schema-only --no-owner "$DATABASE_URL" -f schema_only.sql
```

### Backup Only Data (No Schema)

```bash
pg_dump --data-only --no-owner --no-privileges "$DATABASE_URL" -f data_only.sql
```

## Automated Backups (Cron)

### Set Up Daily Cron Backup

```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 2 AM):
0 2 * * * cd /path/to/dayjoy-ai-enterprise/database && bash scripts/backup.sh >> /var/log/dayjoy-backup.log 2>&1
```

### Set Up Backup to S3

```bash
# Install AWS CLI
sudo apt install awscli

# Configure
aws configure

# Update backup.sh to upload to S3:
# Add this at the end of backup.sh:
# aws s3 cp "${BACKUP_FILE}.gz" "s3://dayjoy-prod-backups/$(basename ${BACKUP_FILE}.gz)"
```

### Set Up Backup Rotation

The `backup.sh` script automatically deletes backups older than 30 days. For more sophisticated rotation:

```bash
# Daily: keep 7
# Weekly: keep 4
# Monthly: keep 12

# Add to crontab:
0 2 * * 1 cd /path/to/database && bash scripts/backup.sh  # weekly
0 2 1 * * cd /path/to/database && bash scripts/backup.sh  # monthly
```

## Verifying Backups

### Test Restore (Monthly)

**Critical:** Always test that backups can be restored.

```bash
# 1. Restore to a test database
createdb dayjoy_ai_test
DATABASE_URL=postgresql://dayjoy:dayjoy@localhost:5432/dayjoy_ai_test \
  bash scripts/restore.sh backups/dayjoy_ai_20260101_020000.dump.gz

# 2. Verify row counts match
psql postgresql://dayjoy:dayjoy@localhost:5432/dayjoy_ai_test -c "
  SELECT 'users' AS table, COUNT(*) FROM public.users
  UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
  UNION ALL SELECT 'customers', COUNT(*) FROM public.customers;
"

# 3. Drop the test database
dropdb dayjoy_ai_test
```

### Backup Integrity Check

```bash
# Verify the backup file is valid (lists contents without restoring)
pg_restore --list backups/dayjoy_ai_20260101_020000.dump | head -20
```

## Backup Monitoring

### Alert on Backup Failure

Add to your monitoring system (Prometheus alert or cron email):

```bash
# Check if today's backup exists
TODAY=$(date +%Y%m%d)
if ! ls database/backups/dayjoy_ai_${TODAY}_*.dump.gz > /dev/null 2>&1; then
  echo "ALERT: No backup found for $TODAY" | mail -s "Backup Alert" ops@dayjoy.ai
fi
```

### Backup Size Monitoring

```bash
# Alert if backup size drops significantly (may indicate data loss)
SIZE=$(stat -c%s database/backups/dayjoy_ai_$(date +%Y%m%d)_*.dump.gz)
if [ "$SIZE" -lt 1000000 ]; then  # less than 1MB
  echo "ALERT: Backup size is only $SIZE bytes" | mail -s "Backup Size Alert" ops@dayjoy.ai
fi
```

## Disaster Recovery

### RPO (Recovery Point Objective)

- **With WAL archiving:** Recovery to any point in the last 7 days (RPO ~0 seconds)
- **Without WAL archiving:** Recovery to last daily backup (RPO up to 24 hours)

### RTO (Recovery Time Objective)

- **Restore from S3:** 15-30 minutes for 10GB database
- **RDS point-in-time recovery:** 5-15 minutes
- **RDS snapshot restore:** 10-30 minutes

### Recovery Procedure

See [Recovery Guide](RECOVERY_GUIDE.md) for step-by-step recovery procedures.

## Backup Security

1. **Encrypt backups at rest** — S3 server-side encryption (SSE-KMS)
2. **Restrict access** — S3 bucket policy restricts to backup role only
3. **Use IAM roles, not access keys** — for EC2/EKS-based backups
4. **Audit access** — CloudTrail logs all S3 access
5. **Test restores quarterly** — verify backups work
6. **Store offsite** — S3 cross-region replication for DR

## Backup Checklist

- [ ] Daily backup cron job configured
- [ ] Backups uploaded to S3 with SSE-KMS encryption
- [ ] 30-day retention policy enforced
- [ ] Monthly backup test restore performed
- [ ] Backup failure alerts configured
- [ ] Backup size monitoring configured
- [ ] WAL archiving enabled (RDS)
- [ ] Point-in-time recovery enabled (RDS, 35-day retention)
- [ ] Quarterly DR drill performed
- [ ] Backup documentation up to date
