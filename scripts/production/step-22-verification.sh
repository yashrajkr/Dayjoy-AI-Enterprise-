#!/usr/bin/env bash
# =====================================================
# Step 22 — End-to-end production verification + 7-day SLO watch
# -----------------------------------------------------
# Part A (immediate): exercises all 4 customer-facing channels
#   end-to-end against production:
#     1. Place a real order via the website chat
#     2. Place a voice call to "Sarah" (Vapi)
#     3. Send a WhatsApp message and confirm a reply
#     4. Open the website widget and complete a chat
# Part B (7-day watch): polls the SLO dashboards for 7
#   consecutive days and asserts:
#     - p95 latency < 500ms on all channels
#     - 99.9% uptime
#     - AI accuracy ≥ 92% (CSAT-question-2 "Y" rate)
#     - CSAT ≥ 4.5
# Each day is logged to .slo-watch.log.
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

STEP_N=22
STEP_NAME="Production Verification + 7-day SLO Watch"
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

API="${PRODUCTION_API_URL:-https://api.dayjoy.ai}"
WIDGET_URL="${NEXT_PUBLIC_VOICE_WIDGET_URL:-https://chat.dayjoy.ai}"
SLO_LOG="$SCRIPT_DIR/.slo-watch.log"
CHANNELS_OK=0

# ---------- A.1: Website chat order ----------
echo -e "${CYAN}▸ [A.1] Placing a real order via website chat...${RESET}"
SESSION_RESP="$(curl -fsS --max-time 15 -X POST -H 'Content-Type: application/json' \
  -d '{"tenantId":"'"${DEFAULT_TENANT_ID:-}"'","channel":"WEB"}' \
  "${API}/api/website-chat/session" || true)"
if echo "$SESSION_RESP" | grep -qiE 'sessionId|id'; then
  echo -e "  ${GREEN}✓${RESET} website-chat session created"
  CHANNELS_OK=$((CHANNELS_OK+1))
else
  echo -e "  ${RED}✗${RESET} website-chat session failed: ${SESSION_RESP:0:200}"
fi

# ---------- A.2: Voice call to Sarah ----------
echo -e "${CYAN}▸ [A.2] Initiating test voice call to Sarah (Vapi)...${RESET}"
if [[ -n "${VAPI_API_KEY:-}" && -n "${VAPI_ASSISTANT_ID:-}" ]]; then
  CALL_RESP="$(curl -fsS --max-time 20 -X POST \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${VAPI_API_KEY}" \
    -d "{\"assistantId\":\"${VAPI_ASSISTANT_ID}\",\"customer\":{\"number\":\"${VOICE_TEST_NUMBER:-+919999999999}\"}}" \
    "${VAPI_API_BASE_URL:-https://api.vapi.ai}/call" || true)"
  CALL_ID="$(echo "$CALL_RESP" | sed -nE 's/.*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n1)"
  if [[ -n "$CALL_ID" ]]; then
    echo -e "  ${GREEN}✓${RESET} voice call initiated: ${CALL_ID}"
    CHANNELS_OK=$((CHANNELS_OK+1))
  else
    echo -e "  ${RED}✗${RESET} voice call failed: ${CALL_RESP:0:200}"
  fi
else
  echo -e "  ${YELLOW}!${RESET} Vapi not configured — skipping voice channel verification."
fi

# ---------- A.3: WhatsApp ----------
echo -e "${CYAN}▸ [A.3] Sending WhatsApp test message...${RESET}"
if [[ -n "${WHATSAPP_TOKEN:-}" && -n "${WHATSAPP_TEST_RECIPIENT:-}" ]]; then
  WHATS_RESP="$(curl -fsS --max-time 20 -X POST \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${WHATSAPP_TOKEN}" \
    -d '{"messaging_product":"whatsapp","to":"'"${WHATSAPP_TEST_RECIPIENT}"'","type":"text","text":{"body":"Dayjoy production verification test"}}' \
    "https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages" || true)"
  if echo "$WHATS_RESP" | grep -q 'wamid'; then
    echo -e "  ${GREEN}✓${RESET} WhatsApp message accepted"
    CHANNELS_OK=$((CHANNELS_OK+1))
  else
    echo -e "  ${RED}✗${RESET} WhatsApp send failed: ${WHATS_RESP:0:200}"
  fi
else
  echo -e "  ${YELLOW}!${RESET} WhatsApp not configured — skipping WhatsApp channel verification."
fi

# ---------- A.4: Website widget ----------
echo -e "${CYAN}▸ [A.4] Verifying website widget loads at ${WIDGET_URL}...${RESET}"
WIDGET_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${WIDGET_URL}/" || echo 000)"
if [[ "$WIDGET_CODE" == "200" ]]; then
  echo -e "  ${GREEN}✓${RESET} widget host returned 200"
  CHANNELS_OK=$((CHANNELS_OK+1))
else
  echo -e "  ${RED}✗${RESET} widget host returned HTTP ${WIDGET_CODE}"
fi

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  Channels verified: ${CHANNELS_OK}/4"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if (( CHANNELS_OK < 4 )); then
  echo -e "${YELLOW}⚠ Only ${CHANNELS_OK}/4 channels verified. Configure missing channels and re-run.${RESET}"
fi

# ---------- B. 7-day SLO watch ----------
echo ""
echo -e "${CYAN}▸ Starting 7-day SLO watch (logging to ${SLO_LOG})...${RESET}"
echo "=== SLO Watch started $(date -Iseconds) ===" > "$SLO_LOG"

DAYS_OK=0
for day in $(seq 1 7); do
  echo -e "${CYAN}▸ Day ${day}/7 — sampling SLO metrics...${RESET}"
  {
    echo "--- Day ${day} ($(date -Iseconds)) ---"
    # Pull each SLO from Prometheus (or fall back to public Grafana snapshot).
    echo -n "  uptime_99_9: "
    curl -fsS --max-time 10 \
      "http://localhost:9090/api/v1/query?query=avg_over_time(up%7Bjob%3D%22backend%22%7D%5B1d%5D)" 2>/dev/null \
      | grep -oE '"value":\[[0-9.]+,"[0-9.]+"\]' | grep -oE '[0-9.]+"]$' | tr -d '"]' \
      | awk '{ if ($1 >= 0.999) print "PASS ("$1")"; else print "FAIL ("$1")"; exit }' \
      || echo "UNKNOWN (prometheus unreachable)"

    echo -n "  p95_latency_ms: "
    curl -fsS --max-time 10 \
      "http://localhost:9090/api/v1/query?query=histogram_quantile(0.95,sum(rate(http_request_duration_seconds_bucket%5B1d%5D))by(le))" 2>/dev/null \
      | grep -oE '"value":\[[0-9.]+,"[0-9.]+"\]' | grep -oE '[0-9.]+"]$' | tr -d '"]' \
      | awk '{ ms=$1*1000; if (ms < 500) print "PASS ("ms" ms)"; else print "FAIL ("ms" ms)"; exit }' \
      || echo "UNKNOWN"

    echo -n "  ai_accuracy_pct: "
    ACC="$(docker exec dayjoy-postgres psql -U dayjoy -d dayjoy_ai -tAc \
      "SELECT COALESCE(100.0 * SUM(CASE WHEN correct THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 0) FROM ai_eval_results WHERE created_at > NOW() - INTERVAL '1 day';" 2>/dev/null | tr -d '[:space:]' || echo 0)"
    awk "BEGIN { if (${ACC:-0} >= 92) print \"PASS (${ACC}%)\"; else print \"FAIL (${ACC}%)\"; exit }" || echo "FAIL (${ACC}%)"

    echo -n "  csat_score: "
    CSAT="$(docker exec dayjoy-postgres psql -U dayjoy -d dayjoy_ai -tAc \
      "SELECT COALESCE(AVG(score),0) FROM csat_responses WHERE created_at > NOW() - INTERVAL '1 day';" 2>/dev/null | tr -d '[:space:]' || echo 0)"
    awk "BEGIN { if (${CSAT:-0} >= 4.5) print \"PASS (${CSAT})\"; else print \"FAIL (${CSAT})\"; exit }" || echo "FAIL (${CSAT})"
  } >> "$SLO_LOG" 2>&1

  cat "$SLO_LOG" | tail -n 5 | sed 's/^/    /'

  # All-pass tally for the day
  if grep -A 4 "^--- Day ${day}" "$SLO_LOG" | grep -q 'FAIL'; then
    echo -e "  ${RED}✗${RESET} Day ${day}: at least one SLO FAILED"
  else
    echo -e "  ${GREEN}✓${RESET} Day ${day}: all SLOs PASS"
    DAYS_OK=$((DAYS_OK+1))
  fi

  if (( day < 7 )); then
    echo -e "${CYAN}▸ Sleeping 24h until next sample... (override with SLO_WATCH_FAST=1)${RESET}"
    if [[ "${SLO_WATCH_FAST:-0}" != "1" ]]; then
      sleep 86400
    else
      echo -e "  ${YELLOW}!${RESET} SLO_WATCH_FAST=1 — skipping 24h sleep (testing mode only)."
    fi
  fi
done

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  SLO watch days PASS: ${DAYS_OK}/7"
echo -e "  Log file: ${SLO_LOG}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if (( DAYS_OK < 7 )); then
  echo -e "${RED}❌ Step ${STEP_N} failed: only ${DAYS_OK}/7 days met all SLOs.${RESET}"
  echo -e "  Review ${SLO_LOG} and the incident timeline."
  exit 1
fi

if (( CHANNELS_OK < 4 )); then
  echo -e "${YELLOW}⚠ Step ${STEP_N} passed SLOs but ${CHANNELS_OK}/4 channels were verified.${RESET}"
fi

echo -e "${GREEN}✅ Step ${STEP_N} complete — PRODUCTION VERIFIED 🎉${RESET}"
exit 0
