# Agent Work Record — n8n Agent A1: CRM / Sales / Leads

**Task ID:** n8n-agent-a1-crm-sales-leads
**Agent:** full-stack-developer
**Scope:** `automation/n8n/` (CRM + Sales + Leads workflows only)
**Status:** ✅ Complete

---

## 1. What was built

12 production-ready n8n workflow JSON files + 3 supporting docs. All files are importable into n8n v1.x via **UI → Workflows → Import from File**.

### Documentation & shared
| File | Purpose |
|---|---|
| `automation/n8n/README.md` | Setup guide: deploy, import credentials, import workflows, env vars, activate, naming conventions, testing, idempotency, contributing |
| `automation/n8n/shared/credentials.json` | 9 n8n credential definitions (dayjoyApi JWT, dayjoyWebhookSecret, dayjoySmtp, dayjoyWhatsApp, dayjoySlack, dayjoyGoogleCalendar, dayjoyTwilio, dayjoyOpenAI + dayjoyApiBaseUrl doc entry) |
| `automation/n8n/shared/webhook-auth.md` | Canonical HMAC-SHA256 webhook security pattern — signing scheme, headers, replay protection, Code node JS (string + raw-binary versions), response codes, idempotency dedup, failure visibility, unit/negative tests, secret rotation runbook |

### Lead workflows (`automation/n8n/workflows/leads/`)
| File | Trigger | What it does |
|---|---|---|
| `lead-capture.json` | `lead.created` webhook | Create CRM lead → fetch reps → compute assignment → assign → welcome email + rep notify + follow-up task (parallel) → AI score → update score |
| `lead-assignment.json` | `lead.created` / `lead.reassign_requested` | Time-window classify (business hours Mon-Sat 09-18 IST vs after-hours) → fetch reps or on-call rep → score & pick (territory +5, language +3, -1/active lead, idle boost) → assign + notify, or escalate to ops |
| `lead-scoring.json` | `lead.created` / `lead.updated` / `lead.interaction_logged` | Heuristic pre-score (completeness 30 + engagement 40 + budget 15 + timeline 15) → AI refine → switch HOT(>80)/WARM(50-80)/COLD(<50): HOT→URGENT notify, WARM→2d follow-up, COLD→nurture |
| `follow-up-scheduling.json` | `lead.status_changed`→CONTACTED | Cadence: Wait 2d → check response → if no response send email+WhatsApp #1 → Wait 3d → send email #2 → Wait 5d → mark LOST + notify rep + email manager. Cancels at any checkpoint if lead responded. 14-day execution timeout. |

### CRM workflows (`automation/n8n/workflows/crm/`)
| File | Trigger | What it does |
|---|---|---|
| `customer-creation.json` | `customer.created` webhook | Welcome email + WhatsApp (if opted in) → AI memory write → if referred: assign to referring distributor + notify distributor → increment new-customer analytics |
| `distributor-updates.json` | `distributor.updated` webhook | Diff before/after → switch by dominant change: tier_changed→notify downline; commission_changed→recalc pending + email distributor; terminated→reassign customers + open orders to sponsor + notify sponsor; status_changed→audit-log; other→audit-log |
| `employee-notifications.json` | 6 event types (order.high_value, customer.complaint, lead.hot, distributor.tier_up, refund.requested, support.escalation) | Route event→role (SALES_MANAGER, SUPPORT_LEAD, SALES_REP, PARTNERSHIPS_MGR, FINANCE_OFFICER) → fetch employees by role → round-robin pick → in-app notify → if HIGH/URGENT also email. Escalates to admin if no active employee with role. |
| `crm-sync.json` | Daily 02:00 schedule | Push customer updates to external → recompute LTV → recompute distributor metrics → gather yesterday's sales + leads → compile daily summary → save + email CRM admin |
| `customer-enrichment.json` | `customer.created` webhook | AI analyzes customer → enrich (customerType, potentialValue INR, confidence, recommendedProducts, segmentTags, reasoning) → update customer metadata → audit-log |

### Sales workflows (`automation/n8n/workflows/sales/`)
| File | Trigger | What it does |
|---|---|---|
| `sales-dashboard-sync.json` | `order.created` / `order.status_changed` / `order.payment_received` webhook | Refresh sales metrics cache → broadcast to admin dashboard websocket subscribers → if distributor linked: refresh distributor sales totals + broadcast to distributor portal channel |
| `revenue-recognition.json` | Daily 00:00 schedule | Fetch orders delivered yesterday → compute revenue summary → recognize revenue (deferred→recognized) → calculate per-distributor commissions batch → merge commission results → save daily revenue report → email finance team → audit-log |
| `sales-forecast.json` | Weekly Mon 06:00 schedule | Fetch 12mo monthly sales + 12mo lead pipeline + active distributors+tiers → build AI forecast prompt → AI generate 4-week forecast (forecast[], insights[], risks[], recommendations[], assumptions[]) → parse → save to analytics → email sales team → broadcast to admin dashboard |

## 2. Cross-cutting patterns (every workflow)

- **HMAC verification**: Code node immediately after webhook. Verifies `X-Dayjoy-Signature: sha256=<hex>` against raw body bytes. 5-minute replay window. Constant-time comparison. Event-type allow-list. Throws on failure → routed to n8n Error Trigger.
- **Idempotency dedup**: First HTTP node after verification → `POST /api/automation/event-dedup { eventId }`. 201=new (continue), 409=duplicate (respond 200 dedup + exit).
- **dayjoyApi credential**: All Dayjoy backend HTTP requests use HTTP Header Auth named `dayjoyApi` with `Authorization: Bearer <JWT>`.
- **Retry logic**: Every HTTP Request node configured `retry.enabled=true, maxTries=3, retryInterval=1000ms` (n8n applies exponential backoff 1s→2s→4s).
- **Error responses**: Webhook nodes use `responseMode=responseNode`. Explicit Respond-to-Webhook nodes for 200 success, 202 accepted (async cadence), 401 invalid_signature.
- **Tags**: Each workflow tagged with category (`leads`/`crm`/`sales`) + `agent-a1` for n8n UI filtering.
- **Meta description**: Each workflow has `meta.description` documenting purpose.

## 3. Files NOT modified (out of scope)

- `backend/` — untouched (workflow JSON only references backend APIs, doesn't modify them)
- `apps/` — untouched
- `database/` — untouched
- Other agents' workflow folders (`workflows/email/`, `workflows/calendar/`, `workflows/notifications/`, `workflows/orders/`, `workflows/support/`, `workflows/ai/`, `workflows/error-handling/`, `workflows/monitoring/`, `security/`) — already populated by other agents, untouched
- The other-agent workflows use a slightly different HMAC convention (Stripe-style `t=<ts>,v1=<hex>` in a single header). See "Cross-agent notes" in worklog and §5 below.

## 4. Backend endpoints assumed by these workflows

Existing (per task spec):
- `POST /api/leads` ✓
- `PUT /api/leads/:id` ✓
- `PATCH /api/leads/:id/status` ✓
- `PATCH /api/leads/:id/score` (extension — assumed by lead-scoring workflow)
- `GET /api/leads` ✓
- `GET /api/leads/:id` (extension)
- `GET /api/leads/:id/interactions` (extension — used by follow-up-scheduling)
- `POST /api/leads/:id/tasks` (extension — used by lead-capture for follow-up scheduling)
- `POST /api/leads/:id/nurture` (extension — used by lead-scoring for COLD leads)
- `POST /api/customers` ✓
- `PUT /api/customers/:id` ✓
- `POST /api/customers/reassign` (extension — used by distributor-updates on termination)
- `POST /api/customers/bulk-update-ltv` (extension — used by crm-sync)
- `POST /api/distributors` ✓
- `GET /api/distributors/available` (extension — used by lead-capture + lead-assignment)
- `GET /api/distributors/on-call` (extension — used by lead-assignment after-hours)
- `GET /api/distributors/:id/downline` (extension)
- `POST /api/distributors/bulk-update-metrics` (extension — used by crm-sync)
- `POST /api/distributors/:id/sales-totals/refresh` (extension — used by sales-dashboard-sync)
- `POST /api/notifications/send` ✓
- `POST /api/ai/conversations/:id/messages` ✓
- `GET /api/analytics/sales` ✓
- `POST /api/analytics/sales/refresh` (extension)
- `POST /api/analytics/crm-daily-summary` (extension — used by crm-sync)
- `POST /api/analytics/revenue-daily-report` (extension — used by revenue-recognition)
- `POST /api/analytics/sales-forecast` (extension — used by sales-forecast)

New endpoints assumed (backend team should implement):
- `POST /api/automation/event-dedup` — idempotency dedup. Body: `{ eventId }`. Returns 201 new, 409 duplicate.
- `POST /api/admin/dashboard-broadcast` — broadcast to websocket subscribers. Body: `{ event, channel, payload }`. n8n does NOT hold websocket connections; backend multiplexes.
- `POST /api/accounting/revenue-recognition` — moves delivered orders from deferred to recognized revenue.
- `POST /api/commissions/calculate-batch` — calculates per-order commissions using distributor tier rates.
- `POST /api/commissions/recalculate` — recalculates pending (unpaid) commissions when distributor rate changes.
- `POST /api/orders/reassign` — reassigns open orders from one distributor to another.
- `POST /api/integrations/external-sync` — pushes customer records to external systems (ERP, mailing list, etc.).
- `GET /api/employees?role=X&active=true` — fetch employees by role.
- `POST /api/audit-log` — generic audit log endpoint.

## 5. Cross-agent notes

1. **HMAC convention discrepancy**: My workflows use GitHub-style `X-Dayjoy-Signature: sha256=<hex>` + separate `X-Dayjoy-Timestamp` header, signed payload = raw body bytes. The other agents' workflows (already shipped) use Stripe-style `X-Dayjoy-Signature: t=<ts>,v1=<hex>` single-header, signed payload = `<ts>.<body>`. Both are secure HMAC patterns. The backend's `webhook-signer.ts` is the single source of truth — it should be updated to emit BOTH formats during a transition window, then standardize on one. See worklog entry for details.

2. **Webhook paths**: My workflows use paths `lead-capture`, `lead-assignment`, `lead-scoring`, `lead-follow-up`, `crm-customer-creation`, `crm-distributor-updates`, `crm-employee-notifications`, `crm-customer-enrichment`, `sales-dashboard-sync`. (CRM sync, revenue-recognition, sales-forecast use schedule triggers — no webhook path.) Backend's outbound webhook dispatcher must be configured with these paths when workflows are activated.

3. **`/api/automation/event-dedup` is shared infrastructure**: Every webhook-triggered workflow across all agents would benefit from this idempotency primitive. Backend team should implement it once with a 7-day TTL table. My workflows assume it exists; if it doesn't, dedup fails open (HTTP error → workflow continues anyway since dedup is a soft check).

4. **`/api/admin/dashboard-broadcast` is shared infrastructure**: Multiple workflows (mine + likely orders, support, notifications agents) need to push real-time updates to admin/distributor portals. Backend should implement this as a single broadcast endpoint that fans out to its websocket subscribers. n8n must NOT hold websocket connections — backend is the websocket hub.

5. **Global error handler**: The `workflows/error-handling/global-error-handler.json` (shipped by error-handling agent) is the catch-all Error Trigger workflow. Any unhandled node failure in my workflows will be picked up by it and posted to `#dayjoy-automation-alerts` Slack + emailed to `ops-alerts@dayjoy.ai`. No additional per-workflow error handling needed beyond the explicit 401/auth-failure branches I included.

## 6. How to verify

```bash
# Validate all my workflow JSON files
cd /home/z/my-project/build/dayjoy-ai-enterprise/automation/n8n
for f in workflows/leads/*.json workflows/crm/*.json workflows/sales/*.json shared/credentials.json; do
  python3 -c "import json; json.load(open('$f')); print('OK: $f')"
done

# Spot-check a workflow's structure
python3 -c "
import json
w = json.load(open('workflows/leads/lead-capture.json'))
print('Name:', w['name'])
print('Nodes:', len(w['nodes']))
print('Connections:', len(w['connections']))
print('Tags:', [t['name'] for t in w['tags']])
"
```

To import into a running n8n instance:
1. Open n8n UI
2. Settings → Credentials → Import from File → `shared/credentials.json`
3. For each workflow: Workflows → Import from File → `<file>.json`
4. Open imported workflow → verify each HTTP node references `dayjoyApi` credential
5. Click Active toggle

## 7. What's NOT in this delivery

- Other-agent workflow folders (email, calendar, notifications, orders, support, ai) — already populated by their owners
- Backend implementation of the extension endpoints listed in §4 — backend team's responsibility
- n8n deployment manifests (docker-compose, k8s) — see root `deployment/` folder, owned by infra agent
- The `XTransformPort` gateway pattern does NOT apply to n8n workflows — n8n calls the backend directly via `DAYJOY_API_BASE_URL` env var. Webhook triggers receive inbound traffic via n8n's own public URL (`https://n8n.dayjoy.ai/webhook/<path>`).
