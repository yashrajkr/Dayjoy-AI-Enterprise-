# Agent Work Record — n8n Email + Calendar + Notification + Order + Support + AI Workflows

**Task ID:** n8n-agent-a2-email-calendar-notif
**Agent:** full-stack-developer
**Scope:** `automation/n8n/workflows/{email,calendar,notifications,orders,support,ai}/`
**Total workflows delivered:** 27 (6 email + 5 calendar + 4 notifications + 4 orders + 4 support + 4 AI)

## Coordination with Agent A1

Agent A1 (CRM/Sales/Lead) owns: `crm/`, `leads/`, `sales/`, plus the pre-existing `error-handling/` and `monitoring/` folders. This agent did NOT touch any of A1's directories. All 27 files below were created in the assigned scope only.

## Files Created

### Email Automation (6)
| File | Trigger | Purpose |
|---|---|---|
| `email/welcome-email.json` | `customer.created` / `distributor.created` | Sends personalized welcome email via SMTP with getting-started guide + Joy AI assistant intro. |
| `email/order-confirmation.json` | `order.created` | Fetches full order detail, sends rich confirmation email with items table, total, expected delivery, tracking link (when available). |
| `email/follow-up-email.json` | `order.delivered` | Waits 3 days (Wait node) → fetches latest order state → sends review-request email with product usage tips + AI support CTA. Skips if order no longer DELIVERED. |
| `email/reminder-email.json` | Daily 8 AM (cron `0 8 * * *`) | Fetches appts next 24h, sends reminder email to customer + employee with meeting link, agenda, location. |
| `email/password-reset.json` | `password.reset.requested` | Sends password reset email with 1-hour-expiry link + security tips. Filters on token+email presence. |
| `email/appointment-confirmation.json` | `appointment.created` | Builds a real `.ics` calendar invite in a Code node, sends via SMTP as attachment, with date/time/location/Meeting link in HTML body. |

### Calendar Automation (5)
| File | Trigger | Purpose |
|---|---|---|
| `calendar/appointment-booking.json` | `appointment.created` | Builds GCal event payload (24h email, 1h popup, 15m popup reminders + attendees), creates event in employee's calendar, persists external GCal event ID, dispatches confirmation notifications. |
| `calendar/appointment-reschedule.json` | `appointment.updated` | Detects datetime change (compares before/after), fetches external GCal ref, updates GCal event time, notifies all participants, dispatches updated invite, updates CRM interaction record. |
| `calendar/appointment-cancellation.json` | `appointment.cancelled` | Fetches external GCal ref, cancels (deletes) GCal event with `sendUpdates=true`, dispatches cancellation notification + reschedule offer, logs CRM interaction. |
| `calendar/calendar-sync.json` | Cron `*/15 * * * *` | Fetches DB appts changed in last 15m + GCal events next 30 days → computes diff (push to GCal, pull to DB, conflicts) → commits sync result to backend → logs sync status. |
| `calendar/appointment-reminders.json` | Cron `*/30 * * * *` | Determines reminder stage: T-24h (email + WhatsApp), T-1h (push + in-app), T-15m (push). Dispatches via backend multi-channel endpoint + marks appt as notified + audits. |

### Notification Automation (4)
| File | Trigger | Purpose |
|---|---|---|
| `notifications/multi-channel-dispatch.json` | `notification.queued` | Splits per channel, switch routes to: Email (SMTP) / SMS (Twilio) / WhatsApp (HTTP to Meta Graph API) / Push (FCM HTTP) / In-App (backend). All 5 branches merge → update delivery status. All actionable nodes retry 3×. |
| `notifications/daily-digest.json` | Daily 8 AM | Fetches unread notifications per user → groups by category → composes HTML digest (top-5 per category + "+N more") → sends via SMTP → marks notifications as digested. |
| `notifications/escalation.json` | `notification.failed` | Confirms 3 retries exhausted (skips below threshold) → fetches tenant managers → expands per-manager → sends Email + SMS (Twilio) + Push (FCM) alerts in parallel → audit log + creates monitoring alert. |
| `notifications/broadcast.json` | Manual admin webhook | Validates audience (ALL_CUSTOMERS / ALL_DISTRIBUTORS / ALL_EMPLOYEES / SEGMENT) + channels (EMAIL / WHATSAPP / PUSH / IN_APP) → resolves audience → splits per recipient → expands per channel → dispatches → tracks delivery → audits. |

### Order Automation (4)
| File | Trigger | Purpose |
|---|---|---|
| `orders/order-created.json` | `order.created` | Fetches full order → dispatches confirmation (Email + WhatsApp) → if distributor assigned, notifies them → creates AI memory "Customer X placed order Y" → tracks analytics event. |
| `orders/payment-success.json` | `order.payment_status=PAID` | Filters on PAID status → generates invoice → emails invoice → updates order status to CONFIRMED → notifies warehouse for fulfillment → calculates distributor commission. |
| `orders/shipping-update.json` | `shipment.created` / `shipment.status_changed` | Updates order to SHIPPED → fetches order + customer → dispatches shipping notification (Email + WhatsApp) with tracking # → creates AI memory (shipment_status) → schedules delivery follow-up (3d). |
| `orders/delivery-confirmation.json` | `order.status=DELIVERED` | Filters on DELIVERED → dispatches delivery confirmation → dispatches CSAT feedback request → schedules review follow-up (3d) → updates customer LTV → pays distributor commission → creates AI memory. |

### Support Automation (4)
| File | Trigger | Purpose |
|---|---|---|
| `support/ticket-creation.json` | `ticket.created` | Auto-assigns by category+workload → sends customer confirmation (ticket #) → notifies assigned employee → starts SLA timer → AI suggests 3 KB articles → saves suggestions on ticket. |
| `support/ticket-assignment.json` | `ticket.assigned` | Fetches ticket+context → notifies new assignee → sends context (customer history, related orders) → resets SLA timer → if reassignment, notifies previous assignee. |
| `support/ticket-escalation.json` | Cron `*/30 * * * *` | Computes hours-to-breach per active ticket → stages: APPROACHING (≤2h, notify assignee+manager), BREACHED (escalate to senior + mark urgent), OVERDUE_24H (notify director) → escalates + dispatches notifications. |
| `support/ticket-auto-close.json` | Daily midnight | Fetches tickets RESOLVED >7 days → evaluates (resolved ≥7d AND no customer response in that window) → auto-closes (status=CLOSED) → sends closure notification + CSAT request → tracks analytics. |

### AI Automation (4)
| File | Trigger | Purpose |
|---|---|---|
| `ai/knowledge-update-trigger.json` | `knowledge.document_created` | Preps document info → waits for `document.ready` webhook resume → verifies READY status → notifies knowledge admins → refreshes AI agents' knowledge → creates tenant-scoped AI memory "Knowledge base updated with [document]". |
| `ai/embedding-regeneration.json` | Weekly Sunday 2 AM (`0 2 * * 0`) | Fetches documents older than 90 days → per document: regenerate embeddings → update vector store → aggregates stats (total/success/failed) → logs audit. |
| `ai/memory-cleanup.json` | Daily 3 AM (`0 3 * * *`) | Deletes expired memories (expiresAt < NOW) → archives conversation summaries older than 90 days to cold storage → aggregates stats → audits + reports monitoring metrics. |
| `ai/conversation-summarization.json` | `conversation.ended` | Preps conversation → waits 5 minutes (confirm truly ended) → fetches messages → calls AI summarize endpoint → saves AiMemory SUMMARY → splits per fact/preference → saves each as AiMemory FACT/PREFERENCE → updates customer profile if new info found. |

## Architecture Patterns

Every workflow follows these patterns (production-ready):

1. **Triggers**
   - Event-driven workflows use `n8n-nodes-base.webhook` (POST, `responseMode: onReceived`)
   - Scheduled workflows use `n8n-nodes-base.scheduleTrigger` with cron expressions

2. **Credentials**
   - `dayjoyApi` (httpHeaderAuth) — all backend API calls
   - `smtp` — all outbound emails (fromEmail domain: `@dayjoy.in`)
   - `googleCalendarOAuth2Api` (named `googleCalendar`) — calendar operations
   - `twilioApi` — SMS in escalation workflow
   - FCM + WhatsApp use HTTP Request with env-based bearer tokens (no credential objects)

3. **Retry & Error Handling**
   - Every actionable node (HTTPRequest / emailSend / googleCalendar / twilio) has `retryOnFail: true`, `maxTries: 3`, `waitBetweenTries: 3000-10000ms`
   - Every workflow ends with an audit-log HTTP POST to `/api/notifications/audit` capturing channel/event/entityId/status/tenantId/metadata
   - Filter / Code nodes validate inputs and emit `{skip:true, reason}` items for graceful no-ops via Switch fallback

4. **Connections**
   - Every connection source/target resolves to a real node name (validated by script)
   - Switch nodes use `fallbackOutput` for skip-branches
   - Merge node in `multi-channel-dispatch` combines all 5 channel branches

5. **Backend API Endpoints Used** (all relative to `$env.DAYJOY_API_BASE_URL`)
   - `/api/notifications/{dispatch, dispatch-multi, audit, in-app, digest-queue, mark-digested, broadcast/<id>/delivery}`
   - `/api/orders/{id, status, sla/*, sync-since}`
   - `/api/appointments/{upcoming, id, id/external-ref, id/mark-notified, sync-result}`
   - `/api/tickets/{id, id/auto-assign, id/sla/{start,reset}, id/status, id/suggestions, id/escalate, sla-monitor}`
   - `/api/knowledge/{documents, documents/<id>, documents/stale, documents/<id>/regenerate-embeddings, documents/<id>/update-vector-store}`
   - `/api/ai/{memory, summarize, suggest-articles, conversations/<id>/messages, agents/refresh-knowledge}`
   - `/api/invoices/generate`, `/api/warehouse/fulfillment-requests`, `/api/commissions/{calculate, pay}`
   - `/api/customers/<id>/{ltv, profile/auto-update}`
   - `/api/crm/interactions`, `/api/audiences/resolve`
   - `/api/analytics/track`, `/api/audit/logs`, `/api/monitoring/{alerts, metrics}`
   - `/api/users/managers`

6. **Templates / Subjects**
   - Emails use Dayjoy brand styling (`#ea580c` primary, `#fff7ed` bg, `#ffedd5` accent, `#9a3412` headings)
   - Footer: "Dayjoy Wellness Pvt. Ltd. · {email}"
   - All HTML built in `Code` nodes (no external template engine dependency)

## Validation

Ran three validation passes on all 27 files:
1. `python3 -c "import json; json.load(open(f))"` — all parse as valid JSON
2. Structural check: `name`, `nodes` (list), `connections`, `settings`, `active` — all present
3. Connection integrity: every connection source + target resolves to a defined node; every actionable node has `retryOnFail=true` + `maxTries>=3`

All 27 workflows pass all three checks.

## Notes for Downstream Agents

- Workflow files reference `$env.DAYJOY_API_BASE_URL`, `$env.TWILIO_FROM_NUMBER`, `$env.WHATSAPP_ACCESS_TOKEN`, `$env.WHATSAPP_PHONE_NUMBER_ID`, `$env.WHATSAPP_API_URL`, `$env.FCM_SERVER_KEY`, `$env.FCM_API_URL`, `$env.DAYJOY_WEB_BASE_URL`. These should be set in the n8n environment.
- Credential IDs (`smtp-cred-id`, `dayjoyApi`, `googleCalendar`, `twilio-cred-id`) are placeholders — when imported into a real n8n instance, the operator must map them to actual credentials.
- Webhook paths are unique per workflow (e.g. `email/welcome`, `orders/order-created`) — backend event bus must POST events to `https://n8n.example.com/webhook/<path>` with body `{event, data, tenantId}`.
- The `Wait` node in `follow-up-email`, `appointment-booking` (no, that's not Wait-based), `knowledge-update-trigger` (webhook-resume), `conversation-summarization` requires n8n's execution-data retention to be enabled.
