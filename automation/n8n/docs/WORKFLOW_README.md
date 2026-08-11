# Dayjoy n8n — Workflow README

This is the comprehensive guide to **every workflow** in the Dayjoy AI Enterprise n8n instance. Use this as the index for what each workflow does, where it lives, how to import it, and how to operate it.

> **Repository layout**: `automation/n8n/workflows/<category>/<workflow-name>.json`
> **Total workflows**: 39+ (this README covers all categories; A1/A2 own the workflow JSONs in `whatsapp-ai/`, `voice-ai/`, `crm/`, `leads/`, etc.; A3 owns `monitoring/`, `error-handling/`, and `security/`).

---

## Table of Contents

1. [Workflow Categories](#1-workflow-categories)
2. [Inventory (all 39+ workflows)](#2-inventory-all-39-workflows)
3. [How to Import a Workflow](#3-how-to-import-a-workflow)
4. [How to Activate / Deactivate](#4-how-to-activate--deactivate)
5. [How to Test a Workflow](#5-how-to-test-a-workflow)
6. [Common Patterns](#6-common-patterns)
7. [Naming Conventions](#7-naming-conventions)
8. [Ownership Matrix](#8-ownership-matrix)

---

## 1. Workflow Categories

| # | Category | Folder | Count | Owner | Description |
|---|----------|--------|-------|-------|-------------|
| 1 | WhatsApp AI | `workflows/whatsapp-ai/` | 8 | A1 | WhatsApp Business Cloud API: inbound message routing, AI replies, handoff, template sync. |
| 2 | Voice AI | `workflows/voice-ai/` | 6 | A1 | Telephony webhooks (Bland/Vapi/Retell), call transcription, post-call actions. |
| 3 | CRM | `workflows/crm/` | 5 | A1 | Lead capture, distributor onboarding, customer sync, lifecycle automations. |
| 4 | Leads | `workflows/leads/` | 4 | A1 | Lead scoring, assignment, follow-up reminders, conversion triggers. |
| 5 | Notifications | `workflows/notifications/` | 4 | A2 | Multi-channel notifications: email, WhatsApp, push, SMS. |
| 6 | Calendar | `workflows/calendar/` | 3 | A2 | Google Calendar: meeting booking, reminders, reschedule. |
| 7 | Payments | `workflows/payments/` | 3 | A2 | Razorpay: payment links, refund processing, webhook handling. |
| 8 | Reports | `workflows/reports/` | 3 | A2 | Daily/weekly/monthly business reports via email + Slack. |
| 9 | **Error Handling** | `workflows/error-handling/` | 3 | **A3** | Global error handler, dead-letter processor, retry strategy. |
| 10 | **Monitoring** | `workflows/monitoring/` | 3 | **A3** | Metrics dashboard, alert rules, health check. |
| 11 | **Security** | `workflows/security/` (in `security/`) | 1 | **A3** | HMAC webhook signature verification reference. |

**Total: 43 workflows** across 11 categories. The 7 workflows owned by A3 (this agent) are fully documented in §2 below; the other 36 are owned by A1/A2 and documented in their respective folder READMEs.

---

## 2. Inventory (all 39+ workflows)

### 2.1 Error Handling (A3 — this agent)

| Workflow | File | Trigger | Cadence | Description |
|----------|------|---------|---------|-------------|
| Global Error Handler | `error-handling/global-error-handler.json` | Error Trigger | Real-time | Catches errors from ALL workflows, classifies (transient/data/auth/external), logs to audit DB, routes to right team. Transient → retry 3×/30s; auth → page on-call; data → notify data team; external → probe provider then alert. |
| Dead-Letter Processor | `error-handling/dead-letter-processor.json` | Schedule | 5 min + daily 09:00 | Drains the DLQ. Each item gets up to 3 total attempts (1 original + 2 retries). If still failing → archive + page on-call. Daily 09:00 report to Slack + email. |
| Retry Strategy | `error-handling/retry-strategy.json` | Execute Workflow Trigger | On-call | Reusable sub-workflow. Classifies error and applies the right strategy: network=3× exp backoff (1s/2s/4s); rate_limit=1× after 60s; validation=DLQ no retry; auth=refresh token + 1 retry; server_error=2× with 10s backoff. |

### 2.2 Monitoring (A3 — this agent)

| Workflow | File | Trigger | Cadence | Description |
|----------|------|---------|---------|-------------|
| Workflow Metrics Dashboard | `monitoring/workflow-dashboard.json` | Schedule | 5 min | Collects n8n execution metrics (1h/24h/7d), per-workflow success/failure/avg-duration, active workflow count, queue depth. Pushes gauges to Prometheus pushgateway, persists to backend DB, triggers Grafana refresh. |
| Alert Rules | `monitoring/alert-rules.json` | Schedule | 5 min | Evaluates 6 alert rules: failure rate >10%/1h, execution time >5 min, queue depth >100, scheduled workflow idle >24h, CPU >80%, memory >80%. Firing alerts → Slack #ops-alerts; critical → PagerDuty. |
| Health Check | `monitoring/health-check.json` | Schedule | 1 min | Probes n8n /healthz, backend /api/health, database /api/health/db, redis /api/health/redis. Any failure → immediate Slack alert + PagerDuty page + audit log. |

### 2.3 Security (A3 — this agent)

| Workflow | File | Trigger | Cadence | Description |
|----------|------|---------|---------|-------------|
| Webhook Signature Verification | `security/webhook-signature-verification.json` | Webhook | Real-time | Reference workflow showing HMAC-SHA256 signature verification. Uses timing-safe compare + 5-min replay window. Failed verifications logged to audit. |

### 2.4 WhatsApp AI (A1)

| Workflow | File | Trigger | Description |
|----------|------|---------|-------------|
| WhatsApp Inbound Router | `whatsapp-ai/inbound-router.json` | Webhook | Routes inbound WhatsApp messages to the right handler (AI / human / template). |
| WhatsApp AI Reply | `whatsapp-ai/ai-reply.json` | Execute Workflow | Calls the Dayjoy RAG/LLM service and sends the AI-generated reply back. |
| WhatsApp Human Handoff | `whatsapp-ai/human-handoff.json` | Execute Workflow | Transfers a conversation to a human agent when AI confidence is low. |
| WhatsApp Template Sync | `whatsapp-ai/template-sync.json` | Schedule | Syncs approved WhatsApp templates from Meta to the backend. |
| WhatsApp Outbound Campaign | `whatsapp-ai/outbound-campaign.json` | Webhook | Sends campaign messages in compliance with Meta's 24-hour rule. |
| WhatsApp Read Receipts | `whatsapp-ai/read-receipts.json` | Webhook | Marks messages as read for inbound WhatsApp messages. |
| WhatsApp Session Refresh | `whatsapp-ai/session-refresh.json` | Schedule | Refreshes WhatsApp Business API session tokens. |
| WhatsApp Media Handler | `whatsapp-ai/media-handler.json` | Webhook | Downloads + stores media (images, voice notes, documents) from WhatsApp. |

### 2.5 Voice AI (A1)

| Workflow | File | Trigger | Description |
|----------|------|---------|-------------|
| Voice Webhook (Bland) | `voice-ai/bland-webhook.json` | Webhook | Receives Bland AI call events (start, end, transcript). |
| Voice Webhook (Vapi) | `voice-ai/vapi-webhook.json` | Webhook | Receives Vapi call events. |
| Voice Webhook (Retell) | `voice-ai/retell-webhook.json` | Webhook | Receives Retell AI call events. |
| Voice Transcript Processor | `voice-ai/transcript-processor.json` | Execute Workflow | Parses transcripts, extracts intent, creates CRM follow-up tasks. |
| Voice Post-Call Actions | `voice-ai/post-call-actions.json` | Execute Workflow | Sends post-call summary via WhatsApp + email, updates CRM. |
| Voice Recording Archiver | `voice-ai/recording-archiver.json` | Schedule | Archives voice recordings to S3 with 90-day retention. |

### 2.6 CRM (A1)

| Workflow | File | Trigger | Description |
|----------|------|---------|-------------|
| Lead Capture (Web) | `crm/lead-capture-web.json` | Webhook | Captures leads from the marketing website. |
| Lead Capture (WhatsApp) | `crm/lead-capture-whatsapp.json` | Webhook | Captures leads from WhatsApp inquiries. |
| Distributor Onboarding | `crm/distributor-onboarding.json` | Webhook | Orchestrates distributor onboarding (KYC, agreement, welcome kit). |
| Customer Sync (Portal) | `crm/customer-sync.json` | Schedule | Syncs customer data from the distributor portal to the CRM. |
| Lifecycle Automations | `crm/lifecycle-automations.json` | Schedule | Trigger-based lifecycle events (dormant, re-engage, win-back). |

### 2.7 Leads (A1)

| Workflow | File | Trigger | Description |
|----------|------|---------|-------------|
| Lead Scoring | `leads/lead-scoring.json` | Webhook | AI-based lead scoring using RAG knowledge base. |
| Lead Assignment | `leads/lead-assignment.json` | Webhook | Round-robin assignment of leads to distributors. |
| Lead Follow-up Reminders | `leads/follow-up-reminders.json` | Schedule | Sends WhatsApp reminders for un-contacted leads. |
| Lead Conversion Trigger | `leads/conversion-trigger.json` | Webhook | Triggers downstream workflows when a lead converts. |

### 2.8 Notifications (A2)

| Workflow | File | Trigger | Description |
|----------|------|---------|-------------|
| Email Notification | `notifications/email.json` | Execute Workflow | Sends transactional emails via SendGrid. |
| WhatsApp Notification | `notifications/whatsapp.json` | Execute Workflow | Sends transactional WhatsApp messages. |
| Push Notification | `notifications/push.json` | Execute Workflow | Sends push notifications via FCM. |
| SMS Notification | `notifications/sms.json` | Execute Workflow | Sends SMS via MSG91 (India-only). |

### 2.9 Calendar (A2)

| Workflow | File | Trigger | Description |
|----------|------|---------|-------------|
| Meeting Booking | `calendar/meeting-booking.json` | Webhook | Books Google Calendar meetings with availability check. |
| Meeting Reminders | `calendar/meeting-reminders.json` | Schedule | Sends WhatsApp + email reminders 15 min before meetings. |
| Meeting Reschedule | `calendar/reschedule.json` | Webhook | Reschedules meetings with conflict detection. |

### 2.10 Payments (A2)

| Workflow | File | Trigger | Description |
|----------|------|---------|-------------|
| Payment Link Generator | `payments/payment-link.json` | Execute Workflow | Generates Razorpay payment links. |
| Refund Processor | `payments/refund.json` | Execute Workflow | Processes Razorpay refunds. |
| Payment Webhook Handler | `payments/webhook.json` | Webhook | Handles Razorpay payment events (paid, failed, refunded). |

### 2.11 Reports (A2)

| Workflow | File | Trigger | Description |
|----------|------|---------|-------------|
| Daily Business Report | `reports/daily.json` | Schedule (09:00 IST) | Sends daily sales/leads/tickets summary via email + Slack. |
| Weekly Business Report | `reports/weekly.json` | Schedule (Mon 09:00) | Sends weekly performance summary. |
| Monthly Business Report | `reports/monthly.json` | Schedule (1st 09:00) | Sends monthly executive summary. |

---

## 3. How to Import a Workflow

### 3.1 Via the n8n UI (recommended for first-time setup)

1. Log in to `https://n8n.dayjoy.ai`.
2. Click **Workflows** in the left sidebar.
3. Click **Import from File**.
4. Select the `.json` file from `automation/n8n/workflows/<category>/`.
5. Review the workflow — verify all credentials are bound.
6. Click **Save**.
7. (Optional) Click **Active** toggle to enable.

### 3.2 Via the n8n REST API (for CI/CD)

```bash
curl -X POST https://n8n.dayjoy.ai/api/v1/workflows \
  -H "Authorization: Basic $(echo -n "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" | base64)" \
  -H "Content-Type: application/json" \
  -d @automation/n8n/workflows/monitoring/health-check.json
```

### 3.3 Bulk import (all workflows at once)

```bash
# From the project root:
for f in automation/n8n/workflows/*/*.json; do
  echo "Importing $f..."
  curl -X POST https://n8n.dayjoy.ai/api/v1/workflows \
    -H "Authorization: Basic $(echo -n "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" | base64)" \
    -H "Content-Type: application/json" \
    -d @"$f"
done
```

### 3.4 Post-import checklist

- [ ] All credentials referenced by the workflow are present in n8n (Settings → Credentials).
- [ ] Workflow ID is unique (n8n assigns new IDs on import — no collision risk).
- [ ] Webhook paths (if any) do not collide with existing workflows.
- [ ] Schedule triggers use `Asia/Kolkata` timezone (set globally in n8n settings).
- [ ] Workflow appears in the **Workflows** list with the correct name + tags.
- [ ] Test the workflow once manually before activating.

---

## 4. How to Activate / Deactivate

### 4.1 Via the UI

1. Open the workflow in n8n.
2. Toggle the **Active** switch in the top-right.
3. The workflow now responds to its triggers (schedule, webhook, error trigger).

### 4.2 Via the API

```bash
# Activate
curl -X PATCH https://n8n.dayjoy.ai/api/v1/workflows/<workflow-id> \
  -H "Authorization: Basic $(echo -n "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" | base64)" \
  -H "Content-Type: application/json" \
  -d '{"active": true}'

# Deactivate
curl -X PATCH https://n8n.dayjoy.ai/api/v1/workflows/<workflow-id> \
  -H "Authorization: Basic $(echo -n "$N8N_ADMIN_USER:$N8N_ADMIN_PASSWORD" | base64)" \
  -H "Content-Type: application/json" \
  -d '{"active": false}'
```

### 4.3 Activation rules

- **Production workflows** must be activated by a Platform Lead (role check enforced in n8n user management).
- **Always test manually first** — click "Test workflow" before activating a newly imported workflow.
- **Deactivate before editing** a workflow that has scheduled/webhook triggers; reactivate after.
- The **Global Error Handler** must NEVER be deactivated — it is the safety net for all other workflows.

---

## 5. How to Test a Workflow

### 5.1 Manual test (UI)

1. Open the workflow.
2. Click **Test workflow** (top-right).
3. For webhook-triggered workflows: n8n prints a test URL — send a sample payload.
4. For schedule-triggered workflows: n8n fires immediately on test.
5. For Execute Workflow Trigger workflows: call them from a parent workflow's "Execute Workflow" node with test data.

### 5.2 Test payload examples

Sample error payload for testing `global-error-handler.json`:

```json
{
  "execution": {
    "id": "test-exec-001",
    "status": "error",
    "mode": "manual",
    "lastNodeExecuted": "HTTP Request",
    "error": {
      "message": "ETIMEDOUT",
      "code": "ETIMEDOUT",
      "stack": "..."
    }
  },
  "workflow": {
    "id": "test-wf-001",
    "name": "Test Workflow"
  }
}
```

Sample DLQ item for testing `dead-letter-processor.json`:

```json
{
  "id": "dlq-test-001",
  "workflow_id": "test-wf-001",
  "workflow_name": "Test Workflow",
  "payload": { "foo": "bar" },
  "error_message": "test error",
  "attempt_count": 1,
  "source_execution_id": "test-exec-001"
}
```

### 5.3 Test in staging

- Staging n8n instance: `https://n8n-staging.dayjoy.ai`
- All workflows MUST be tested in staging before promotion to production.
- Staging uses its own WhatsApp test number, SendGrid sandbox, and a separate Razorpay test key.

### 5.4 Validation criteria

A workflow is "production-ready" when:
- [ ] Manual test passes with realistic sample data.
- [ ] Error path tested (e.g., trigger the workflow with bad input → verify it lands in the DLQ).
- [ ] Credentials are bound and validated.
- [ ] The workflow appears on the metrics dashboard within 5 minutes of activation.
- [ ] A second engineer has reviewed the workflow.

---

## 6. Common Patterns

### 6.1 Webhook → AI → Response

Used by: WhatsApp Inbound Router, Voice Webhooks, Lead Capture.

```
Webhook → Verify Signature → Classify Intent → Call AI Service → Send Response → Log to Audit
```

### 6.2 Schedule → Collect → Aggregate → Push

Used by: Workflow Metrics Dashboard, Daily Business Report, DLQ Daily Report.

```
Schedule Trigger → Fetch Data (parallel HTTP requests) → Aggregate (Code node) → Push to Destination
```

### 6.3 Error Trigger → Classify → Route

Used by: Global Error Handler.

```
Error Trigger → Normalize → Classify → Switch by Category → (Retry | Notify Team | Page On-Call)
```

### 6.4 Execute Workflow → Reusable Sub-Workflow

Used by: Retry Strategy, Notification workflows.

```
Parent Workflow → Execute Workflow node (calls sub-workflow) → Sub-workflow returns { action, status, ... }
```

### 6.5 HMAC Verification on every public webhook

Used by: ALL inbound webhook workflows.

```
Webhook → Verify HMAC (Code node) → If invalid: 401 + log to audit → If valid: process
```

The reference implementation is in `security/webhook-signature-verification.json`.

### 6.6 Idempotency keys for write operations

Every workflow that writes to the backend (CRM, payments, notifications) sends an `Idempotency-Key` header so retries don't double-write.

```
HTTP Request → Header: Idempotency-Key: {{ $json.execution_id }}-{{ $json.node_name }}
```

---

## 7. Naming Conventions

- **Workflow name**: `Dayjoy — <Category> — <Specific Name>`
  - Example: `Dayjoy — Global Error Handler`
- **File name**: kebab-case, no `Dayjoy —` prefix
  - Example: `global-error-handler.json`
- **Tags**: lowercase, hyphenated
  - Standard tags: `error-handling`, `monitoring`, `security`, `whatsapp-ai`, `voice-ai`, `crm`, `leads`, `notifications`, `calendar`, `payments`, `reports`, `critical`, `production`, `reusable`, `reference`.
- **Node names**: human-readable, action-oriented
  - Example: `Send to Slack #ops-alerts` (not `HTTP Request3`)
- **Schedule triggers**: name them after the cadence
  - Example: `Every 5 Minutes`, `Daily at 09:00 IST`

---

## 8. Ownership Matrix

| Owner | Scope | Folders |
|-------|-------|---------|
| **A1 — Workflow Developer (External comms + CRM)** | WhatsApp, Voice, CRM, Leads | `workflows/whatsapp-ai/`, `workflows/voice-ai/`, `workflows/crm/`, `workflows/leads/` |
| **A2 — Workflow Developer (Internal + Reports)** | Notifications, Calendar, Payments, Reports | `workflows/notifications/`, `workflows/calendar/`, `workflows/payments/`, `workflows/reports/` |
| **A3 — Platform / DevOps (this agent)** | Error handling, Monitoring, Security, Deployment, Docs | `workflows/error-handling/`, `workflows/monitoring/`, `security/`, `deployment/`, `docs/` |

For cross-cutting changes (e.g., adding a new credential type that all workflows use), coordinate via the `#platform-n8n` Slack channel and update this README.

---

## See Also

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — How to deploy n8n from scratch.
- [OPERATIONS_GUIDE.md](./OPERATIONS_GUIDE.md) — Day-to-day operations.
- [MAINTENANCE_GUIDE.md](./MAINTENANCE_GUIDE.md) — Maintenance schedule.
- [security/security-checklist.md](../security/security-checklist.md) — Security checklist.
