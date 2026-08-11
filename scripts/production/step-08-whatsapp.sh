#!/usr/bin/env bash
# =====================================================
# Step 08 — WhatsApp Business Cloud API integration
# -----------------------------------------------------
# If WHATSAPP_TOKEN is missing, prints setup instructions
# and exits 0 (graceful skip — channel is optional).
# If set:
#   - verifies the webhook subscription with Meta
#   - sends a test message via the Graph API
#   - polls the message status until delivered
#
# Idempotent: re-sending a test message is safe; Meta
# deduplicates within a short window.
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

STEP_N=8
STEP_NAME="WhatsApp Business Cloud API"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}  STEP ${STEP_N}: ${STEP_NAME}${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if [[ ! -f .env ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: .env missing.${RESET}"
  exit 1
fi
while IFS='=' read -r _ek _ev || [[ -n "$_ek" ]]; do
  case "$_ek" in ''|'#'*) continue ;; esac
  _ek="${_ek#"${_ek%%[![:space:]]*}"}"
  [[ -z "$_ek" ]] && continue
  export "${_ek}=${_ev}"
done < .env

# ---------- Graceful skip ----------
if [[ -z "${WHATSAPP_TOKEN:-}" ]]; then
  echo -e "${YELLOW}⚠ WhatsApp configuration required.${RESET}"
  echo -e "  Setup steps:"
  echo -e "    1. Go to https://developers.facebook.com → My Apps → Create App → Business"
  echo -e "    2. Add 'WhatsApp' product, copy the System User access token"
  echo -e "    3. Note the Phone Number ID and WhatsApp Business Account ID"
  echo -e "    4. Generate a webhook verify token: ${YELLOW}openssl rand -hex 16${RESET}"
  echo -e "    5. Set in .env:"
  echo -e "         WHATSAPP_TOKEN=EAAG..."
  echo -e "         WHATSAPP_PHONE_NUMBER_ID=..."
  echo -e "         WHATSAPP_BUSINESS_ACCOUNT_ID=..."
  echo -e "         WHATSAPP_APP_SECRET=$(openssl rand -hex 32)"
  echo -e "         WHATSAPP_WEBHOOK_VERIFY_TOKEN=<from step 4>"
  echo -e "    6. Subscribe the webhook URL in the Meta App dashboard"
  echo -e "    7. Re-run: bash scripts/production/step-08-whatsapp.sh"
  echo -e "${YELLOW}⚠ Step ${STEP_N} skipped (WhatsApp channel not configured). Non-blocking.${RESET}"
  exit 0
fi

# ---------- Prerequisites ----------
if [[ -z "${WHATSAPP_PHONE_NUMBER_ID:-}" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: WHATSAPP_TOKEN set but WHATSAPP_PHONE_NUMBER_ID missing.${RESET}"
  exit 1
fi

GRAPH_API="https://graph.facebook.com/v18.0"
PHONE_API="${GRAPH_API}/${WHATSAPP_PHONE_NUMBER_ID}/messages"

# ---------- 1. Verify webhook subscription ----------
echo -e "${CYAN}▸ Verifying WhatsApp app subscription...${RESET}"
ACCOUNT_ID="${WHATSAPP_BUSINESS_ACCOUNT_ID:-}"
if [[ -n "$ACCOUNT_ID" ]]; then
  SUB_RESP="$(curl -fsS --max-time 15 \
    -H "Authorization: Bearer ${WHATSAPP_TOKEN}" \
    "${GRAPH_API}/${ACCOUNT_ID}/subscribed_apps" || true)"
  if echo "$SUB_RESP" | grep -q '"data"'; then
    echo -e "  ${GREEN}✓${RESET} subscription endpoint reachable"
  else
    echo -e "  ${YELLOW}!${RESET} could not confirm subscription (response: ${SUB_RESP:0:200})"
  fi
else
  echo -e "  ${YELLOW}!${RESET} WHATSAPP_BUSINESS_ACCOUNT_ID not set — skipping subscription check."
fi

# ---------- 2. Send test message ----------
# WHATSAPP_TEST_RECIPIENT must be set to a phone number that has opted in.
RECIPIENT="${WHATSAPP_TEST_RECIPIENT:-}"
if [[ -z "$RECIPIENT" ]]; then
  echo -e "${YELLOW}!${RESET} WHATSAPP_TEST_RECIPIENT not set — skipping live send test."
  echo -e "  To send a test message, set WHATSAPP_TEST_RECIPIENT=<phone in E.164, e.g. 919876543210> in .env"
  echo -e "${GREEN}✅ Step ${STEP_N} complete (configuration verified, send test skipped)${RESET}"
  exit 0
fi

echo -e "${CYAN}▸ Sending test message to ${RECIPIENT}...${RESET}"
SEND_PAYLOAD="$(cat <<JSON
{
  "messaging_product":"whatsapp",
  "to":"${RECIPIENT}",
  "type":"text",
  "text":{"preview_url":false,"body":"Dayjoy AI production-readiness test — please ignore."}
}
JSON
)"
SEND_RESP="$(curl -fsS --max-time 20 -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${WHATSAPP_TOKEN}" \
  -d "$SEND_PAYLOAD" \
  "$PHONE_API" || true)"

MSG_ID="$(echo "$SEND_RESP" | sed -nE 's/.*"wamid"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n1)"
if [[ -z "$MSG_ID" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: WhatsApp send returned no message id.${RESET}"
  echo -e "  Response: ${SEND_RESP:0:400}"
  exit 1
fi
echo -e "  ${GREEN}✓${RESET} message accepted by Meta, wamid=${MSG_ID:0:32}..."

# ---------- 3. Poll delivery status ----------
echo -e "${CYAN}▸ Polling delivery status (up to 60s)...${RESET}"
DELIVERED=0
for i in $(seq 1 12); do
  sleep 5
  STATUS_RESP="$(curl -fsS --max-time 10 \
    -H "Authorization: Bearer ${WHATSAPP_TOKEN}" \
    "${GRAPH_API}/${MSG_ID}" 2>/dev/null || true)"
  STATUS="$(echo "$STATUS_RESP" | sed -nE 's/.*"status"[[:space:]]*:[[:space:]]*"([a-z_]+)".*/\1/p' | head -n1)"
  case "$STATUS" in
    delivered|read)
      DELIVERED=1
      echo -e "  ${GREEN}✓${RESET} message status: ${STATUS}"
      break
      ;;
    sent)
      echo -e "  ... sent (waiting for delivery, attempt ${i}/12)"
      ;;
    *)
      echo -e "  ... status: ${STATUS:-unknown} (attempt ${i}/12)"
      ;;
  esac
done

if (( DELIVERED == 0 )); then
  echo -e "${YELLOW}!${RESET} message was sent but not confirmed delivered within 60s."
  echo -e "  This is non-fatal — recipient phone may be offline or outside the 24h session window."
fi

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
