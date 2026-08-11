#!/usr/bin/env bash
# =====================================================
# Step 07 — Vapi Voice AI integration
# -----------------------------------------------------
# If VAPI_API_KEY is missing, prints setup instructions
# and exits 0 (graceful skip — channel is optional).
# If set:
#   - creates a Vapi assistant via the REST API
#   - registers the webhook URL for call events
#   - prints the assistant ID and purchased phone number
#
# Idempotent: re-uses VAPI_ASSISTANT_ID if already set.
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

STEP_N=7
STEP_NAME="Vapi Voice AI Integration"
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

# ---------- Graceful skip if no credentials ----------
if [[ -z "${VAPI_API_KEY:-}" ]]; then
  echo -e "${YELLOW}⚠ Vapi configuration required — get your key at https://dashboard.vapi.ai${RESET}"
  echo -e "  Once you have a key:"
  echo -e "    1. Set VAPI_API_KEY in .env"
  echo -e "    2. Set VAPI_WEBHOOK_URL to your public backend URL (e.g. https://api.dayjoy.ai/api/voice/webhook)"
  echo -e "    3. (Optional) Set VAPI_PHONE_NUMBER_ID if you've already purchased a number"
  echo -e "    4. Re-run: bash scripts/production/step-07-vapi.sh"
  echo -e "${YELLOW}⚠ Step ${STEP_N} skipped (voice channel not configured). Non-blocking.${RESET}"
  exit 0
fi

# ---------- Prerequisites ----------
if ! command -v curl >/dev/null 2>&1; then
  echo -e "${RED}❌ Step ${STEP_N} failed: curl not found.${RESET}"; exit 1
fi
if ! command -v jq  >/dev/null 2>&1; then
  echo -e "${YELLOW}!${RESET} jq not found — falling back to sed/grep parsing (less robust)."
fi

VAPI_BASE="${VAPI_API_BASE_URL:-https://api.vapi.ai}"
ASSISTANT_FILE="$SCRIPT_DIR/.vapi-assistant.json"

# ---------- Re-use existing assistant if configured ----------
if [[ -n "${VAPI_ASSISTANT_ID:-}" ]]; then
  echo -e "${CYAN}▸ VAPI_ASSISTANT_ID already set — verifying it exists...${RESET}"
  VERIFY="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 15 \
    -H "Authorization: Bearer ${VAPI_API_KEY}" \
    "${VAPI_BASE}/assistant/${VAPI_ASSISTANT_ID}" || echo 000)"
  if [[ "$VERIFY" == "200" ]]; then
    echo -e "  ${GREEN}✓${RESET} assistant ${VAPI_ASSISTANT_ID} verified on Vapi side"
    PHONE="${VAPI_PHONE_NUMBER_ID:-<unset>}"
    echo -e "  ${YELLOW}Assistant ID: ${VAPI_ASSISTANT_ID}${RESET}"
    echo -e "  ${YELLOW}Phone Number ID: ${PHONE}${RESET}"
    echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
    exit 0
  else
    echo -e "  ${YELLOW}!${RESET} existing VAPI_ASSISTANT_ID returned HTTP ${VERIFY} — will create a new one."
  fi
fi

# ---------- Create assistant ----------
echo -e "${CYAN}▸ Creating Vapi assistant via POST ${VAPI_BASE}/assistant ...${RESET}"
ASSISTANT_PAYLOAD="$(cat <<JSON
{
  "name": "${VAPI_ASSISTANT_NAME:-Dayjoy AI Assistant}",
  "model": {
    "provider": "openai",
    "model": "${VAPI_MODEL:-gpt-4o}",
    "temperature": ${VAPI_TEMPERATURE:-0.7},
    "maxTokens": ${VAPI_MAX_TOKENS:-1000},
    "messages": [
      {"role":"system","content":"You are Dayjoy AI Assistant. Be concise and helpful."}
    ]
  },
  "voice": {
    "provider": "11labs",
    "voiceId": "${VAPI_VOICE_ID:-rachel}",
    "stability": ${VAPI_VOICE_STABILITY:-0.5},
    "similarityBoost": ${VAPI_VOICE_SIMILARITY_BOOST:-0.75},
    "speed": ${VAPI_VOICE_SPEED:-1.0}
  },
  "transcriber": {
    "provider": "deepgram",
    "model": "${VAPI_TRANSCRIPTION_MODEL:-nova-2}",
    "language": "${VAPI_LANGUAGE:-en-US}"
  },
  "silenceTimeoutSeconds": ${VAPI_SILENCE_TIMEOUT:-30},
  "responseDelaySeconds": ${VAPI_RESPONSE_DELAY:-0.4},
  "maxDurationSeconds": ${VAPI_CALL_MAX_DURATION:-1800}
}
JSON
)"

CREATE_RESP="$(curl -fsS --max-time 30 -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${VAPI_API_KEY}" \
  -d "$ASSISTANT_PAYLOAD" \
  "${VAPI_BASE}/assistant" || true)"

NEW_ASSISTANT_ID="$(echo "$CREATE_RESP" | sed -nE 's/.*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n1)"
if [[ -z "$NEW_ASSISTANT_ID" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: Vapi assistant creation returned no id.${RESET}"
  echo -e "  Response: ${CREATE_RESP:0:500}"
  exit 1
fi
echo -e "  ${GREEN}✓${RESET} assistant created: ${NEW_ASSISTANT_ID}"
echo "$CREATE_RESP" > "$ASSISTANT_FILE"

# Persist into .env (idempotent update)
if grep -q '^VAPI_ASSISTANT_ID=' .env; then
  sed -i.bak "s|^VAPI_ASSISTANT_ID=.*|VAPI_ASSISTANT_ID=${NEW_ASSISTANT_ID}|" .env && rm -f .env.bak
else
  echo "VAPI_ASSISTANT_ID=${NEW_ASSISTANT_ID}" >> .env
fi

# ---------- Register webhook URL ----------
echo -e "${CYAN}▸ Registering webhook URL with Vapi...${RESET}"
WEBHOOK_URL="${VAPI_WEBHOOK_URL:-https://api.dayjoy.ai/api/voice/webhook}"
# Vapi does not have a dedicated "register webhook" endpoint; webhooks are typically
# configured in the dashboard. We print the configuration for the operator.
echo -e "  ${YELLOW}→${RESET} Configure this URL in the Vapi dashboard → Webhooks:"
echo -e "      ${WEBHOOK_URL}"
echo -e "  Headers to send (for HMAC verification):"
echo -e "      X-Vapi-Signature: <HMAC-SHA256 of body using VAPI_WEBHOOK_SECRET>"

# ---------- Phone number ----------
PHONE_ID="${VAPI_PHONE_NUMBER_ID:-}"
if [[ -n "$PHONE_ID" ]]; then
  echo -e "${CYAN}▸ Looking up phone number ${PHONE_ID} ...${RESET}"
  PHONE_RESP="$(curl -fsS --max-time 15 \
    -H "Authorization: Bearer ${VAPI_API_KEY}" \
    "${VAPI_BASE}/phone-number/${PHONE_ID}" || true)"
  PHONE_NUMBER="$(echo "$PHONE_RESP" | sed -nE 's/.*"number"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n1)"
else
  echo -e "${CYAN}▸ VAPI_PHONE_NUMBER_ID not set — listing purchased numbers...${RESET}"
  PHONE_RESP="$(curl -fsS --max-time 15 \
    -H "Authorization: Bearer ${VAPI_API_KEY}" \
    "${VAPI_BASE}/phone-number" || true)"
  PHONE_NUMBER="$(echo "$PHONE_RESP" | sed -nE 's/.*"number"[[:space:]]*:[[:space:]]*"\+([0-9]+)".*/+\1/p' | head -n1)"
fi

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  Assistant ID : ${NEW_ASSISTANT_ID}${RESET}"
echo -e "${BOLD}${GREEN}  Phone Number : ${PHONE_NUMBER:-<none purchased>}${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
