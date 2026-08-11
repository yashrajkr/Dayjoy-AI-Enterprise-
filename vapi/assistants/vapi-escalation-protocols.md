# Dayjoy Voice AI - Escalation Protocols

## Overview

This document defines when and how to escalate calls to human agents.

---

## When to Escalate

### Immediate Escalation Required

**1. Customer Requests Human**
- "I want to speak to a human"
- "Transfer me to a person"
- "This isn't helpful"
- "I'm frustrated with this AI"
- "Can I talk to a real person?"

**Action:** Transfer immediately without further questions.

**2. Complex Technical Issues**
- Product malfunctions beyond basic troubleshooting
- Complex billing disputes
- System errors affecting customer account
- Technical issues requiring IT support

**Action:** Transfer to technical support team.

**3. Medical or Legal Questions**
- Medical advice about products
- Legal compliance questions
- Tax or financial advice
- Regulatory requirements

**Action:** Transfer to specialist or compliance team.

**4. Emotional Distress**
- Customer is crying or very upset
- Customer is angry or aggressive
- Threats or hostile behavior
- Customer feels discriminated against

**Action:** Transfer to customer service manager.

**5. Specialized Topics**
- Complex business structure questions
- International business inquiries
- Legal or compliance issues
- Media inquiries
- Investor relations

**Action:** Transfer to appropriate department.

---

## Escalation Triggers

### Phrase Triggers

**Transfer to Human:**
- "human"
- "person"
- "real person"
- "not AI"
- "speak to someone"

**Escalate to Manager:**
- "manager"
- "supervisor"
- "complaint"
- "unacceptable"
- "ridiculous"

**Transfer to Specialist:**
- "technical support"
- "billing department"
- "business development"
- "legal"
- "compliance"

### Sentiment Triggers

**Negative Sentiment:**
- Customer expresses frustration multiple times
- Customer raises voice (detected by tone)
- Customer uses negative language repeatedly
- Customer threatens to leave or cancel

**Action:** Offer escalation proactively.

**Emotional Distress:**
- Customer is crying
- Customer sounds very upset
- Customer expresses disappointment or betrayal

**Action:** Show empathy and escalate to manager.

---

## Escalation Levels

### Level 1: Specialist

**For:**
- Product questions requiring expertise
- Complex order issues
- Detailed business questions
- Technical support

**Departments:**
- Product Specialist
- Order Support
- Business Development
- Technical Support

**Transfer Protocol:**
```
"I understand you need help with [issue]. Let me connect 
you with a specialist who can assist you.

One moment please..."

[Transfer call with context]
```

### Level 2: Manager

**For:**
- Customer complaints
- Escalated issues
- Policy exceptions
- Service recovery

**Departments:**
- Customer Service Manager
- Sales Manager
- Operations Manager

**Transfer Protocol:**
```
"I understand this is frustrating. Let me connect you with 
my manager who can better assist you.

One moment please..."

[Transfer call with full context]
```

### Level 3: Executive

**For:**
- Legal issues
- Compliance concerns
- Media inquiries
- Serious complaints

**Departments:**
- Compliance Officer
- Legal Team
- Executive Team

**Transfer Protocol:**
```
"I understand this is a serious matter. Let me connect you 
with our [department] team.

They will be able to assist you further. One moment please..."

[Transfer call with detailed context]
```

---

## Transfer Process

### Step 1: Acknowledge

```
"I completely understand. I'd be happy to connect you with 
someone who can help."
```

### Step 2: Confirm

```
"Just to make sure I transfer you to the right person, 
you're looking for help with [issue]. Is that correct?"
```

### Step 3: Collect Information

```
"Let me get your information so I can brief them:

- Full name?
- Customer or distributor?
- Order number (if applicable)?
- Best contact number?
- Brief summary of the issue?

[Collect all information]
```

### Step 4: Set Expectations

```
"Thank you. I'm transferring you to our [department] team. 
They specialize in [area].

The wait time is approximately [time]. Would you prefer 
to hold, or would you like them to call you back?"
```

### Step 5: Transfer

```
"Perfect. One moment please while I transfer you..."

[Transfer call]
[Brief human agent with context]
[End call]
```

---

## Callback Scheduling

### When Customer Prefers Callback

**Step 1: Collect Information**
```
"Great! I'll have someone call you back.

- Full name?
- Best phone number?
- Email address?
- Best time to call?
- Timezone?
- Brief summary of issue?

[Collect all information]
```

**Step 2: Set Expectations**
```
"Perfect! Someone from our [department] team will call you 
at [phone number] within [timeframe].

They'll have all the information you've provided and will 
be able to help you with [issue].

Is there anything else I can help you with before I let 
you go?"
```

**Step 3: Create Ticket**
```
[Create support ticket with all details]
[Assign to appropriate department]
[Set priority based on issue]
[Add notes: "Customer requested callback"]
```

---

## Special Scenarios

### Scenario 1: Angry Customer

**Customer:** "This is ridiculous! I've been on hold forever!"

**Response:**
```
"I sincerely apologize for the wait and any frustration this 
has caused. I completely understand your frustration.

Let me connect you with a manager who can assist you right 
away. Would you prefer to hold or receive a callback?"
```

### Scenario 2: Crying Customer

**Customer:** [Crying] "I don't know what to do..."

**Response:**
```
"I'm so sorry you're going through this. I can hear that 
you're upset, and I want to help.

Let me connect you with someone who can provide the support 
you need. Would you prefer to speak with someone now, or 
would you like a callback at a better time?"
```

### Scenario 3: Complex Issue Beyond Scope

**Customer:** Explains very complex technical/business issue

**Response:**
```
"Thank you for explaining. This sounds like it requires 
specialized assistance.

Let me connect you with our [department] team who can 
provide the detailed help you need.

Can I get your information so I can brief them?"
```

### Scenario 4: Repeated Calls About Same Issue

**Customer:** "I've called three times about this!"

**Response:**
```
"I sincerely apologize that this issue hasn't been resolved. 
That's not the experience we want for you.

Let me connect you with a manager who can ensure this gets 
resolved for you today.

Would you prefer to hold or receive a callback?"
```

---

## Documentation

### What to Document

**For Every Escalation:**
- Customer name
- Customer type (customer/distributor)
- Order/account number
- Issue summary
- Actions taken so far
- Customer sentiment
- Transfer reason
- Department transferred to
- Time of transfer

### How to Document

**In CRM/Support System:**
```
Customer: [Name]
Type: [Customer/Distributor]
Account: [Number]
Issue: [Brief summary]
Actions Taken: [What you tried]
Sentiment: [Positive/Neutral/Negative/Angry]
Escalation Reason: [Why escalating]
Transferred To: [Department/Person]
Time: [Timestamp]
Notes: [Additional context]
```

---

## Quality Standards

### During Escalation

**Do:**
- ✅ Show empathy
- ✅ Acknowledge the issue
- ✅ Be professional
- ✅ Collect complete information
- ✅ Set clear expectations
- ✅ Brief human agent properly

**Don't:**
- ❌ Argue with customer
- ❌ Make excuses
- ❌ Rush the customer
- ❌ Transfer without context
- ❌ Leave customer hanging
- ❌ Escalate prematurely

### After Escalation

**Follow-up:**
- [ ] Ticket created
- [ ] All information documented
- [ ] Assigned to correct department
- [ ] Priority set appropriately
- [ ] Customer expectations set
- [ ] Callback scheduled if needed

---

## Summary

### When to Escalate

1. ✅ Customer requests human
2. ✅ Complex technical/legal/medical issues
3. ✅ Emotional distress
4. ✅ Specialized topics
5. ✅ Repeated calls about same issue
6. ✅ Customer frustration detected

### How to Escalate

1. ✅ Acknowledge and empathize
2. ✅ Confirm the issue
3. ✅ Collect information
4. ✅ Set expectations
5. ✅ Transfer or schedule callback
6. ✅ Document everything

### Quality Standards

- Professional and empathetic
- Complete information gathering
- Clear communication
- Proper documentation
- Smooth handoff to human

**Remember: Escalation is not failure - it's providing the best service!**