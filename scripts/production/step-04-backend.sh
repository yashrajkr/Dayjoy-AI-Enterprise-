#!/usr/bin/env bash
# =====================================================
# Step 04 — Backend startup + health/auth smoke test
# -----------------------------------------------------
# Starts the NestJS backend in the background, waits for
# port 3000 to accept TCP connections, hits /health,
# verifies the JSON response contains success:true, then
# authenticates against /api/auth/login with the default
# SUPER_ADMIN credentials and prints the access token.
#
# Idempotent: if a backend is already running on :3000,
# the script skips the startup phase and just re-tests.
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

STEP_N=4
STEP_NAME="Backend startup + auth smoke test"
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

# ---------- Prerequisite: step 3 DB must be seeded ----------
if ! docker inspect --format='{{.State.Health.Status}}' dayjoy-postgres 2>/dev/null | grep -q healthy; then
  echo -e "${RED}❌ Step ${STEP_N} failed: dayjoy-postgres not healthy — run steps 02 + 03 first.${RESET}"
  exit 1
fi

BACKEND_PORT="${PORT:-3000}"
BACKEND_PID_FILE="$SCRIPT_DIR/.backend.pid"
BACKEND_LOG_FILE="$SCRIPT_DIR/.backend.log"

# ---------- Helper: wait for a TCP port ----------
wait_for_port() {
  local host="$1" port="$2" timeout="${3:-60}" elapsed=0
  while (( elapsed < timeout )); do
    if (echo > "/dev/tcp/${host}/${port}") 2>/dev/null; then return 0; fi
    sleep 2; elapsed=$((elapsed+2))
  done
  return 1
}

# ---------- Start backend (or reuse existing) ----------
if (echo > "/dev/tcp/127.0.0.1/${BACKEND_PORT}") 2>/dev/null; then
  echo -e "${CYAN}▸ Port ${BACKEND_PORT} already in use — assuming backend is running, skipping startup.${RESET}"
else
  echo -e "${CYAN}▸ Starting backend (pnpm --filter backend dev) in background...${RESET}"
  if ! command -v pnpm >/dev/null 2>&1; then
    echo -e "${RED}❌ Step ${STEP_N} failed: pnpm not found.${RESET}"
    exit 1
  fi
  nohup pnpm --filter backend dev >"$BACKEND_LOG_FILE" 2>&1 &
  echo $! > "$BACKEND_PID_FILE"
  echo -e "  ${GREEN}✓${RESET} backend PID $(cat "$BACKEND_PID_FILE") (logs: ${BACKEND_LOG_FILE})"

  echo -e "${CYAN}▸ Waiting for backend to bind port ${BACKEND_PORT}...${RESET}"
  if ! wait_for_port 127.0.0.1 "$BACKEND_PORT" 90; then
    echo -e "${RED}❌ Step ${STEP_N} failed: backend did not bind :${BACKEND_PORT} within 90s.${RESET}"
    echo -e "  Tail the log: ${YELLOW}tail -100 ${BACKEND_LOG_FILE}${RESET}"
    exit 1
  fi
  echo -e "  ${GREEN}✓${RESET} backend is accepting connections on :${BACKEND_PORT}"
fi

# ---------- Health check ----------
echo -e "${CYAN}▸ GET http://localhost:${BACKEND_PORT}/health ...${RESET}"
HEALTH_BODY="$(curl -fsS --max-time 10 "http://localhost:${BACKEND_PORT}/health" || true)"
if echo "$HEALTH_BODY" | grep -q '"success":true'; then
  echo -e "  ${GREEN}✓${RESET} /health returned success:true"
else
  echo -e "${RED}❌ Step ${STEP_N} failed: /health did not return success:true.${RESET}"
  echo -e "  Response body: ${HEALTH_BODY:-<empty>}"
  exit 1
fi

# ---------- Auth smoke test ----------
echo -e "${CYAN}▸ Authenticating as SUPER_ADMIN via /api/auth/login ...${RESET}"
# Default seeded credentials — see database/seed/seed.ts. Override via env if rotated.
ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-admin@dayjoy.ai}"
ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-Admin@12345}"

LOGIN_PAYLOAD="$(cat <<JSON
{"email":"${ADMIN_EMAIL}","password":"${ADMIN_PASSWORD}"}
JSON
)"

LOGIN_RESPONSE="$(curl -fsS --max-time 15 -X POST \
  -H 'Content-Type: application/json' \
  -d "$LOGIN_PAYLOAD" \
  "http://localhost:${BACKEND_PORT}/api/auth/login" || true)"

ACCESS_TOKEN="$(echo "$LOGIN_RESPONSE" | sed -nE 's/.*"accessToken"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' || true)"
if [[ -z "$ACCESS_TOKEN" ]]; then
  # Try alternate field name used by some auth shapes
  ACCESS_TOKEN="$(echo "$LOGIN_RESPONSE" | sed -nE 's/.*"access_token"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' || true)"
fi

if [[ -n "$ACCESS_TOKEN" ]]; then
  echo -e "  ${GREEN}✓${RESET} login succeeded — access token acquired (${#ACCESS_TOKEN} chars)"
  echo -e "  ${YELLOW}ACCESS_TOKEN=${ACCESS_TOKEN:0:24}... (truncated)${RESET}"
  echo "$ACCESS_TOKEN" > "$SCRIPT_DIR/.admin-token"
else
  echo -e "${RED}❌ Step ${STEP_N} failed: login did not return an accessToken.${RESET}"
  echo -e "  Used email: ${ADMIN_EMAIL}"
  echo -e "  Response: ${LOGIN_RESPONSE:-<empty>}"
  echo -e "  If credentials were rotated, set SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env."
  exit 1
fi

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
