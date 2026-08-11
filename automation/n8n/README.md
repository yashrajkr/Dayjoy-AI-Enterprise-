# Dayjoy AI Enterprise — n8n Automation

> Scope owner: **Agent A1 — CRM / Sales / Leads**.
> Other agents (email, calendar, notifications, orders, support, AI) ship the
> remaining workflow folders. See "Workflow Categories" below.

## Overview

n8n workflows for automating CRM, sales, leads, email, calendar, notifications,
orders, support, and AI processes across the Dayjoy AI Enterprise Platform.

Every workflow in this folder:

- Triggers off a Dayjoy backend event (webhook) or a schedule
- Calls the Dayjoy backend REST API (`/api/...`) using the `dayjoyApi`
  HTTP Header Auth credential
- Verifies webhook authenticity with HMAC-SHA256 signatures
- Includes retry logic (3 attempts, exponential backoff)
- Routes failures to a shared **Error Trigger → Slack/Email alert** pattern

## Prerequisites

- n8n self-hosted (Docker) **v1.30+** or n8n Cloud
- Dayjoy backend API reachable from n8n (default: `https://api.dayjoy.ai`)
- Dayjoy service account JWT (long-lived, scoped to `automation` role)
- SMTP credentials (for email-based alerting)
- Google Calendar API credentials (for calendar workflows — other agent)
- WhatsApp Business API credentials (for WhatsApp touchpoints)

## Setup

### 1. Deploy n8n

The canonical n8n deployment ships in `deployment/` (root of the repo).
Minimum compose snippet:

```yaml
services:
  n8n:
    image: n8nio/n8n:latest
    environment:
      N8N_HOST: n8n.dayjoy.ai
      N8N_PROTOCOL: https
      WEBHOOK_URL: https://n8n.dayjoy.ai
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      EXECUTIONS_DATA_PRUNE: "true"
      EXECUTIONS_DATA_MAX_AGE: "168"
      N8N_METRICS: "true"
    volumes:
      - n8n_data:/home/node/.n8n
    ports:
      - "5679:5678"
volumes:
  n8n_data:
```

### 2. Import credentials

Import `shared/credentials.json` via **n8n UI → Settings → Credentials →
Import from File**. After import, populate each credential's secret values
(JWT, SMTP password, WhatsApp token, etc.) — the JSON only ships the
**shape**, never the secrets.

### 3. Import workflows

For each workflow JSON in `workflows/<category>/`:

1. n8n UI → **Workflows → Import from File**
2. Open the imported workflow
3. Verify each node references the correct credential (`dayjoyApi` etc.)
4. Click **Active** to enable

### 4. Configure environment variables

Set these in the n8n container environment (or `.env`):

| Variable | Example | Used by |
|---|---|---|
| `DAYJOY_API_BASE_URL` | `https://api.dayjoy.ai` | All HTTP Request nodes |
| `DAYJOY_WEBHOOK_SECRET` | `<32-byte hex>` | Webhook HMAC verification |
| `DAYJOY_AUTOMATION_JWT` | `eyJ...` | `dayjoyApi` credential value |
| `N8N_ENCRYPTION_KEY` | `<32-byte hex>` | n8n secret storage |
| `SLACK_ALERT_WEBHOOK` | `https://hooks.slack.com/...` | Error alerts |

### 5. Activate workflows

Workflows default to `active: false` on import. Toggle each one on after
credentials are populated. n8n will start listening on the configured
webhook paths and cron schedules immediately.

## Workflow Categories

| Category | Folder | Count | Owner |
|---|---|---|---|
| CRM | `workflows/crm/` | 5 | **Agent A1** (this repo) |
| Sales | `workflows/sales/` | 3 | **Agent A1** (this repo) |
| Leads | `workflows/leads/` | 4 | **Agent A1** (this repo) |
| Email | `workflows/email/` | 6 | Email agent |
| Calendar | `workflows/calendar/` | 5 | Calendar agent |
| Notifications | `workflows/notifications/` | 4 | Notifications agent |
| Orders | `workflows/orders/` | 4 | Orders agent |
| Support | `workflows/support/` | 4 | Support agent |
| AI | `workflows/ai/` | 4 | AI agent |
| Error handling | `workflows/error-handling/` | shared | All agents |
| Monitoring | `workflows/monitoring/` | shared | All agents |

## Workflows shipped by this agent (Agent A1)

### Leads (`workflows/leads/`)
1. **`lead-capture.json`** — `lead.created` → create CRM record → assign → welcome + assignment notifications → schedule follow-up → AI score
2. **`lead-assignment.json`** — Territory / language / workload / after-hours routing with round-robin
3. **`lead-scoring.json`** — AI scoring on create/update → HOT (notify), WARM (follow-up in 2d), COLD (nurture)
4. **`follow-up-scheduling.json`** — Cadence: 2d → 3d → 5d, mark LOST + notify manager if unresponsive

### CRM (`workflows/crm/`)
1. **`customer-creation.json`** — `customer.created` → welcome email + WhatsApp → AI memory → distributor assign → analytics
2. **`distributor-updates.json`** — `distributor.updated` → tier change / commission rate / termination routing
3. **`employee-notifications.json`** — CRM events → role-based routing → in-app + email (HIGH priority)
4. **`crm-sync.json`** — Daily 02:00 sync → LTV recalculation → distributor metrics → daily summary report
5. **`customer-enrichment.json`** — `customer.created` → AI enrichment (type, potential value, recommended products)

### Sales (`workflows/sales/`)
1. **`sales-dashboard-sync.json`** — Order events → real-time metrics → WebSocket push → distributor totals
2. **`revenue-recognition.json`** — Daily 00:00 → recognize revenue on delivered orders → commission calc → daily report
3. **`sales-forecast.json`** — Weekly Monday 06:00 → 12-month data → AI forecast → save + notify team

## API Authentication

All Dayjoy backend HTTP requests use the **`dayjoyApi`** credential — n8n
HTTP Header Auth:

| Field | Value |
|---|---|
| Credential type | `httpHeaderAuth` |
| Name | `dayjoyApi` |
| Header name | `Authorization` |
| Header value | `Bearer <DAYJOY_AUTOMATION_JWT>` |

The automation JWT is minted by the backend's `POST /api/auth/service-token`
endpoint (scoped to `automation` role, 90-day expiry, rotation tracked in
audit log).

## Webhook Security

Dayjoy backend signs every outbound webhook payload with HMAC-SHA256 using
the shared `DAYJOY_WEBHOOK_SECRET`. Each workflow verifies the signature
inside a **Code node** before processing — see
[`shared/webhook-auth.md`](shared/webhook-auth.md) for the canonical
verification pattern and the n8n Code node snippet that all webhook
workflows embed.

Signature headers sent by the backend:

```
X-Dayjoy-Signature: sha256=<hex digest>
X-Dayjoy-Timestamp: <unix seconds>
X-Dayjoy-Event:     lead.created | customer.created | ...
```

## Error Handling & Retries

Every HTTP Request node in these workflows is configured with:

- **Retry on Fail**: enabled
- **Max Tries**: 3
- **Retry Interval**: 1000ms (n8n applies exponential backoff: 1s → 2s → 4s)
- **Response Code**: fail on `>= 400`

A shared **Error Trigger** workflow (`workflows/error-handling/global-error-alert.json`,
shipped by the error-handling agent) catches any unhandled node failure and
posts to the `#dayjoy-automation-alerts` Slack channel + sends an email to
`ops-alerts@dayjoy.ai`.

For workflow-local error branches (e.g., a non-recoverable 4xx), each
workflow includes an explicit `OnError` output that:

1. Logs the failure to `POST /api/audit-log` (event: `automation.failed`)
2. Sends a notification to the automation owner via `POST /api/notifications/send`

## Naming Conventions

- Workflow files: `<category>-<verb>.json` (e.g., `lead-capture.json`)
- Workflow names (inside JSON): `<Category> — <Verb Phrase>` (e.g., `Leads — Capture & Onboard`)
- Node names: `<Action> <Resource>` (e.g., `Create Lead in CRM`)
- Credential reference: always `dayjoyApi` for backend, `dayjoySmtp` for email,
  `dayjoyWhatsApp` for WhatsApp, `dayjoySlack` for Slack alerts

## Testing Workflows Locally

1. Set `DAYJOY_API_BASE_URL=http://host.docker.internal:3000` (NestJS dev port)
2. Import the workflow
3. Click **Execute Workflow** with a sample payload from `shared/sample-payloads/`
   (if present) or paste a real webhook payload into the Webhook node's
   "Test URL" panel
4. Verify each HTTP Request returns 2xx
5. Inspect the executed JSON for downstream node inputs

## Idempotency

All webhook-triggered workflows are idempotent:

- The backend includes an `eventId` (UUID) in every webhook payload
- Each workflow's first action after signature verification is to call
  `POST /api/automation/event-dedup` with `{ eventId }` — the backend returns
  `201` on first sight and `409` on duplicates
- On `409`, the workflow exits silently (no reprocessing)

## Contributing

When adding a new workflow:

1. Place it in the correct `workflows/<category>/` folder
2. Name the file `<category>-<verb>.json`
3. Use `dayjoyApi` for all Dayjoy API calls
4. Embed the HMAC verification Code node (see `shared/webhook-auth.md`)
5. Add a brief description in this README under "Workflows shipped"
6. Validate JSON: `jq . <file>.json > /dev/null`
7. Append a worklog entry under `## Worklog` in this README

## Worklog

- 2025-01-15 — Agent A1 shipped 12 workflows (4 leads, 5 CRM, 3 sales) +
  credentials.json + webhook-auth.md + this README.
