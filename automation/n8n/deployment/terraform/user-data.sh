#!/bin/bash
# =============================================================================
# Dayjoy n8n — EC2 user-data script (cloud-init)
# Runs once on first boot. Installs Docker, pulls the n8n image, starts
# the docker-compose stack. Secrets are pulled at runtime via the IAM role
# from AWS Secrets Manager (the bootstrap script /run/n8n-bootstrap.sh).
# =============================================================================
set -euo pipefail

# --- Template variables (filled by Terraform templatefile) ---
N8N_VERSION="${n8n_version}"
DAYJOY_API_URL="${dayjoy_api_url}"
BACKUP_BUCKET="${backup_bucket_name}"
AWS_REGION="${aws_region}"

echo "[dayjoy-n8n] Starting cloud-init at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- 1. System updates + base packages ---
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  ca-certificates curl gnupg lsb-release unzip jq python3-pip \
  amazon-cloudwatch-agent \
  postgresql-client-15 redis-tools

# --- 2. Install Docker Engine + Compose v2 ---
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
usermod -aG docker ubuntu

# --- 3. Create the external Docker network ---
docker network create dayjoy-network 2>/dev/null || true

# --- 4. CloudWatch Agent (host metrics + logs) ---
cat > /opt/aws-cloudwatch-agent.json <<EOF
{
  "metrics": {
    "metrics_collected": {
      "cpu": { "measurement": ["cpu_usage_idle", "cpu_usage_iowait"], "metrics_collection_interval": 60 },
      "disk": { "measurement": ["used_percent"], "metrics_collection_interval": 60, "resources": ["*"] },
      "mem": { "measurement": ["mem_used_percent"], "metrics_collection_interval": 60 }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/var/log/docker-containers/*.log", "log_group_name": "/dayjoy/n8n/containers", "log_stream_name": "{instance_id}" },
          { "file_path": "/var/log/syslog", "log_group_name": "/dayjoy/n8n/host", "log_stream_name": "{instance_id}-syslog" }
        ]
      }
    }
  }
}
EOF

systemctl enable amazon-cloudwatch-agent
systemctl start amazon-cloudwatch-agent || systemctl restart amazon-cloudwatch-agent

# --- 5. Clone the repo + pull the docker-compose stack ---
mkdir -p /opt/dayjoy
cd /opt/dayjoy
if [ ! -d dayjoy-ai-enterprise ]; then
  git clone --depth 1 https://github.com/dayjoy/dayjoy-ai-enterprise.git
fi
cd dayjoy-ai-enterprise/automation/n8n

# --- 6. Bootstrap secrets from AWS Secrets Manager into /opt/dayjoy/.env ---
# The instance IAM role has read access to dayjoy/n8n/* in Secrets Manager.
cat > /opt/dayjoy/fetch-secrets.sh <<'EOF'
#!/bin/bash
set -euo pipefail
SM="aws secretsmanager --region ${AWS_REGION}"
SECRETS_JSON=$($SM get-secret-value --secret-id dayjoy/n8n/production --query SecretString --output text)
echo "$SECRETS_JSON" | jq -r 'to_entries[] | "\(.key | ascii_uppercase)=\(.value)"' > /opt/dayjoy/.env.n8n
# Encryption key (separate secret)
ENC=$($SM get-secret-value --secret-id dayjoy/n8n/encryption-key --query SecretString --output text | jq -r .encryption_key)
echo "N8N_ENCRYPTION_KEY=$ENC" >> /opt/dayjoy/.env.n8n
chmod 600 /opt/dayjoy/.env.n8n
chown root:root /opt/dayjoy/.env.n8n
EOF
chmod +x /opt/dayjoy/fetch-secrets.sh
/opt/dayjoy/fetch-secrets.sh

# --- 7. Merge static config + secrets into the .env used by docker-compose ---
cat > /opt/dayjoy/.env <<EOF
N8N_HOST=n8n.dayjoy.ai
N8N_PROTOCOL=https
WEBHOOK_URL=https://n8n.dayjoy.ai/
GENERIC_TIMEZONE=Asia/Kolkata
DAYJOY_API_URL=${DAYJOY_API_URL}
PROMETHEUS_PUSHGATEWAY_URL=http://prometheus-pushgateway:9091
EOF
cat /opt/dayjoy/.env.n8n >> /opt/dayjoy/.env
chmod 600 /opt/dayjoy/.env

# --- 8. Symlink .env into the docker-compose dir ---
ln -sf /opt/dayjoy/.env /opt/dayjoy/dayjoy-ai-enterprise/automation/n8n/.env

# --- 9. Pull images + start the stack ---
cd /opt/dayjoy/dayjoy-ai-enterprise/automation/n8n
docker compose --env-file .env pull
docker compose --env-file .env up -d

# --- 10. Install the daily backup cron ---
cat > /opt/dayjoy/n8n-backup.sh <<'EOF'
#!/bin/bash
set -euo pipefail
DATE=$(date -u +%Y%m%dT%H%M%SZ)
S3_PATH="s3://${BACKUP_BUCKET}/production/${DATE}"
# 1. n8n_data volume
docker run --rm -v dayjoy-n8n-data:/data -v /tmp:/backup alpine \
  tar czf /backup/n8n_data_${DATE}.tar.gz -C /data .
aws s3 cp /tmp/n8n_data_${DATE}.tar.gz ${S3_PATH}/n8n_data.tar.gz --sse aws:kms
rm /tmp/n8n_data_${DATE}.tar.gz
# 2. Postgres dump
docker exec dayjoy-n8n-postgres pg_dump -U dayjoy -d dayjoy_n8n | \
  aws s3 cp - ${S3_PATH}/postgres.sql.gz --sse aws:kms
# 3. Cleanup local backups older than 7 days (S3 lifecycle handles the rest)
find /tmp -name "n8n_data_*.tar.gz" -mtime +7 -delete || true
EOF
chmod +x /opt/dayjoy/n8n-backup.sh
# Run daily at 02:00 IST (= 20:30 UTC previous day)
( crontab -l 2>/dev/null; echo "30 20 * * * /opt/dayjoy/n8n-backup.sh >> /var/log/n8n-backup.log 2>&1" ) | crontab -

# --- 11. Schedule periodic secret refresh (in case SM values rotate) ---
( crontab -l 2>/dev/null; echo "0 * * * * /opt/dayjoy/fetch-secrets.sh && cd /opt/dayjoy/dayjoy-ai-enterprise/automation/n8n && docker compose --env-file .env up -d --force-recreate n8n-main n8n-worker" ) | crontab -

# --- 12. Final health check ---
echo "[dayjoy-n8n] Waiting for n8n to come up..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:5678/healthz > /dev/null 2>&1; then
    echo "[dayjoy-n8n] n8n is healthy (attempt $i)"
    break
  fi
  sleep 10
done

echo "[dayjoy-n8n] Cloud-init complete at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
