# Enterprise WhatsApp AI Platform — Architecture

> Stage 2 Step 5 — Production-grade WhatsApp Business AI platform with Meta
> Cloud API, multi-tenant accounts, RAG-powered conversations, and human handoff.

## 1. Overview

The WhatsApp AI platform connects customer WhatsApp messages to the AI Provider
Layer (Stage 2 Step 1) and RAG system (Stage 2 Step 2):

```
Customer → WhatsApp → Meta Cloud API → Webhook → Conversation Manager
  → AI Gateway → RAG → Response Generator → WhatsApp Reply
```

### Key properties

| Property | Implementation |
|---|---|
| **Multi-tenancy** | Each tenant has its own WhatsAppAccount, numbers, sessions, messages |
| **Meta Cloud API** | Full implementation: messages, media, templates, webhooks |
| **Webhook security** | HMAC-SHA256 signature verification (X-Hub-Signature-256) |
| **AI integration** | Uses existing AI Gateway (Stage 2 Step 1) + RAG (Stage 2 Step 2) |
| **Human handoff** | Automatic escalation on low confidence + manual handoff |
| **Message types** | Text, image, video, audio, document, location, contacts, interactive, templates |
| **Session management** | 24-hour conversation windows per customer |
| **Analytics** | Conversations, messages, AI resolution, delivery, handoffs |

## 2. Database schema (9 tables)

| Table | Purpose |
|---|---|
| `whatsapp_accounts` | Meta Business Account credentials per tenant |
| `whatsapp_numbers` | Phone numbers linked to accounts |
| `whatsapp_sessions` | Conversations (24h window per customer) |
| `wa_messages` | All messages (inbound + outbound, all types) |
| `whatsapp_media` | Uploaded/downloaded media metadata |
| `whatsapp_templates` | Meta-approved message templates |
| `whatsapp_analytics` | Daily aggregate metrics |
| `whatsapp_webhooks` | Inbound webhook audit trail |
| `whatsapp_handoffs` | Human handoff requests + status |

## 3. API endpoints (21 REST + 2 webhook)

### Accounts
- `POST /whatsapp/accounts` — Connect account
- `GET /whatsapp/accounts` — List accounts
- `GET/PATCH/DELETE /whatsapp/accounts/{id}` — Account CRUD

### Numbers
- `POST /whatsapp/numbers` — Register number
- `GET /whatsapp/numbers` — List numbers

### Sessions + Messages
- `GET /whatsapp/sessions` — List conversations
- `GET /whatsapp/sessions/{id}` — Get session
- `POST /whatsapp/sessions/{id}/end` — End session
- `GET /whatsapp/sessions/{id}/messages` — Get messages
- `POST /whatsapp/messages` — Send message

### Templates
- `POST /whatsapp/templates` — Create template
- `GET /whatsapp/templates` — List templates
- `DELETE /whatsapp/templates/{id}` — Delete template

### Handoffs
- `GET /whatsapp/handoffs` — List handoffs
- `POST /whatsapp/handoffs` — Initiate handoff
- `POST /whatsapp/handoffs/{id}/assign` — Assign handoff
- `POST /whatsapp/handoffs/{id}/resolve` — Resolve handoff

### Analytics + Config
- `GET /whatsapp/analytics/summary` — Aggregate analytics
- `GET /whatsapp/config` — Public config

### Webhooks (no auth — signature-verified)
- `GET /whatsapp/webhook` — Verification challenge
- `POST /whatsapp/webhook` — Inbound messages + status updates

## 4. UI screens (7 pages)

| Page | Path |
|---|---|
| Dashboard | `/whatsapp` |
| Accounts | `/whatsapp/accounts` |
| Conversations | `/whatsapp/conversations` |
| Conversation Detail | `/whatsapp/conversations/[id]` |
| Templates | `/whatsapp/templates` |
| Handoffs | `/whatsapp/handoffs` |
| Settings | `/whatsapp/settings` |

## 5. Meta WhatsApp Cloud API setup

### Step 1: Create a Meta Developer account

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Sign up / log in with your Facebook account
3. Verify your account (phone + email)

### Step 2: Create a WhatsApp Business App

1. Click **Create App**
2. Select **Business** as the app type
3. Enter your app name + contact email
4. Once created, add the **WhatsApp** product

### Step 3: Get your credentials

From the WhatsApp dashboard:
- **WhatsApp Business Account ID** (WABA ID)
- **Phone Number ID** (the test number Meta provides)
- **Access Token** (temporary, or create a System User for permanent)

### Step 4: Configure environment variables

```bash
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_BUSINESS_ACCOUNT_ID=123456789012345
WHATSAPP_VERIFY_TOKEN=my_custom_verify_token
META_APP_SECRET=your_app_secret
```

### Step 5: Configure webhooks

1. In the Meta dashboard, go to **WhatsApp → Configuration**
2. Set **Callback URL**: `https://your-domain.com/api/v1/whatsapp/webhook`
3. Set **Verify Token**: same as `WHATSAPP_VERIFY_TOKEN`
4. Click **Verify and Save**
5. Subscribe to fields: `messages`, `message_deliveries`, `message_reads`

### Step 6: Test locally with ngrok

```bash
ngrok http 8000
# Update Meta webhook URL to https://<ngrok-id>.ngrok.io/api/v1/whatsapp/webhook
```

### Step 7: Connect account in the UI

1. Go to `/whatsapp/accounts`
2. Click **Connect Account**
3. Enter your credentials
4. Register your phone number

### Step 8: Send a test message

Send a WhatsApp message to your business number from your phone.

## 6. Security

- **Webhook signature verification**: HMAC-SHA256 with App Secret
- **Tenant isolation**: every table has `organization_id`; every query filters by it
- **Credential storage**: access tokens stored in DB (use vault references in production)
- **Rate limiting**: app-level + Meta's own limits
- **Media validation**: MIME type + size limits
- **Audit logs**: every webhook is persisted in `whatsapp_webhooks`

## 7. Testing

35 tests in `app/tests/test_whatsapp.py` covering:
- Meta client (signature verification, webhook parsing, message construction)
- Service (account CRUD, numbers, sessions, messaging)
- Webhook processing (verification, inbound, status)
- Tenant isolation
- Human handoff (initiate, assign, resolve)
- Templates (CRUD)
- Analytics

```bash
cd apps/backend
DATABASE_URL="sqlite+aiosqlite:///./test.db" python -m pytest app/tests/test_whatsapp.py -v
```
