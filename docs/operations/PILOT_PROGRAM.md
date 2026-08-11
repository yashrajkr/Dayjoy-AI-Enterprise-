# Dayjoy AI Platform — Enterprise Pilot Program

## Pilot Objectives

1. Validate that the platform meets Dayjoy's operational needs in production
2. Achieve 50%+ AI deflection rate on inbound distributor support calls
3. Demonstrate reliable multi-language (Hindi + English) voice AI
4. Verify that knowledge base answers are accurate and well-cited
5. Confirm that human handoff works seamlessly across channels

## Pilot Success Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| AI Deflection Rate | ≥ 50% | % of conversations resolved without human |
| CSAT | ≥ 4.0 / 5 | Post-conversation survey |
| Voice p95 Latency | ≤ 2.0s | Infrastructure monitoring |
| Chat p95 Latency | ≤ 800ms | Infrastructure monitoring |
| Citation Accuracy | ≥ 90% | Weekly QA sampling (200 conversations) |
| Hallucination Rate | ≤ 3% | Weekly QA sampling |
| Uptime | ≥ 99.5% | Monthly uptime monitor |
| Knowledge Coverage | ≥ 80% | % of queries answered from KB |
| Escalation Rate | ≤ 30% | % of conversations escalated |
| Cost per Conversation | ≤ $0.15 | Cost tracking |

## Customer Selection Criteria

### Ideal Pilot Customer Profile
- Direct-selling company with 1,000+ distributors
- High inbound call volume (5,000+ calls/month)
- Support team of 10+ agents
- Existing CRM (Salesforce/Zoho)
- Multi-language requirement (Hindi + English)
- Willing to dedicate an ops person for the pilot
- Executive sponsorship from customer side

### Dayjoy Marketing Pvt. Ltd. (Anchor Customer)
- ✅ 50,000+ distributors
- ✅ ~120,000 inbound calls/month
- ✅ Salesforce CRM
- ✅ Hindi + English required
- ✅ LOI signed ($180K Year-1 commitment)
- ✅ Ops team of 5+ people available

## Pilot Timeline (6 Weeks)

### Week 1: Onboarding (Phase 1-2 of onboarding guide)
- Organization setup, SSO, branding
- Knowledge base import (5,000+ documents)
- Customer/distributor data import
- Product catalogue import

### Week 2: AI Configuration
- Agent prompts tuned for Dayjoy
- RAG pipeline tested with real queries
- Voice configuration (Twilio + Deepgram + ElevenLabs)
- WhatsApp configuration
- Web chat widget deployed

### Week 3: Soft Launch (10% traffic)
- Route 10% of inbound calls to AI
- Monitor KPIs daily
- Collect feedback from distributors
- Tune prompts based on real conversations
- Fix any issues identified

### Week 4: Expanded Launch (50% traffic)
- Route 50% of inbound calls to AI
- Enable WhatsApp AI
- Enable web chat
- Daily standup with Dayjoy ops team
- Weekly steering committee

### Week 5: Full Launch (100% traffic)
- Route all eligible traffic to AI
- Monitor for stability
- Collect CSAT data
- Begin 14-day production validation period

### Week 6: Review & Sign-off
- Complete 14-day production validation
- Review all success metrics
- Present results to Dayjoy executive team
- Get formal acceptance
- Plan expansion (more channels, more use cases)

## Risk Management

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hindi STT accuracy < 85% | Medium | High | Benchmark on 100 real calls; custom vocabulary |
| Knowledge base gaps | High | Medium | KB audit; weekly gap analysis |
| Distributor resistance to AI | Medium | Medium | Communication plan; human always available |
| Voice latency > 2s | Low | High | Latency budget monitoring; STT/TTS optimization |
| System downtime | Low | Critical | 3 replicas, HPA, graceful shutdown, backups |

## Exit Criteria

The pilot is considered SUCCESSFUL when ALL of the following are true for 14 consecutive days:

1. ✅ AI deflection rate ≥ 50%
2. ✅ CSAT ≥ 4.0
3. ✅ Voice p95 latency ≤ 2.0s
4. ✅ Citation accuracy ≥ 90%
5. ✅ Uptime ≥ 99.5%
6. ✅ Zero P0 security incidents
7. ✅ Dayjoy ops team self-sufficient (no engineering support needed for daily ops)
8. ✅ Dayjoy signs acceptance document

## Communication Plan

| Cadence | Audience | Format |
|---------|----------|--------|
| Daily (15 min) | Dayjoy ops + Dayjoy AI CSM | Standup: yesterday's metrics, today's focus, blockers |
| Weekly (1 hr) | Dayjoy exec + Dayjoy AI CTO | Steering: weekly metrics review, risks, decisions |
| Bi-weekly | Dayjoy distributors | Newsletter: AI feature updates, tips, feedback request |
| Monthly | Both exec teams | Business review: ROI, expansion planning |

## Feedback Collection

### From Distributors
- Post-call CSAT survey (1-5 stars + optional comment)
- WhatsApp message: "How did we do? Reply with feedback"
- Monthly NPS survey via email

### From Dayjoy Ops Team
- Daily standup feedback
- Weekly feedback form (Google Forms)
- Live conversation flagging (flag for review in admin console)

### From Dayjoy Executives
- Weekly steering meeting
- Monthly business review
- Formal acceptance document at pilot completion
