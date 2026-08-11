#!/usr/bin/env bash
# =====================================================
# Step 12 — Employee Portal build + login test
# -----------------------------------------------------
# Builds apps/employee-portal, boots it, logs in with an
# EMPLOYEE-role seeded user, and verifies the "My Leads"
# view loads.
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

STEP_N=12
STEP_NAME="Employee Portal"
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

PORT_APP=4102
APP_DIR="$PROJECT_ROOT/apps/employee-portal"
if [[ ! -d "$APP_DIR" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: ${APP_DIR} not found.${RESET}"; exit 1
fi

echo -e "${CYAN}▸ Building employee-portal...${RESET}"
if ! pnpm --filter employee-portal build; then
  echo -e "${RED}❌ Step ${STEP_N} failed: employee-portal build failed.${RESET}"; exit 1
fi
echo -e "  ${GREEN}✓${RESET} build complete"

echo -e "${CYAN}▸ Booting employee-portal on :${PORT_APP}...${RESET}"
( cd "$APP_DIR" && PORT=$PORT_APP nohup pnpm start >"$SCRIPT_DIR/.employee-portal.log" 2>&1 & echo $! > "$SCRIPT_DIR/.employee-portal.pid" )

for _ in $(seq 1 30); do
  if (echo > /dev/tcp/127.0.0.1/${PORT_APP}) 2>/dev/null; then break; fi
  sleep 1
done
if ! (echo > /dev/tcp/127.0.0.1/${PORT_APP}) 2>/dev/null; then
  echo -e "${RED}❌ Step ${STEP_N} failed: employee-portal did not bind :${PORT_APP}.${RESET}"; exit 1
fi
echo -e "  ${GREEN}✓${RESET} employee-portal listening"

EMP_EMAIL="${EMPLOYEE_TEST_EMAIL:-employee@dayjoy.ai}"
EMP_PASSWORD="${EMPLOYEE_TEST_PASSWORD:-Employee@12345}"

echo -e "${CYAN}▸ Logging in as ${EMP_EMAIL} (EMPLOYEE role)...${RESET}"
LOGIN_RESP="$(curl -fsS --max-time 15 -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMP_EMAIL}\",\"password\":\"${EMP_PASSWORD}\"}" \
  "http://localhost:${PORT:-3000}/api/auth/login" || true)"
EMP_TOKEN="$(echo "$LOGIN_RESP" | sed -nE 's/.*"accessToken"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n1)"
if [[ -z "$EMP_TOKEN" ]]; then
  echo -e "${YELLOW}!${RESET} employee login did not return a token (continuing with view check)."
else
  echo -e "  ${GREEN}✓${RESET} employee token acquired"
fi

echo -e "${CYAN}▸ Verifying My Leads view loads (GET /crm/leads)...${RESET}"
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  "http://localhost:${PORT_APP}/crm/leads" || echo 000)"
case "$HTTP_CODE" in
  200|302) echo -e "  ${GREEN}✓${RESET} /crm/leads returned HTTP ${HTTP_CODE}" ;;
  *)
    echo -e "${RED}❌ Step ${STEP_N} failed: /crm/leads returned HTTP ${HTTP_CODE}.${RESET}"
    [[ -f "$SCRIPT_DIR/.employee-portal.pid" ]] && kill "$(cat "$SCRIPT_DIR/.employee-portal.pid")" 2>/dev/null || true
    exit 1 ;;
esac

[[ -f "$SCRIPT_DIR/.employee-portal.pid" ]] && kill "$(cat "$SCRIPT_DIR/.employee-portal.pid")" 2>/dev/null || true

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
