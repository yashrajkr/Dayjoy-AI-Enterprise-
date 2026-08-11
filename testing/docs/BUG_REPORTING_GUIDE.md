# Dayjoy AI Enterprise — Bug Reporting Guide

How to report, triage, and track bugs in the Dayjoy AI Enterprise Platform. This guide is for engineers, QA, and product managers.

---

## Table of Contents

1. [Severity Levels](#1-severity-levels)
2. [Bug Report Template](#2-bug-report-template)
3. [Reporting Process](#3-reporting-process)
4. [Triage Process](#4-triage-process)
5. [SLA by Severity](#5-sla-by-severity)
6. [Lifecycle](#6-lifecycle)
7. [Escalation](#7-escalation)

---

## 1. Severity Levels

Every bug is assigned a severity at triage time. Severity drives the SLA + escalation path.

### 1.1 Critical (Sev-1)

**Definition:** Production is down or user data is at risk. The whole company drops what it's doing to fix this.

**Examples:**

- Login is broken for all users
- Customer orders are being double-charged
- A security breach is in progress (data exfiltration, unauthorised access)
- The AI assistant is hallucinating harmful advice at scale
- Database corruption detected

**SLA:** Acknowledge within 15 minutes. Fix or rollback within 1 hour.

### 1.2 High (Sev-2)

**Definition:** A core feature is broken for a significant user segment, but the platform is not down. No data loss.

**Examples:**

- Customers cannot place orders (checkout broken)
- Distributors cannot see their commissions
- The AI assistant returns 500s for 10%+ of queries
- Voice AI calls drop randomly
- Rate limiting is incorrectly blocking legitimate users

**SLA:** Acknowledge within 1 hour. Fix or workaround within 4 hours.

### 1.3 Medium (Sev-3)

**Definition:** A non-core feature is broken, or a core feature is degraded but usable. User experience is impacted but not blocked.

**Examples:**

- The "Recommended products" section on the dashboard is empty
- Search filters don't work on the products page
- The commission chart renders but shows stale data
- Mobile layout is broken on iPhone SE
- Notifications are delayed by 10+ minutes

**SLA:** Acknowledge within 4 hours. Fix within 2 business days.

### 1.4 Low (Sev-4)

**Definition:** Cosmetic issue, minor UX inconvenience, or documentation gap. No functional impact.

**Examples:**

- A typo in the FAQ
- A misaligned button on the settings page
- A footer link goes to the wrong page
- The loading spinner is the wrong colour
- A console warning (not an error)

**SLA:** Acknowledge within 1 business day. Fix in the next sprint.

---

## 2. Bug Report Template

Copy this template into a new GitHub issue. Fields marked **[required]** must be filled.

```markdown
---
**Title:** [Sev-X] Short summary of the bug
**Severity:** Critical | High | Medium | Low
**Assignee:** (leave blank for triage)
**Labels:** bug, <portal-or-module>, <severity>
---

## Summary [required]

One or two sentences describing the bug.

## Steps to Reproduce [required]

1. Go to <URL>
2. Click on <element>
3. Enter <input>
4. Observe <error>

## Expected Behaviour [required]

What should have happened.

## Actual Behaviour [required]

What actually happened. Include the full error message if applicable.

## Environment [required]

- **Portal / module:** (e.g. Customer Portal, Backend - Auth, Voice AI)
- **URL:** (e.g. https://app.dayjoy.ai/dashboard)
- **Browser:** (e.g. Chrome 124, Safari 17, Mobile Safari iOS 17.4)
- **Operating System:** (e.g. macOS 14.4, Windows 11, Android 14)
- **User role:** (e.g. CUSTOMER, DISTRIBUTOR, ADMIN, SUPER_ADMIN)
- **Tenant:** (e.g. default, tenant-a)
- **Account email:** (the account you reproduced with — only if relevant)

## Evidence [required for Sev-1 + Sev-2]

- **Screenshot:** (drag-and-drop or paste)
- **Video:** (optional but encouraged for UI bugs)
- **Browser console logs:** (copy-paste or attach)
- **Network tab HAR file:** (File > Save All As HAR)
- **Backend logs:** (the request-id from the network tab — let DevOps pull the full log)
- **Trace:** (for Playwright failures, attach the trace.zip)

## Impact [required for Sev-1 + Sev-2]

- **How many users are affected?** (e.g. "all customers", "1 distributor", "0.1% of voice calls")
- **Is there a workaround?** (e.g. "users can refresh the page", "no workaround")
- **Is data loss possible?** (yes/no)
- **Is revenue impacted?** (yes/no + estimated ₹/hour)

## Reproducibility [required]

- **How often does this reproduce?** (Always / Sometimes / Once)
- **First observed:** (date + time, with timezone)
- **Last observed:** (date + time, with timezone)
- **Was this working before?** (yes — last working version / no / unknown)

## Additional Context (optional)

- **Related issues:** (link to #1234, #5678)
- **Suspected cause:** (if you have a hypothesis)
- **Test case to add:** (what test would have caught this?)
```

---

## 3. Reporting Process

### 3.1 Who Can Report

Anyone — engineers, QA, customer support, product managers, end-users (via the in-app "Report a bug" link).

### 3.2 Where to Report

| Reporter              | Where                                                  |
| --------------------- | ----------------------------------------------------- |
| Engineer / QA         | GitHub issue in `dayjoy-ai-enterprise` repo            |
| Customer support      | Internal Slack `#bug-reports` channel (QA creates the GitHub issue) |
| End-user              | In-app form → customer support → Slack → GitHub         |
| On-call engineer      | Page PagerDuty first, then create the GitHub issue      |

### 3.3 Before You Report

1. **Search for duplicates.** Use the GitHub issue search + the `#bug-reports` Slack history.
2. **Reproduce locally.** If you can't reproduce, note that in the report (the report is still valid — environment-specific bugs are real).
3. **Gather evidence.** Screenshots, videos, HAR files. A bug without evidence is much harder to fix.
4. **Pick the right severity.** Don't inflate — over-rating wastes the on-call's time. Don't deflate — under-rating risks missing the SLA. When in doubt, pick the lower severity and let triage bump it up.

### 3.4 After You Report

- **Slack:** post the issue link in `#bug-reports` so others are aware
- **Watch the issue:** you'll get notifications on every comment + status change
- **Respond to questions:** the assignee may need more info — please reply within the SLA window

---

## 4. Triage Process

### 4.1 Triage Cadence

- **Daily triage:** Monday–Friday at 10:30 AM IST (15 min, led by QA lead)
- **On-call triage:** the on-call engineer triages Sev-1 + Sev-2 within the SLA, 24/7

### 4.2 Triage Decisions

For each new bug, triage decides one of:

1. **Accept + assign** — confirmed as a bug; assign to an engineer + set the severity
2. **Needs more info** — the report is incomplete; ask the reporter for clarification (returns to the reporter's court)
3. **Duplicate** — close as a duplicate of an existing issue
4. **Won't fix** — close as wontfix (with a comment explaining why)
5. **Feature request** — convert to a feature request + move to the product backlog

### 4.3 Severity Calibration

Triage may bump the severity up or down based on:

- Actual user impact (the reporter may have under- or over-estimated)
- Blast radius (1 user vs. 1000 users)
- Workaround availability
- Revenue / data-loss risk

Severity changes are logged as a comment on the issue.

---

## 5. SLA by Severity

| Severity | Acknowledge  | Fix or Rollback | Communication                         |
| -------- | ------------ | --------------- | ------------------------------------ |
| Sev-1    | 15 minutes   | 1 hour          | Page on-call + post in `#incidents`  |
| Sev-2    | 1 hour       | 4 hours         | Post in `#bug-reports`               |
| Sev-3    | 4 hours      | 2 business days | Comment on the issue                 |
| Sev-4    | 1 business day | Next sprint    | Comment on the issue                 |

### 5.1 SLA Misses

If an SLA is missed:

1. The on-call posts an explanation in `#incidents` (Sev-1/2) or `#bug-reports` (Sev-3/4)
2. A retro is scheduled within 1 week (Sev-1/2) or 2 weeks (Sev-3/4)
3. Action items are tracked in the issue + the team's retrospective doc

### 5.2 Escalating an SLA Miss

If you believe a bug is being ignored:

1. **Slack:** ping the assignee + their manager in `#bug-reports`
2. **Email:** escalate to the engineering manager + QA lead
3. **Sev-1 only:** page the VP of Engineering via PagerDuty

---

## 6. Lifecycle

A bug moves through these states:

```
[Open] → [In Triage] → [Accepted] → [In Progress] → [In Review] → [In QA] → [Closed]
              ↓             ↓              ↓              ↓            ↓
          [Needs Info]  [Won't Fix]   [Blocked]      [Changes Requested] [Reopened]
```

### 6.1 State Definitions

| State              | Meaning                                                 |
| ------------------ | ------------------------------------------------------ |
| Open               | New issue, not yet triaged                              |
| In Triage          | Being reviewed by the daily triage meeting              |
| Needs Info         | Reporter needs to provide more details                  |
| Accepted           | Triage confirmed the bug; awaiting assignment           |
| Won't Fix          | Triage decided not to fix (with a reason)               |
| In Progress        | Engineer is actively working on the fix                 |
| Blocked            | Engineer is blocked on a dependency (spec, infra, etc.) |
| In Review          | PR is open + awaiting code review                       |
| In QA              | Fix is merged to a release branch; QA is verifying      |
| Changes Requested  | Reviewer asked for changes on the PR                    |
| Closed             | Fix is verified + deployed to production                 |
| Reopened           | QA verification failed; back to In Progress              |

### 6.2 Closing a Bug

A bug may be closed only when ALL of:

1. The fix is deployed to production
2. QA has verified the fix in production
3. The reporter has confirmed the fix (for Sev-1/2)
4. A regression test has been added (for Sev-1/2/3)

---

## 7. Escalation

### 7.1 Engineering Escalation Path

```
Engineer → Tech Lead → Engineering Manager → VP of Engineering → CTO
```

Escalate one level at a time. Don't skip levels unless the situation is a Sev-1 with no response in 30 minutes.

### 7.2 Customer Escalation

For Sev-1 bugs affecting customers:

1. Customer support notifies affected customers within 30 minutes (via email + in-app banner)
2. Status page (status.dayjoy.ai) is updated within 15 minutes
3. Progress updates every 30 minutes until resolved
4. Post-mortem is published within 5 business days (see §8)

### 7.3 Security Escalation

For suspected security bugs:

1. Do NOT file a public GitHub issue
2. Email security@dayjoy.ai with the details
3. The security team responds within 1 hour (Sev-1) or 4 hours (other)
4. A CVE is requested if the bug affects external users

---

## 8. Post-Mortems

Every Sev-1 bug + selected Sev-2 bugs requires a post-mortem within 5 business days.

### 8.1 Post-Mortem Template

```markdown
# Post-Mortem: <Bug Title>

## Summary
One paragraph describing what happened.

## Timeline (all times IST)
- 2024-05-15 10:00 — bug introduced (commit abc123 deployed)
- 2024-05-15 14:30 — first user report
- 2024-05-15 14:35 — on-call paged
- 2024-05-15 14:40 — rollback started
- 2024-05-15 15:10 — rollback complete, service restored

## Impact
- 1,247 users affected (12% of active users)
- 4 hours of degraded service
- ~₹2.3 lakh in lost revenue

## Root Cause
The technical explanation of why the bug occurred.

## What Worked Well
- Monitoring alerted within 30 seconds
- Rollback completed in 30 minutes

## What Didn't Work Well
- The bug wasn't caught by the test suite (no test for X)
- The deploy didn't canary (rolled out to 100% immediately)

## Action Items
- [ ] Add test for X (assignee, due date)
- [ ] Enable canary deploys (assignee, due date)
- [ ] Add alerting for Y (assignee, due date)

## Lessons Learned
What we'll do differently next time.
```

### 8.2 Post-Mortem Review

Post-mortems are reviewed in a 30-minute meeting with the engineering team. The meeting is blameless — focus on the system, not the people.

---

## Appendix: Bug Report Quality Checklist

Before you submit, check:

- [ ] Title is descriptive (not just "bug")
- [ ] Severity is correctly chosen
- [ ] Steps to reproduce are numbered + specific
- [ ] Expected vs. actual behaviour is clear
- [ ] Environment details are complete
- [ ] Evidence (screenshots / logs) is attached
- [ ] Impact is described (for Sev-1/2)
- [ ] You've searched for duplicates
- [ ] You've reproduced the bug locally (or noted that you couldn't)

A high-quality bug report gets fixed faster. A low-quality bug report gets bounced back to the reporter, slowing everyone down.
