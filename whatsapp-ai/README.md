# WhatsApp AI (NestJS)

WhatsApp Business API integration built with NestJS + TypeScript.

## Structure (to be implemented)

```
whatsapp-ai/
├── src/
│   ├── main.ts                    NestJS bootstrap
│   ├── app.module.ts              Root module
│   ├── whatsapp.module.ts         WhatsApp module
│   ├── whatsapp.service.ts        Meta Cloud API client
│   ├── webhook.controller.ts      Webhook handler (HMAC verified)
│   ├── webhook.service.ts         Webhook processing
│   ├── templates.service.ts       Message template management
│   └── conversations.service.ts   Conversation state machine
├── package.json
├── tsconfig.json
└── Dockerfile
```

## Reference

See `_reference/whatsapp-python-reference/` for a Python implementation
of the Meta Cloud API client. Port the logic to TypeScript.

## Meta Cloud API Setup

1. Create a Meta Business Account
2. Add a WhatsApp Business phone number
3. Get the access token and phone number ID
4. Configure webhook URL and verify token
5. Subscribe to message events

## Env Vars

```
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_WEBHOOK_SECRET=
```
