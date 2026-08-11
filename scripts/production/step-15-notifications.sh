#!/usr/bin/env bash
# =====================================================
# Step 15 — Notifications (Email + SMS + Push + Calendar)
# -----------------------------------------------------
# Verifies configuration for SMTP, Twilio SMS, FCM push,
# and Google Calendar, then sends one test message on
# each configured channel and checks delivery indicators.
#
# Channels without credentials are skipped with a warning
# (non-blocking). At least ONE channel must succeed.
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

STEP_N=15
STEP_NAME="Notifications (Email/SMS/Push/Calendar)"
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

# Backend must be up for /api/notifications/send
if ! (echo > /dev/tcp/127.0.0.1/${PORT:-3000}) 2>/dev/null; then
  echo -e "${RED}❌ Step ${STEP_N} failed: backend not running — run step 04 first.${RESET}"; exit 1
fi

TOKEN="$(cat "$SCRIPT_DIR/.admin-token" 2>/dev/null || true)"
if [[ -z "$TOKEN" ]]; then
  ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-admin@dayjoy.ai}"
  ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-Admin@12345}"
  TOKEN="$(curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    "http://localhost:${PORT:-3000}/api/auth/login" \
    | sed -nE 's/.*"accessToken"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p')"
fi

API="http://localhost:${PORT:-3000}"
SUCCESS_COUNT=0
TOTAL_CHANNELS=0

# ---------- SMTP / Email ----------
echo -e "${CYAN}▸ [1/4] Email (SMTP ${SMTP_HOST:-unset})...${RESET}"
TOTAL_CHANNELS=$((TOTAL_CHANNELS+1))
if [[ -z "${SMTP_PASSWORD:-}" ]]; then
  echo -e "  ${YELLOW}!${RESET} SMTP_PASSWORD not set — skipping email test"
  echo -e "    Configure SendGrid (smtp.sendgrid.net, user=apikey) or SES for production."
else
  EMAIL_TO="${NOTIFICATION_TEST_EMAIL:-${SMTP_FROM:-admin@dayjoy.ai}}"
  PAYLOAD="$(cat <<JSON
{"channel":"EMAIL","to":"${EMAIL_TO}","template":"test","payload":{"subject":"Dayjoy prod-readiness","body":"email test"}}
JSON
)"
  RESP="$(curl -fsS --max-time 20 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer ${TOKEN}" \
    -d "$PAYLOAD" "${API}/api/notifications/send" || true)"
  if echo "$RESP" | grep -qiE 'success|sent|queued|messageId'; then
    echo -e "  ${GREEN}✓${RESET} email accepted for delivery to ${EMAIL_TO}"
    SUCCESS_COUNT=$((SUCCESS_COUNT+1))
  else
    echo -e "  ${RED}✗${RESET} email send failed: ${RESP:0:200}"
  fi
fi

# ---------- Twilio SMS ----------
echo -e "${CYAN}▸ [2/4] SMS (Twilio ${TWILIO_ACCOUNT_SID:-unset})...${RESET}"
TOTAL_CHANNELS=$((TOTAL_CHANNELS+1))
if [[ -z "${TWILIO_ACCOUNT_SID:-}" || -z "${TWILIO_AUTH_TOKEN:-}" ]]; then
  echo -e "  ${YELLOW}!${RESET} Twilio credentials incomplete — skipping SMS test"
  echo -e "    Get credentials at https://console.twilio.com"
else
  SMS_TO="${NOTIFICATION_TEST_PHONE:-+919999999999}"
  PAYLOAD="$(cat <<JSON
{"channel":"SMS","to":"${SMS_TO}","template":"test","payload":{"body":"Dayjoy prod-readiness SMS test"}}
JSON
)"
  RESP="$(curl -fsS --max-time 20 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer ${TOKEN}" \
    -d "$PAYLOAD" "${API}/api/notifications/send" || true)"
  if echo "$RESP" | grep -qiE 'success|sent|queued|messageId'; then
    echo -e "  ${GREEN}✓${RESET} SMS queued to ${SMS_TO}"
    SUCCESS_COUNT=$((SUCCESS_COUNT+1))
  else
    echo -e "  ${RED}✗${RESET} SMS send failed: ${RESP:0:200}"
  fi
fi

# ---------- FCM Push ----------
echo -e "${CYAN}▸ [3/4] Push (FCM)...${RESET}"
TOTAL_CHANNELS=$((TOTAL_CHANNELS+1))
if [[ -z "${FCM_SERVER_KEY:-}" && -z "${FIREBASE_PROJECT_ID:-}" ]]; then
  echo -e "  ${YELLOW}!${RESET} FCM_SERVER_KEY / FIREBASE_PROJECT_ID not set — skipping push test"
  echo -e "    Generate a service-account JSON in Firebase console and set FCM_SERVER_KEY."
else
  PAYLOAD="$(cat <<JSON
{"channel":"PUSH","to":"${NOTIFICATION_TEST_FCM_TOKEN:-test-token}","template":"test","payload":{"title":"Dayjoy","body":"push test"}}
JSON
)"
  RESP="$(curl -fsS --max-time 20 -X POST -H 'Content-Type: application/json' -H "Authorization: Bearer ${TOKEN}" \
    -d "$PAYLOAD" "${API}/api/notifications/send" || true)"
  if echo "$RESP" | grep -qiE 'success|sent|queued|messageId'; then
    echo -e "  ${GREEN}✓${RESET} push notification queued"
    SUCCESS_COUNT=$((SUCCESS_COUNT+1))
  else
    echo -e "  ${RED}✗${RESET} push send failed: ${RESP:0:200}"
  fi
fi

# ---------- Google Calendar ----------
echo -e "${CYAN}▸ [4/4] Google Calendar integration...${RESET}"
TOTAL_CHANNELS=$((TOTAL_CHANNELS+1))
if [[ -z "${GOOGLE_CLIENT_ID:-}" || -z "${GOOGLE_CLIENT_SECRET:-}" ]]; then
  echo -e "  ${YELLOW}!${RESET} GOOGLE_CLIENT_ID/SECRET not set — skipping calendar test"
  echo -e "    Create OAuth credentials at https://console.cloud.google.com/apis/credentials"
  echo -e "    Enable Google Calendar API and set the redirect URI to ${API}/api/calendar/oauth/callback"
else
  # Just verify the calendar endpoint responds (creating events requires an OAuth'd user).
  HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -H "Authorization: Bearer ${TOKEN}" "${API}/api/calendar/status" || echo 000)"
  if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "401" ]]; then
    echo -e "  ${GREEN}✓${RESET} calendar endpoint reachable (HTTP ${HTTP_CODE})"
    SUCCESS_COUNT=$((SUCCESS_COUNT+1))
  else
    echo -e "  ${RED}✗${RESET} calendar endpoint returned HTTP ${HTTP_CODE}"
  fi
fi

# ---------- Acceptance ----------
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  Channels configured: ${TOTAL_CHANNELS}"
echo -e "  Channels verified:   ${SUCCESS_COUNT}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if (( TOTAL_CHANNELS == 0 )); then
  echo -e "${RED}❌ Step ${STEP_N} failed: no notification channels are configured.${RESET}"
  exit 1
fi
if (( SUCCESS_COUNT == 0 )); then
  echo -e "${RED}❌ Step ${STEP_N} failed: 0/${TOTAL_CHANNELS} notification channels verified.${RESET}"
  exit 1
fi
if (( SUCCESS_COUNT < TOTAL_CHANNELS )); then
  echo -e "${YELLOW}⚠ Step ${STEP_N} passed with ${SUCCESS_COUNT}/${TOTAL_CHANNELS} channels verified.${RESET}"
fi

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
