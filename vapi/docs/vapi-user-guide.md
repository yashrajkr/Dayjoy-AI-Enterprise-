# Dayjoy Voice AI — User Guide

> A friendly, non-technical guide to Dayjoy's AI voice assistant.
> For technical docs, see [`vapi-api-documentation.md`](vapi-api-documentation.md).

**Version:** 2.0.0  •  **Audience:** Customer support managers, sales
managers, business ops, distributors.

---

## Table of Contents

1. [Welcome to Dayjoy Voice AI](#welcome-to-dayjoy-voice-ai)
2. [What the AI Can Do](#what-the-ai-can-do)
3. [How Customers Experience the AI](#how-customers-experience-the-ai)
4. [Managing Assistants](#managing-assistants)
5. [Viewing Analytics](#viewing-analytics)
6. [Handling Escalations](#handling-escalations)
7. [FAQ](#faq)

---

## Welcome to Dayjoy Voice AI

Dayjoy Voice AI is an intelligent voice assistant that answers
inbound calls and places outbound calls on behalf of Dayjoy. It
sounds like a real person (powered by ElevenLabs voice synthesis)
and can:

- Answer product questions (price, benefits, ingredients)
- Look up customer orders and accounts
- Create support tickets for issues
- Capture leads from interested prospects
- Book appointments with the business development team
- Explain the Dayjoy business opportunity + compensation plan
- Transfer to a human agent when needed

The AI is available 24/7 and handles hundreds of concurrent calls
without putting anyone on hold.

---

## What the AI Can Do

### 1. Product Information

The AI knows about every Dayjoy product — name, price, benefits,
ingredients, BV (Business Volume), and stock status.

**Customers can ask:**
- "What products do you have?"
- "Tell me about your multivitamin."
- "What's the price of Omega-3?"
- "What are the benefits of your wellness supplements?"
- "Is the multivitamin in stock?"

### 2. Customer Support

The AI can look up customer orders, understand complaints, and create
support tickets that route to the right team.

**Customers can ask:**
- "I have a problem with my order"
- "My order hasn't arrived"
- "I want to return a product"
- "I was charged the wrong amount"

The AI will:
1. Ask for the order number (or look up by phone/email)
2. Understand the issue
3. Propose a solution based on Dayjoy policy
4. Create a support ticket if needed
5. Transfer to a human if the customer is unsatisfied

### 3. Business Opportunity

Prospects curious about joining Dayjoy can ask the AI:

- "Tell me about the business opportunity"
- "How do I earn money with Dayjoy?"
- "What's the compensation plan?"
- "How do I become a distributor?"
- "Can I schedule a call to learn more?"

The AI explains the opportunity at a high level, then offers to
schedule a follow-up call with the business development team or
capture the prospect's contact info as a lead.

### 4. Appointment Booking

Customers and prospects can book appointments directly with the AI:

- "I'd like to schedule a meeting"
- "Can someone call me back tomorrow at 2pm?"
- "Book a call with business development"

The AI collects name, email, phone, preferred date/time, and
department, then confirms the booking.

### 5. Lead Capture

When a prospect expresses interest but isn't ready to commit, the AI
captures their info as a lead:

- "I'm interested in joining — can you send me more info?"
- "Tell me more, but I'm not ready to sign up yet"

The AI collects name, email, phone, area of interest (product /
business / both), and any notes — then routes the lead to the sales
team.

### 6. Distributor Support

Existing distributors can ask:

- "What's my current rank?"
- "How big is my team?"
- "What's my commission rate?"

The AI looks up the distributor by code, phone, or email and
provides a summary.

### 7. Human Escalation

The AI knows when to transfer to a human. Triggers include:

- Customer explicitly asks for a human ("let me speak to a person")
- Customer is frustrated or abusive ("you're useless")
- Customer rejects the AI's proposed solution
- Issue is too complex for the AI to resolve
- Customer asks a question the AI can't answer

When escalating, the AI:
1. Summarises the conversation so far
2. Transfers the call to the appropriate department
3. Provides the human agent with the call context

---

## How Customers Experience the AI

### A typical inbound call

```
[Phone rings]

AI: "Hi! Thank you for calling Dayjoy. This is Sarah, your virtual
     assistant. How can I help you today?"

Customer: "I want to know about your products."

AI: "I'd be happy to tell you about our products! We have a range of
     premium health and wellness supplements. What type are you
     interested in?"

Customer: "Multivitamins."

AI: "Great choice! Our Dayjoy Multivitamin retails for $49.99 and
     provides complete daily nutrition, energy support, and immune
     health. It's currently in stock. Would you like to place an
     order?"

Customer: "Not right now, thanks."

AI: "No problem! Is there anything else I can help you with?"

Customer: "No, that's all."

AI: "Great! Thank you for calling Dayjoy. Have a wonderful day!"

[Call ends]
```

### Returning customer

```
AI: "Welcome back, John! Thank you for calling Dayjoy again. How
     can I help you today?"

John: "My last order arrived damaged."

AI: "I'm sorry to hear that, John. I see your last order was
     ORD-123456. Can you tell me what was damaged?"

John: "The bottle of multivitamins was cracked."

AI: "I can process a replacement order for you right away, and it
     will ship within 24 hours. Would that work for you?"

John: "Yes, thank you."

AI: "Perfect! I've created support ticket TKT-ABC123 for you.
     Our team will respond within 24 hours at john@example.com.
     Is there anything else I can help you with?"
```

---

## Managing Assistants

### What is an Assistant?

An "assistant" is a Vapi configuration that defines:
- The voice (e.g. `rachel`, `antoni`)
- The LLM model (e.g. `gpt-4o`)
- The first message (greeting)
- The system prompt (instructions for the AI)
- Which tools the AI can call

Dayjoy typically has 1-3 assistants:
- **Dayjoy Support Agent** — handles inbound customer service calls
- **Dayjoy Sales Agent** — places outbound follow-up calls
- **Dayjoy Distributor Help** — answers distributor questions

### Listing assistants

```bash
curl https://api.dayjoy.ai/api/voice/assistants \
  -H "Authorization: Bearer $JWT"
```

Or via the admin dashboard (ask the Voice AI team for access).

### Creating a new assistant

```bash
curl -X POST https://api.dayjoy.ai/api/voice/assistants \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dayjoy Sales Agent",
    "voiceId": "antoni",
    "firstMessage": "Hi! This is Alex from Dayjoy Sales. How can I help?",
    "recordingEnabled": true
  }'
```

> **Note:** Assistant management in Vapi is typically done through
> the [Vapi dashboard](https://dashboard.vapi.ai). The API endpoints
> above are a convenience wrapper.

---

## Viewing Analytics

The Voice AI dashboard shows you what's happening with your calls.
Access it via `https://app.dayjoy.ai/voice-ai` (requires login).

### Key metrics to watch

| Metric | What it means | Healthy range |
|--------|---------------|---------------|
| **Total calls** | How many calls the AI handled | Matches your forecast ± 20% |
| **Active calls** | Currently in-progress calls | Varies by time of day |
| **Completion rate** | % of calls that ended normally (not failed) | > 95% |
| **Avg call duration** | How long calls last | 60-300 seconds |
| **Tool success rate** | % of tool calls that succeeded | > 95% |
| **AI accuracy** | % of responses rated accurate by QA | > 80% |
| **Escalation rate** | % of calls transferred to a human | 5-15% |
| **Customer satisfaction** | Post-call survey score (1-5) | > 4.0 |

### Dashboard sections

1. **Overview** — Today's totals + 7-day trend
2. **Calls** — Paginated list of all calls with filters
3. **Tools** — Tool usage breakdown
4. **Quality** — AI accuracy, hallucination rate, sentiment
5. **Escalations** — Calls that transferred to a human

### Getting the data via API

```bash
# Dashboard summary
curl https://api.dayjoy.ai/api/voice/analytics/dashboard \
  -H "Authorization: Bearer $JWT"

# List call analytics
curl "https://api.dayjoy.ai/api/voice/analytics/calls?limit=20" \
  -H "Authorization: Bearer $JWT"

# Tool usage
curl https://api.dayjoy.ai/api/voice/analytics/tools \
  -H "Authorization: Bearer $JWT"
```

---

## Handling Escalations

When the AI escalates a call to a human, the human agent receives:

1. **A phone transfer** to the appropriate department queue
2. **An escalation notification** in Slack (`#voice-escalations`)
3. **An email** with the call summary + transcript link (optional)
4. **A dashboard entry** under "Escalations"

### What the human agent sees

The escalation notification includes:
- Customer name + phone
- Reason for escalation (e.g. "Customer requested human agent")
- Brief call summary
- Link to the full transcript + recording
- Customer's order/ticket history (if available)

### Escalation best practices

1. **Answer quickly** — the customer has already been on a call, don't make them wait
2. **Acknowledge the AI's summary** — "I see you were talking to Sarah about your order..."
3. **Don't blame the AI** — frame it as a warm handoff, not a failure
4. **Document the outcome** — add notes to the support ticket so the next agent has context

### Configuring escalation targets

Set these environment variables to control where escalations go:

```
HUMAN_TRANSFER_PHONE_NUMBER=+15551234567   # The queue number to transfer to
HUMAN_TRANSFER_QUEUE=support               # Queue name (for tracking)
ESCALATION_EMAIL=escalations@dayjoy.ai     # Where to send email summaries
ESCALATION_SLACK_CHANNEL=#voice-escalations  # Slack channel for notifications
ESCALATION_SLACK_WEBHOOK_URL=https://hooks.slack.com/...  # Slack webhook
```

---

## FAQ

### Q: Can the AI handle multiple languages?

Currently the AI speaks English only. Multi-language support is on
the roadmap for Q2 2025.

### Q: What happens if the AI can't answer a question?

The AI will:
1. Try to find the answer via the knowledge base (RAG search)
2. If no good answer is found, it apologises and offers to transfer
   to a human

### Q: Can I listen to call recordings?

Yes. Recordings are stored for 90 days. Access them via:
- The dashboard (Calls → click a call → Recording tab)
- The API: `GET /api/voice/calls/:id/recording`

### Q: How accurate is the AI?

We measure accuracy in two ways:
- **Tool accuracy** — did the AI call the right tool with the right
  parameters? (Target: > 95%)
- **Response accuracy** — was the AI's spoken answer factually
  correct? (Target: > 80%, measured by QA team sampling 5% of calls
  weekly)

### Q: What if the AI says something wrong?

1. **Document it** — note the call ID, what was said, what should
   have been said
2. **Submit to the Voice AI team** via the `#voice-ai-feedback`
   Slack channel
3. **Update the knowledge base** if the issue was missing info
4. **Update the system prompt** if the issue was the AI's behaviour

### Q: How much does each call cost?

Roughly $0.05-$0.50 per call depending on duration. The
`VoiceAnalytics.cost` field on each call shows the exact amount.
Costs come from:
- Vapi telephony (~$0.01/minute)
- OpenAI LLM (~$0.005/call for short calls)
- OpenAI embeddings (~$0.0001/RAG query)

### Q: Can the AI make outbound calls?

Yes — see `POST /api/voice/calls` in the API docs. Use cases:
- Welcome calls to new customers
- Follow-up calls after a support ticket
- Re-engagement calls to dormant distributors
- Appointment reminders

### Q: What's the difference between a "call" and a "session"?

They're the same thing. We use "session" when emphasising the
backend record (`VoiceSession` table) and "call" when emphasising
the phone call itself. Every call has exactly one session.

### Q: Can I integrate the Voice AI with my CRM?

Yes. The AI captures leads, appointments, and support tickets into
the Dayjoy database. To sync these to an external CRM (HubSpot,
Salesforce, etc.), use the standard Dayjoy CRM sync API (see
`backend/integrations/`).

### Q: What happens if Vapi has an outage?

The AI won't be able to answer calls. Calls will go to voicemail
(if configured) or ring out. The system fires a `VapiOutage` alert
to PagerDuty — see the [runbook](vapi-runbooks.md#vapi-outage) for
the incident response procedure.

### Q: How do I get help?

- **Slack:** `#voice-ai-help`
- **Email:** `voice-ai@dayjoy.ai`
- **On-call:** PagerDuty schedule `voice-ai-oncall`
- **Vapi support:** `support@vapi.ai` (for Vapi-specific issues)

---

## Glossary

| Term | Definition |
|------|------------|
| **Assistant** | A Vapi configuration defining voice, model, and behaviour |
| **Session** | A single phone call's backend record |
| **Transcript** | A single message (user or assistant) in a call |
| **Tool** | A function the AI can call (e.g. `search_knowledge`) |
| **Flow** | A conversation pattern (e.g. customer support, product inquiry) |
| **Escalation** | Transferring a call from AI to a human agent |
| **RAG** | Retrieval-Augmented Generation — searching the knowledge base to ground AI responses |
| **BV** | Business Volume — points assigned to each product for compensation |
| **STT** | Speech-to-Text (Deepgram, via Vapi) |
| **TTS** | Text-to-Speech (ElevenLabs, via Vapi) |

---

**Need more help?** Contact `voice-ai@dayjoy.ai` or ping
`#voice-ai-help` on Slack.
