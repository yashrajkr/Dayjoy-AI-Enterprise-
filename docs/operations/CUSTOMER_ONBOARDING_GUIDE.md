# Dayjoy AI Platform — Customer Onboarding Guide

## Phase 1: Organization Setup (Day 1)

### 1.1 Provision Tenant
- [ ] Create organization record in DB
- [ ] Generate unique slug (e.g., "dayjoy")
- [ ] Configure plan (free/starter/pro/enterprise)
- [ ] Set trial end date (30 days)
- [ ] Assign organization owner

### 1.2 Configure SSO
- [ ] Collect tenant IdP details (Okta/Azure AD/Google)
- [ ] Configure SAML/OIDC in Keycloak
- [ ] Test SSO login with tenant admin
- [ ] Configure JIT provisioning

### 1.3 Branding
- [ ] Upload logo (SVG preferred)
- [ ] Set primary brand color
- [ ] Configure custom domain (e.g., dayjoy.dayjoyai.com)
- [ ] Provision TLS certificate
- [ ] Configure voice greeting message

---

## Phase 2: Data Import (Days 2-3)

### 2.1 Knowledge Base
- [ ] Collect documents (product catalogs, policies, FAQs, training material)
- [ ] Upload to RAG pipeline via `/api/v1/ai/documents`
- [ ] Verify ingestion status (all documents should be "ready")
- [ ] Test knowledge search: `/api/v1/ai/search`
- [ ] Verify citations are accurate

### 2.2 Customer Import
- [ ] Export customers from existing CRM
- [ ] Format as CSV: email, full_name, phone, company_name, address fields
- [ ] Import via API or admin UI
- [ ] Verify customer count and data integrity

### 2.3 Product Catalogue
- [ ] Import products (SKU, name, price, PV, BV, description)
- [ ] Import product categories
- [ ] Upload product images
- [ ] Verify search functionality

### 2.4 Distributor Import (if applicable)
- [ ] Import distributor records
- [ ] Set up hierarchy (sponsor relationships)
- [ ] Configure commission rates
- [ ] Verify PV/BV values

---

## Phase 3: AI Configuration (Days 3-4)

### 3.1 AI Settings
- [ ] Configure LLM provider (OpenAI/Anthropic)
- [ ] Set default model (gpt-4o-mini recommended for cost)
- [ ] Set temperature (0.2 for factual, 0.7 for conversational)
- [ ] Configure RAG: top_k=5, confidence_threshold=0.55
- [ ] Enable safety filters (prompt injection, PII redaction, toxicity)

### 3.2 Agent Configuration
- [ ] Enable required agents (support, knowledge, escalation minimum)
- [ ] Configure agent prompts (use tenant-specific language)
- [ ] Test each agent via AI Playground (`/ai/chat`)
- [ ] Verify tool calling works (customer_lookup, product_search, knowledge_search)

### 3.3 Workflow Setup
- [ ] Configure escalation workflow (AI → human handoff)
- [ ] Set up callback scheduling workflow
- [ ] Configure notification preferences

---

## Phase 4: Channel Configuration (Days 4-5)

### 4.1 Voice
- [ ] Provision phone number (Twilio/Exotel)
- [ ] Configure SIP trunk
- [ ] Set up STT (Deepgram) and TTS (ElevenLabs) API keys
- [ ] Configure call recording consent message
- [ ] Test inbound call → AI response → transfer flow

### 4.2 WhatsApp
- [ ] Set up WhatsApp Business API account
- [ ] Get phone number approved
- [ ] Configure message templates (welcome, notification, etc.)
- [ ] Configure webhook endpoint
- [ ] Test inbound/outbound messages

### 4.3 Website Chat
- [ ] Generate chat widget embed code
- [ ] Embed widget on customer website
- [ ] Configure widget theme (colors, logo, position)
- [ ] Test chat flow (anonymous → AI → escalation)

### 4.4 Email (if applicable)
- [ ] Configure email inbox (IMAP/SMTP)
- [ ] Set up AI draft reply workflow
- [ ] Test email classification and threading

---

## Phase 5: Testing & Acceptance (Days 5-6)

### 5.1 Smoke Tests
- [ ] Health check: `GET /health/ready` returns 200
- [ ] Auth: Login works via SSO
- [ ] AI Chat: `/ai/chat` returns response with citations
- [ ] Knowledge Search: Returns relevant results
- [ ] Voice: Inbound call connects to AI
- [ ] WhatsApp: Messages send/receive
- [ ] Web Chat: Widget loads and responds
- [ ] Dashboard: KPIs show data
- [ ] Analytics: Insights generate
- [ ] Workflows: Trigger and execute

### 5.2 User Acceptance Testing
- [ ] Tenant admin can configure settings
- [ ] Ops analyst can monitor live conversations
- [ ] Knowledge engineer can upload/manage documents
- [ ] Security officer can view audit logs
- [ ] End users can chat/call and get AI responses

### 5.3 Performance Tests
- [ ] API p95 latency < 500ms (non-AI endpoints)
- [ ] AI chat p95 latency < 3s
- [ ] Voice call p95 latency < 2s
- [ ] 100 concurrent users without errors

---

## Phase 6: Go-Live (Day 7)

### 6.1 Pre-Go-Live Checklist
- [ ] All Phase 5 tests passed
- [ ] Backups configured and verified
- [ ] Monitoring dashboards live
- [ ] Alert rules active
- [ ] On-call rotation set
- [ ] Incident response runbook distributed
- [ ] Support team trained
- [ ] DNS records configured
- [ ] SSL certificates valid
- [ ] Rate limits configured

### 6.2 Go-Live
- [ ] Final backup taken
- [ ] DNS cutover (if applicable)
- [ ] Traffic switched to production
- [ ] Smoke tests on production
- [ ] Monitor for 1 hour (hypercare)
- [ ] Announce go-live to customer

### 6.3 Hypercare (Days 7-14)
- [ ] Daily check-in with customer (30 min)
- [ ] Monitor KPIs daily
- [ ] Address any issues within 4 hours
- [ ] Collect feedback
- [ ] Document any configuration changes

---

## Success Metrics (30-Day Review)

| Metric | Target | Measurement |
|--------|--------|-------------|
| AI Resolution Rate | ≥ 50% | Channel conversations resolved by AI |
| Average Response Time | ≤ 2s (voice), ≤ 800ms (chat) | p95 latency |
| CSAT | ≥ 4.0 / 5 | Post-conversation rating |
| Uptime | ≥ 99.5% | Monthly uptime |
| Knowledge Coverage | ≥ 80% | % of queries answered from KB |
| Escalation Rate | ≤ 30% | % of conversations escalated to human |
| Cost per Conversation | ≤ $0.15 | Total cost / total conversations |
