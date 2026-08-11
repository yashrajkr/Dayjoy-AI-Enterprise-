# n8n Security Checklist

This checklist is the source of truth for securing the Dayjoy AI Enterprise n8n deployment. Every box must be ticked (or have an explicit risk-acceptance note) before a release is allowed into production.

> **Owner**: Platform / DevOps team
> **Review cadence**: monthly (self-review) + quarterly (peer review) + annual (external audit)
> **Last reviewed**: — (fill in on first review)

---

## 1. Access Control

- [ ] n8n Basic Auth enabled (`N8N_BASIC_AUTH_ACTIVE=true`).
- [ ] n8n admin password is at least 16 chars, mixed case + digits + symbols.
- [ ] n8n instance is behind a VPN or IP allowlist (no direct public access from arbitrary IPs).
- [ ] HTTPS only — TLS 1.3 enforced, TLS 1.0/1.1 disabled.
- [ ] HSTS header set with `max-age=31536000; includeSubDomains; preload`.
- [ ] Rate limiting on webhook endpoints (100 req/min per IP, enforced by Caddy).
- [ ] All n8n UI logins require SSO via the Dayjoy IAM provider (no shared accounts).
- [ ] n8n user accounts use role-based access (admin / editor / viewer) — no global admin except for break-glass.
- [ ] Break-glass admin credentials stored in the secrets manager (not in any team member's password vault).

## 2. Secret Management

- [ ] `N8N_ENCRYPTION_KEY` stored in AWS Secrets Manager (or equivalent) and injected at container start.
- [ ] `N8N_ENCRYPTION_KEY` is 32 hex chars (256-bit) and never logged, never written to disk outside the secret store.
- [ ] API tokens (Dayjoy, WhatsApp, SendGrid, Razorpay, Google, etc.) stored as **n8n credentials**, never hardcoded in workflow JSON.
- [ ] `.env` file is in `.gitignore` and never committed.
- [ ] Database password rotated quarterly (see MAINTENANCE_GUIDE.md).
- [ ] SMTP credentials rotated quarterly.
- [ ] WhatsApp Business API access token rotated every 60 days.
- [ ] All secrets have a documented owner and rotation date.
- [ ] No secrets appear in n8n execution logs (verify by grepping a sample of error logs).

## 3. Webhook Security

- [ ] Public webhook endpoints verify HMAC signatures (`X-Dayjoy-Signature` header) before processing.
- [ ] Webhook signing secrets stored as n8n credentials (not env vars).
- [ ] Webhook signing uses HMAC-SHA256 with a 32-byte random key.
- [ ] Rate limiting on webhook endpoints (100 req/min per source IP) — enforced at Caddy layer.
- [ ] Webhook URLs are not publicly documented (no Swagger exposure).
- [ ] Webhook test endpoints (`/webhook-test/*`) disabled in production (`N8N_DISABLE_PRODUCTION_MAIN_PROCESS=true` on test paths).
- [ ] Webhook payloads are size-limited (1 MB max) at the Caddy layer.
- [ ] Replay-attack protection: reject webhooks with timestamps older than 5 minutes.

## 4. Workflow Security

- [ ] Workflows do not hardcode secrets — all secrets come from n8n credentials or `$env`.
- [ ] Workflows validate input data (schema + types) before processing.
- [ ] Error messages do not leak sensitive info (no raw payloads, no PII, no auth tokens).
- [ ] Workflows use least-privilege API tokens (scoped to specific endpoints, not global admin).
- [ ] Sensitive data (PII, payment info) encrypted at rest when stored in workflow variables.
- [ ] No workflow writes raw PII to logs (use `$json.email` masking, etc.).
- [ ] All workflows reviewed and approved by a second engineer before activation.
- [ ] Workflows that touch payment data are PCI-DSS reviewed.

## 5. Audit & Logging

- [ ] All workflow executions logged to the audit_logs table (via the global error handler).
- [ ] Credential access (create/update/delete) logged.
- [ ] Workflow imports logged (who imported what, when).
- [ ] Workflow activations/deactivations logged.
- [ ] Audit logs retained for 1 year (or longer if required by regulation).
- [ ] Audit logs forwarded to the SIEM (Splunk / OpenSearch) in near real-time.
- [ ] Audit logs are write-once (immutable storage — S3 Object Lock or equivalent).
- [ ] Failed login attempts to n8n UI logged and alerted on >5 failures in 5 minutes.

## 6. Network

- [ ] n8n runs in a private subnet (no public IP).
- [ ] Only the ALB / Caddy is exposed publicly (ports 80, 443).
- [ ] PostgreSQL not publicly accessible — only reachable from the n8n security group.
- [ ] Redis not publicly accessible — only reachable from the n8n security group.
- [ ] Security groups restrict ingress to known sources only.
- [ ] Egress from n8n limited to known endpoints (api.dayjoy.ai, graph.facebook.com, smtp.sendgrid.net, etc.) via a NAT + egress firewall.
- [ ] All inter-service traffic uses TLS (or stays inside the VPC).
- [ ] DNS records for n8n.dayjoy.ai use Cloudflare proxy (orange cloud) for DDoS protection.

## 7. Data Protection

- [ ] n8n PostgreSQL DB encrypted at rest (RDS encryption or LUKS).
- [ ] n8n_data volume (credential storage) encrypted at rest.
- [ ] Backups encrypted (S3 SSE-KMS) with a separate KMS key.
- [ ] Backups retained for 30 days; quarterly snapshots retained for 1 year.
- [ ] Database backups tested for restore at least quarterly.
- [ ] Personal Data (PII) in workflow execution history is purged on the 14-day retention window.
- [ ] GDPR right-to-erasure requests can be fulfilled by purging workflow execution history for a given user ID.

## 8. Vulnerability Management

- [ ] n8n version pinned to a known-good digest (not `:latest`) in production.
- [ ] n8n version upgraded within 14 days of a new stable release.
- [ ] Critical n8n CVEs patched within 48 hours.
- [ ] Base image (node, postgres, redis) scanned with Trivy on every build.
- [ ] Container images scanned for secrets (gitleaks) before push.
- [ ] Dependabot / Renovate enabled for the n8n docker-compose repo.
- [ ] Quarterly external penetration test covering the n8n instance.

## 9. Disaster Recovery

- [ ] n8n_data volume backed up daily (encrypted, offsite).
- [ ] n8n PostgreSQL DB backed up daily (pg_dump + WAL archiving).
- [ ] Backups tested for restore at least quarterly.
- [ ] RTO (Recovery Time Objective) documented: 4 hours.
- [ ] RPO (Recovery Point Objective) documented: 24 hours (daily backups).
- [ ] Runbook for n8n restore documented in OPERATIONS_GUIDE.md.
- [ ] Documented procedure to migrate to a new n8n instance (encryption key rotation, credential re-import).

## 10. Compliance

- [ ] n8n workflow execution history retained per legal hold requirements.
- [ ] Access to n8n instance restricted to authorized personnel (documented in the access matrix).
- [ ] Data residency: all n8n data (DB, volumes, backups) stays in the India region (ap-south-1).
- [ ] DPDPA (Digital Personal Data Protection Act) compliance reviewed annually.
- [ ] GST e-invoicing workflows log audit trails for 7 years (per GST law).

## 11. Incident Response

- [ ] PagerDuty integration tested (test alert sent and acknowledged).
- [ ] Slack #ops-alerts monitored 24/7 (PagerDuty escalation if no ack in 5 min).
- [ ] Incident response runbook documented (see OPERATIONS_GUIDE.md §Incident Response).
- [ ] Post-incident review template available.
- [ ] On-call rotation documented and shared with the team.

## 12. Pre-Production Sign-off

Before any workflow goes live:
- [ ] Code reviewed by a second engineer.
- [ ] Tested in staging n8n instance.
- [ ] Security review (this checklist items 3, 4, 5 confirmed).
- [ ] Monitoring + alerts configured (workflow appears on the dashboard).
- [ ] Rollback plan documented (how to deactivate + revert).
- [ ] Owner + on-call escalation path documented in the workflow's `meta.description`.

---

**Sign-off**:

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Platform Lead | | | |
| Security Lead | | | |
| DevOps Lead | | | |
