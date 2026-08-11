#!/usr/bin/env bash
# =====================================================
# Step 20 — Pilot plan (human-driven)
# -----------------------------------------------------
# This step does NOT execute automated actions. It prints
# a comprehensive pilot plan for the on-call operator to
# execute manually over a 7-day window: user onboarding,
# CSAT survey distribution, and a bug triage process.
#
# The script writes the plan to .pilot-plan.md and exits 0.
# =====================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

STEP_N=20
STEP_NAME="Pilot Plan (human-driven)"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}  STEP ${STEP_N}: ${STEP_NAME}${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if [[ ! -f .env ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: .env missing.${RESET}"; exit 1
fi
while IFS='=' read -r _ek _ev || [[ -n "$_ek" ]]; do
  case "$_ek" in ''|'#'*) continue ;; esac
  _ek="${_ek#"${_ek%%[![:space:]]*}"}"
  [[ -z "$_ek" ]] && continue
  export "${_ek}=${_ev}"
done < .env

PILOT_FILE="$SCRIPT_DIR/.pilot-plan.md"

cat > "$PILOT_FILE" <<'PILOT'
# Dayjoy AI — Production Pilot Plan

**Duration:** 7 consecutive days
**Objective:** Validate the platform with real users across all 3 primary personas
before cutting over to general availability.

## 1. Cohort selection

| Persona        | Target users | Channel(s) exercised                       |
|----------------|--------------|--------------------------------------------|
| Customer       | 3–5          | Website chat, WhatsApp, voice call (Sarah) |
| Distributor    | 2–3          | Distributor portal, WhatsApp, voice        |
| Employee       | 2–3          | Employee portal, voice, website chat       |

Total: **7–11 pilot users** (target the upper end to surface edge cases).

## 2. Onboarding checklist (Day 0)

- [ ] Each user receives a personalized onboarding email (SMTP test from step 15)
- [ ] Each user is provisioned with the correct role in the admin dashboard
- [ ] Each user's phone number is whitelisted on WhatsApp + voice
- [ ] Each user is sent their first-use magic link / temporary password
- [ ] Calendly slot booked for a 30-min kickoff call

## 3. Daily ritual (Days 1–7)

1. **08:00 IST** — Check overnight monitoring dashboards (Grafana: API Health, Database, AI Quality, Business).
2. **09:00 IST** — Review Sentry for new errors; triage anything Critical/High.
3. **10:00 IST** — Send a Slack prompt to each pilot user: "Did anything block you yesterday?"
4. **14:00 IST** — Exercise one channel end-to-end:
   - Day 1: Website chat (place an order via chat)
   - Day 2: Voice (call Sarah, ask about return policy, escalate to human)
   - Day 3: WhatsApp (send "track my order" message)
   - Day 4: Customer portal (login, browse, checkout)
   - Day 5: Distributor portal (view team tree, log a sale)
   - Day 6: Employee portal (claim a lead, create a ticket)
   - Day 7: Cross-channel (start on voice, hand off to WhatsApp)
5. **18:00 IST** — Daily standup with eng + product; update `PILOT_LOG.md`.

## 4. CSAT survey

- **Tool:** Google Forms or Typeform
- **Link:** https://forms.dayjoy.ai/pilot-csat (placeholder — create before pilot)
- **Trigger:** Auto-send 2 hours after each channel exercise
- **Question set:**
  1. Overall satisfaction (1–5)
  2. Did the AI answer your question correctly? (Y/N + free text)
  3. How long did the interaction take? (slider 0s–300s)
  4. Would you use this channel again? (Y/N)
  5. What was the worst part? (free text)
- **Target:** mean CSAT ≥ 4.5 / 5

## 5. Bug triage process

| Severity | Definition                                            | SLA to acknowledge | SLA to fix |
|----------|-------------------------------------------------------|--------------------|------------|
| S0       | Platform down, data loss, security breach             | 15 min             | 4 h        |
| S1       | Core channel broken for > 10% of pilot users          | 30 min             | 8 h        |
| S2       | Feature broken with workaround                        | 4 h                | 2 days     |
| S3       | Cosmetic / minor UX issue                             | 1 day              | next sprint |

- All bugs logged in the project tracker with label `pilot`.
- S0/S1 trigger PagerDuty (configure in step 16).
- Daily review of pilot bugs during the 18:00 IST standup.

## 6. Success criteria for pilot exit

- **Availability:** ≥ 99.9% uptime over the 7 days
- **AI quality:** ≥ 92% of CSAT-question-2 answers are "Y"
- **CSAT:** mean ≥ 4.5
- **p95 latency:** < 500ms on all channels
- **Zero** S0 incidents, ≤ 2 S1 incidents (both resolved within SLA)
- **All 3 personas** completed at least 5 sessions each

## 7. Roll-back criteria

Trigger immediate roll-back to staging if any of:
- An S0 incident occurs
- CSAT-question-2 "Y" rate drops below 75% for 2 consecutive days
- > 5 data-integrity issues reported (wrong order, missing lead, etc.)

Roll-back procedure: see `PRODUCTION_RUNBOOK.md` → Rollback.

## 8. Hand-off to GA

Once success criteria are met:
1. Product owner signs off in `PILOT_LOG.md`.
2. Run `step-21-production.sh` for blue-green deploy.
3. Run `step-22-verification.sh` for the 7-day production SLO watch.
PILOT

echo -e "${GREEN}✓${RESET} pilot plan written to ${PILOT_FILE}"
echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}  PILOT PLAN SUMMARY${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  Duration:       ${BOLD}7 days${RESET}"
echo -e "  Cohort size:    ${BOLD}7–11 users across 3 personas${RESET}"
echo -e "  CSAT target:    ${BOLD}≥ 4.5 / 5${RESET}"
echo -e "  AI accuracy:    ${BOLD}≥ 92%${RESET}"
echo -e "  Uptime target:  ${BOLD}≥ 99.9%${RESET}"
echo -e "  Plan file:      ${BOLD}${PILOT_FILE}${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "${YELLOW}⚠ This is a human-driven step. Open ${PILOT_FILE} and execute the plan.${RESET}"

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
