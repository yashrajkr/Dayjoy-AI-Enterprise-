# Commercial SaaS Platform — Architecture

> Stage 2 Step 10 — Company registration, subscriptions, billing, usage
> metering, onboarding, customer success, and admin operations.

## 1. Overview

Transforms the platform into a commercial multi-tenant AI SaaS that can
onboard paying companies with automated provisioning, subscription
management, usage-based limits, and customer success tooling.

## 2. Subscription Plans

5 tiers seeded automatically via migration:

| Plan | Price/mo | AI Requests | Voice Min | WhatsApp | KB Storage | Users |
|---|---|---|---|---|---|---|
| Free | $0 | 100 | 0 | 10 | 50MB | 3 |
| Starter | $29 | 1,000 | 60 | 500 | 500MB | 10 |
| Professional | $99 | 10,000 | 500 | 5,000 | 5GB | 50 |
| Business | $299 | 50,000 | 2,000 | 25,000 | 25GB | 200 |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited |

## 3. Database (8 new tables)

| Table | Purpose |
|---|---|
| `subscription_plans` | Plan definitions with limits + features |
| `subscriptions` | Org's active subscription (trial/active/canceled) |
| `invoices` | Billing records with line items |
| `usage_records` | Daily usage metering per org |
| `onboarding_steps` | Guided onboarding progress |
| `support_tickets` | Customer support tickets |
| `feature_requests` | Feature requests with voting |
| `system_status` | Platform status page |

## 4. API Endpoints (19 REST)

### Registration + Plans
- `POST /saas/register` — Register new company (no auth)
- `GET /saas/plans` — List public plans

### Subscription
- `GET /saas/subscription` — Get org's subscription
- `POST /saas/subscription/upgrade` — Upgrade/downgrade
- `POST /saas/subscription/cancel` — Cancel

### Billing
- `GET /saas/invoices` — List invoices
- `GET /saas/invoices/{id}` — Get invoice

### Usage
- `GET /saas/usage` — Monthly usage summary with limits + percentages
- `POST /saas/usage/record` — Record usage (internal)

### Onboarding
- `GET /saas/onboarding` — Progress (10 steps)
- `POST /saas/onboarding/{step}/complete` — Complete step

### Customer Success
- `POST/GET /saas/tickets` — Support tickets
- `POST /saas/tickets/{id}/resolve` — Resolve ticket
- `POST/GET /saas/feature-requests` — Feature requests
- `POST /saas/feature-requests/{id}/vote` — Vote
- `GET /saas/system-status` — Platform status page

### Admin
- `GET /saas/admin/dashboard` — Platform metrics (super_admin)
- `GET /saas/admin/organizations` — List all orgs (super_admin)

## 5. Onboarding Flow (10 steps)

1. Create Workspace (auto-completed on registration)
2. Verify Email
3. Choose Plan
4. Upload Logo (optional)
5. Upload Knowledge Base
6. Configure AI
7. Configure Voice (optional)
8. Configure WhatsApp (optional)
9. Invite Team (optional)
10. Launch

## 6. Usage Metering

Daily `UsageRecord` per org tracking:
- AI: requests, tokens in/out, cost
- Voice: minutes, calls, cost
- WhatsApp: messages sent/received, cost
- Telephony: calls, minutes, cost
- Notifications: emails, SMS, push, cost
- Storage: knowledge MB, media MB
- API: calls per day
- Users: active users

Limits enforced via `check_usage_limit()` — returns False when exceeded.

## 7. Billing Architecture

- **Gateway-ready**: `payment_gateway`, `gateway_customer_id`, `gateway_subscription_id` fields
- **Invoice generation**: Automatic on plan upgrade
- **Line items**: Plan charge + overages + add-ons
- **Statuses**: draft → open → paid / void / uncollectible
- **Coupons**: `coupon_code` + `coupon_discount_percent`
- **Tax**: `tax_rate` + `tax_id` + `tax_cents`

To integrate Stripe/Razorpay:
1. Set `payment_gateway = "stripe"` on subscription
2. Create customer in Stripe → store `gateway_customer_id`
3. Create subscription in Stripe → store `gateway_subscription_id`
4. Webhook handler updates invoice status on payment events

## 8. Admin Dashboard

Platform-wide metrics:
- Total organizations
- Active/trial subscriptions
- Total users
- Revenue this month
- Open support tickets
- Plan distribution

## 9. Testing

25 tests covering:
- Company registration (success, duplicate slug, duplicate email, onboarding creation)
- Subscription plans (list, get by name)
- Subscription management (get, upgrade, cancel)
- Usage metering (record, accumulate, summary, limit check, limit blocked)
- Onboarding (complete step, progress)
- Support tickets (create, list, resolve)
- Feature requests (create, vote, list)
- Admin dashboard (metrics, organizations)
- System status (empty state)
