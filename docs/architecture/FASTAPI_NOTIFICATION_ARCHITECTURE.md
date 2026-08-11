# Enterprise Notification & Communication Platform — Architecture

> Stage 2 Step 6 — Centralized notification service for email, SMS, push, and
> in-app notifications with multi-tenant branding, template engine, and provider
> abstraction.

## 1. Overview

Every module in the application sends notifications through this centralized
service. Never send emails or SMS directly from business modules.

### Supported channels

| Channel | Providers | Status |
|---------|-----------|--------|
| **Email** | Resend (primary), SendGrid, Amazon SES (future), Log (dev) | ✅ Implemented |
| **SMS** | Twilio, Exotel (future), Plivo (future), Log (dev) | ✅ Implemented |
| **Push** | Firebase Cloud Messaging (FCM), Log (dev) | ✅ Implemented |
| **In-App** | Real-time notification center (DB-backed) | ✅ Implemented |
| **Slack** | Future | 🚧 Placeholder |
| **Teams** | Future | 🚧 Placeholder |

## 2. Architecture

```
Business Module → NotificationService → Provider Manager
                                            ├─ Email Provider (Resend/SendGrid/SES)
                                            ├─ SMS Provider (Twilio/Exotel/Plivo)
                                            ├─ Push Provider (FCM)
                                            └─ In-App (DB)
```

## 3. Database (4 new tables + extended existing)

| Table | Purpose |
|---|---|
| `notification_templates` | Reusable templates (email, SMS, push, in-app) with Jinja2 variables |
| `notification_channels` | Registered provider configs per tenant |
| `notification_logs` | Per-attempt delivery logs |
| `notification_branding` | Per-tenant email/SMS branding (logo, colors, sender) |
| `notifications` | Extended with new columns (channel, provider, recipient, etc.) |
| `notification_preferences` | Extended with channel, quiet hours, daily cap |

## 4. API endpoints (16 REST)

- `POST /notifications/email` — Send email
- `POST /notifications/sms` — Send SMS
- `POST /notifications/push` — Send push notification
- `POST /notifications/in-app` — Send in-app notification
- `POST /notifications/bulk` — Bulk send
- `POST/GET/DELETE /notifications/templates` — Template CRUD
- `GET/PATCH /notifications/branding` — Branding config
- `GET/PATCH /notifications/preferences` — User preferences
- `GET /notifications/history` — Notification history
- `GET /notifications/{id}/logs` — Delivery logs
- `GET /notifications/analytics/summary` — Analytics
- `GET /notifications/config` — Public config

## 5. Template Engine

Uses Jinja2 for variable substitution:
- `{{ user_name }}`, `{{ ticket_id }}`, `{{ otp }}`, etc.
- HTML + plain text rendering
- Per-tenant branding wrapper (logo, colors, footer)
- HTML sanitization (removes script tags)
- Multi-language support

## 6. Provider setup

### Resend (Email)
1. Sign up at [resend.com](https://resend.com)
2. Get API key from API Keys page
3. Set `RESEND_API_KEY=re_xxx`
4. Configure sender domain (or use `onboarding@resend.dev` for testing)

### Twilio (SMS)
1. Uses existing `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` from telephony
2. Set `TWILIO_SMS_FROM=+1234567890` (your Twilio number)
3. Or use a Messaging Service SID

### Firebase (Push)
1. Create project at [console.firebase.google.com](https://console.firebase.google.com)
2. Project Settings → Cloud Messaging → Server Key
3. Set `FCM_SERVER_KEY=xxx`
4. Set `ENABLE_PUSH_NOTIFICATIONS=true`

## 7. Testing

38 tests in `app/tests/test_notifications.py` covering:
- Email/SMS/Push providers (Resend, SendGrid, Twilio, FCM, Log)
- Template engine (Jinja2 rendering, branding, sanitization)
- Notification service (email, SMS, push, in-app, bulk, templates, branding, preferences)
- Tenant isolation
