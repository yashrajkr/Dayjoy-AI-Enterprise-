#!/usr/bin/env bash
# =====================================================
# setup-all.sh — Dayjoy AI Production-Readiness Orchestrator
# -----------------------------------------------------
# Runs all 22 production-readiness step scripts in order.
#
# Flags:
#   --from <N>      Start from step N (1..22)
#   --to <N>        Stop after step N (1..22)
#   --only <N>      Run just step N
#   --dry-run       Print the steps that would run, then exit
#   --continue      Resume from the last failed step (uses .progress)
#   --list          List all steps with their names
#   -h, --help      Show this help
#
# Progress is tracked in scripts/production/.progress. On
# failure, the script prints the failing step and the exact
# command to re-run from that point.
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
STEPS_DIR="$SCRIPT_DIR"
PROGRESS_FILE="$STEPS_DIR/.progress"

# ---------- Map of step number → (script, name) ----------
declare -A STEP_SCRIPTS STEP_NAMES
STEP_SCRIPTS[1]="step-01-environment.sh"          ; STEP_NAMES[1]="Environment Validation"
STEP_SCRIPTS[2]="step-02-infrastructure.sh"       ; STEP_NAMES[2]="Infrastructure (Postgres+Redis+MinIO)"
STEP_SCRIPTS[3]="step-03-database.sh"             ; STEP_NAMES[3]="Database Migrations + Seed"
STEP_SCRIPTS[4]="step-04-backend.sh"              ; STEP_NAMES[4]="Backend Startup + Auth Smoke Test"
STEP_SCRIPTS[5]="step-05-rag.sh"                  ; STEP_NAMES[5]="RAG Ingest + Retrieval Smoke Test"
STEP_SCRIPTS[6]="step-06-ai.sh"                   ; STEP_NAMES[6]="AI Conversation + Tool Call"
STEP_SCRIPTS[7]="step-07-vapi.sh"                 ; STEP_NAMES[7]="Vapi Voice AI Integration"
STEP_SCRIPTS[8]="step-08-whatsapp.sh"             ; STEP_NAMES[8]="WhatsApp Business Cloud API"
STEP_SCRIPTS[9]="step-09-website.sh"              ; STEP_NAMES[9]="Website Chat Widget"
STEP_SCRIPTS[10]="step-10-customer-portal.sh"     ; STEP_NAMES[10]="Customer Portal"
STEP_SCRIPTS[11]="step-11-distributor-portal.sh"  ; STEP_NAMES[11]="Distributor Portal"
STEP_SCRIPTS[12]="step-12-employee-portal.sh"     ; STEP_NAMES[12]="Employee Portal"
STEP_SCRIPTS[13]="step-13-admin-dashboard.sh"     ; STEP_NAMES[13]="Admin Dashboard"
STEP_SCRIPTS[14]="step-14-n8n.sh"                 ; STEP_NAMES[14]="n8n Automation"
STEP_SCRIPTS[15]="step-15-notifications.sh"       ; STEP_NAMES[15]="Notifications (Email/SMS/Push/Calendar)"
STEP_SCRIPTS[16]="step-16-monitoring.sh"          ; STEP_NAMES[16]="Monitoring (Prometheus/Grafana/Sentry)"
STEP_SCRIPTS[17]="step-17-security.sh"            ; STEP_NAMES[17]="Security Hardening Verification"
STEP_SCRIPTS[18]="step-18-testing.sh"             ; STEP_NAMES[18]="Testing (unit/integration/e2e/load)"
STEP_SCRIPTS[19]="step-19-staging.sh"             ; STEP_NAMES[19]="Staging Deployment (K8s+Helm)"
STEP_SCRIPTS[20]="step-20-pilot.sh"               ; STEP_NAMES[20]="Pilot Plan (human-driven)"
STEP_SCRIPTS[21]="step-21-production.sh"          ; STEP_NAMES[21]="Production Blue-Green Deploy"
STEP_SCRIPTS[22]="step-22-verification.sh"        ; STEP_NAMES[22]="Production Verification + 7-day SLO Watch"

# ---------- Argument parsing ----------
FROM=1
TO=22
ONLY=""
DRY_RUN=0
CONTINUE=0
LIST=0

while (( $# > 0 )); do
  case "$1" in
    --from)     FROM="$2"; shift 2 ;;
    --to)       TO="$2"; shift 2 ;;
    --only)     ONLY="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --continue) CONTINUE=1; shift ;;
    --list)     LIST=1; shift ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo -e "${RED}Unknown argument: $1${RESET}" >&2
      exit 2 ;;
  esac
done

if (( LIST == 1 )); then
  echo -e "${BOLD}${CYAN}Dayjoy AI — 22 Production-Readiness Steps${RESET}"
  for i in $(seq 1 22); do
    printf "  ${GREEN}%2d${RESET}  %s\n" "$i" "${STEP_NAMES[$i]}"
  done
  exit 0
fi

# Validate numeric ranges
for v in "$FROM" "$TO" "${ONLY:-1}"; do
  if ! [[ "$v" =~ ^[0-9]+$ ]] || (( v < 1 || v > 22 )); then
    echo -e "${RED}Error: step numbers must be integers 1..22 (got: $v)${RESET}" >&2
    exit 2
  fi
done

if (( FROM > TO )); then
  echo -e "${RED}Error: --from (${FROM}) cannot exceed --to (${TO})${RESET}" >&2
  exit 2
fi

# --only overrides --from/--to
if [[ -n "$ONLY" ]]; then
  FROM="$ONLY"; TO="$ONLY"
fi

# --continue: read last failed step from .progress
if (( CONTINUE == 1 )); then
  if [[ -f "$PROGRESS_FILE" ]]; then
    LAST_STATE="$(tail -n1 "$PROGRESS_FILE")"
    LAST_STEP="$(echo "$LAST_STATE" | cut -d'|' -f1)"
    LAST_STATUS="$(echo "$LAST_STATE" | cut -d'|' -f2)"
    if [[ "$LAST_STATUS" == "FAILED" ]]; then
      FROM="$LAST_STEP"
      echo -e "${YELLOW}▸ Resuming from failed step ${LAST_STEP} (--continue)${RESET}"
    else
      echo -e "${YELLOW}▸ Last recorded step was ${LAST_STEP} (${LAST_STATUS}); resuming from ${LAST_STEP}${RESET}"
      FROM="$LAST_STEP"
    fi
  else
    echo -e "${YELLOW}▸ No .progress file found — starting from step 1.${RESET}"
    FROM=1
  fi
fi

# ---------- Banner ----------
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}  Dayjoy AI — Production Readiness Orchestrator${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  Project root: ${PROJECT_ROOT}"
echo -e "  Steps:        ${FROM} → ${TO}"
[[ -n "$ONLY" ]] && echo -e "  Mode:         --only ${ONLY}"
(( DRY_RUN == 1 )) && echo -e "  Mode:         ${YELLOW}--dry-run${RESET} (no commands will execute)"
echo ""

# ---------- Dry run ----------
if (( DRY_RUN == 1 )); then
  echo -e "${BOLD}Dry-run plan:${RESET}"
  for i in $(seq "$FROM" "$TO"); do
    script="${STEPS_DIR}/${STEP_SCRIPTS[$i]}"
    printf "  ${GREEN}[%2d]${RESET} bash %s   # %s\n" "$i" "$script" "${STEP_NAMES[$i]}"
  done
  echo ""
  echo -e "${YELLOW}No commands were executed. Re-run without --dry-run to proceed.${RESET}"
  exit 0
fi

# ---------- Verify each step script exists ----------
for i in $(seq "$FROM" "$TO"); do
  script="${STEPS_DIR}/${STEP_SCRIPTS[$i]}"
  if [[ ! -x "$script" ]]; then
    if [[ -f "$script" ]]; then
      echo -e "${YELLOW}!${RESET} ${script} is not executable — chmod +x'ing now."
      chmod +x "$script"
    else
      echo -e "${RED}Error: step script missing: ${script}${RESET}" >&2
      exit 2
    fi
  fi
done

# ---------- Initialize progress file ----------
if (( FROM == 1 )) && [[ ! -f "$PROGRESS_FILE" ]]; then
  echo "step|status|started_at|finished_at" > "$PROGRESS_FILE"
fi

# ---------- Run loop ----------
OVERALL_START="$(date +%s)"
FAILED_STEP=""

for i in $(seq "$FROM" "$TO"); do
  script="${STEPS_DIR}/${STEP_SCRIPTS[$i]}"
  name="${STEP_NAMES[$i]}"
  step_start="$(date -Iseconds)"

  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${CYAN}  ▶ Running step ${i}/22: ${name}${RESET}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

  if bash "$script"; then
    step_end="$(date -Iseconds)"
    echo "${i}|PASS|${step_start}|${step_end}" >> "$PROGRESS_FILE"
    echo -e "${GREEN}✓ Step ${i} PASSED${RESET}"
  else
    rc=$?
    step_end="$(date -Iseconds)"
    echo "${i}|FAILED|${step_start}|${step_end}" >> "$PROGRESS_FILE"
    FAILED_STEP="$i"
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${RED}  ❌ Step ${i} FAILED (exit code ${rc})${RESET}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "  Step name:        ${name}"
    echo -e "  Script:           ${script}"
    echo -e "  Progress file:    ${PROGRESS_FILE}"
    echo ""
    echo -e "  ${BOLD}To re-run from this step:${RESET}"
    echo -e "    ${YELLOW}bash scripts/production/setup-all.sh --from ${i}${RESET}"
    echo -e "  ${BOLD}Or to run only this step:${RESET}"
    echo -e "    ${YELLOW}bash scripts/production/setup-all.sh --only ${i}${RESET}"
    echo -e "  ${BOLD}Or to resume after fixing:${RESET}"
    echo -e "    ${YELLOW}bash scripts/production/setup-all.sh --continue${RESET}"
    echo ""
    echo -e "  Last 5 progress entries:"
    tail -n 5 "$PROGRESS_FILE" | sed 's/^/    /'
    exit "$rc"
  fi
done

OVERALL_END="$(date +%s)"
ELAPSED=$((OVERALL_END - OVERALL_START))

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  🎉 ALL REQUESTED STEPS PASSED${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  Steps run:    ${FROM} → ${TO}"
echo -e "  Elapsed:      ${ELAPSED}s"
echo -e "  Progress log: ${PROGRESS_FILE}"
if (( TO == 22 )); then
  echo ""
  echo -e "${BOLD}${GREEN}  🚀 Dayjoy AI is PRODUCTION-VERIFIED.${RESET}"
  echo -e "  Next: monitor https://${PRODUCTION_DOMAIN:-api.dayjoy.ai} for the next 24h."
fi
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
exit 0
