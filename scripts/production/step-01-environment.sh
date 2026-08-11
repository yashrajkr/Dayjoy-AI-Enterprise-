#!/usr/bin/env bash
# =====================================================
# Step 01 — Environment Validation
# -----------------------------------------------------
# Validates that a .env file exists at the project root,
# that the most security-critical variables are set
# correctly, and prints a clear "configured vs missing"
# summary before any infrastructure is touched.
#
# Checks performed:
#   - .env file present and loadable
#   - JWT_SECRET >= 64 chars and not the placeholder
#   - SESSION_SECRET >= 32 chars and not the placeholder
#   - ENCRYPTION_KEY is a 32-byte (64-char) hex string
#   - OPENAI_API_KEY starts with "sk-"
#   - DATABASE_URL matches postgres(ql):// scheme
#   - REDIS_URL matches redis(s):// scheme
#   - DEFAULT_TENANT_ID either empty (will be set in step 3)
#     or a valid UUID
#   - BCRYPT_ROUNDS >= 12 in production
#
# Idempotent: re-running only re-validates.
# =====================================================
set -euo pipefail

# ---------- ANSI colours ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ---------- Locate project root ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

STEP_N=1
STEP_NAME="Environment Validation"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}  STEP ${STEP_N}: ${STEP_NAME}${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

# ---------- Source .env ----------
if [[ ! -f .env ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: .env not found at ${PROJECT_ROOT}/.env${RESET}"
  echo -e "  Run: ${YELLOW}cp .env.example .env${RESET} then fill in real values."
  exit 1
fi
while IFS='=' read -r _ek _ev || [[ -n "$_ek" ]]; do
  case "$_ek" in ''|'#'*) continue ;; esac
  _ek="${_ek#"${_ek%%[![:space:]]*}"}"
  [[ -z "$_ek" ]] && continue
  export "${_ek}=${_ev}"
done < .env

ERRORS=0
WARNINGS=0

print_pass() { echo -e "  ${GREEN}✓${RESET} $1"; }
print_fail() { echo -e "  ${RED}✗${RESET} $1"; ERRORS=$((ERRORS+1)); }
print_warn() { echo -e "  ${YELLOW}!${RESET} $1"; WARNINGS=$((WARNINGS+1)); }

echo -e "${CYAN}▸ Validating security-critical environment variables...${RESET}"

# --- JWT_SECRET ---
JWT_SECRET="${JWT_SECRET:-}"
JWT_LEN=${#JWT_SECRET}
if [[ -z "${JWT_SECRET}" ]]; then
  print_fail "JWT_SECRET is empty"
elif [[ "$JWT_SECRET" == "replace-with-min-32-char-secret-key-in-production" ]]; then
  print_fail "JWT_SECRET is still the placeholder — generate with: openssl rand -hex 32"
elif (( JWT_LEN < 64 )); then
  print_fail "JWT_SECRET is only ${JWT_LEN} chars (need >= 64). Generate with: openssl rand -hex 32"
else
  print_pass "JWT_SECRET set (${JWT_LEN} chars)"
fi

# --- SESSION_SECRET ---
SESSION_SECRET="${SESSION_SECRET:-}"
SESSION_LEN=${#SESSION_SECRET}
if [[ -z "${SESSION_SECRET}" ]]; then
  print_fail "SESSION_SECRET is empty"
elif [[ "$SESSION_SECRET" == "replace-with-min-32-char-session-secret" ]]; then
  print_fail "SESSION_SECRET is still the placeholder"
elif (( SESSION_LEN < 32 )); then
  print_fail "SESSION_SECRET is only ${SESSION_LEN} chars (need >= 32)"
else
  print_pass "SESSION_SECRET set (${SESSION_LEN} chars)"
fi

# --- ENCRYPTION_KEY (32-byte hex = 64 chars) ---
ENCRYPTION_KEY="${ENCRYPTION_KEY:-}"
ENC_LEN=${#ENCRYPTION_KEY}
if [[ -z "${ENCRYPTION_KEY}" ]]; then
  print_fail "ENCRYPTION_KEY is empty"
elif [[ "$ENCRYPTION_KEY" == "replace-with-32-byte-hex-key" ]]; then
  print_fail "ENCRYPTION_KEY is still the placeholder"
elif [[ ! "$ENCRYPTION_KEY" =~ ^[0-9a-fA-F]{64}$ ]]; then
  print_fail "ENCRYPTION_KEY must be 64 hex chars (32 bytes). Got ${ENC_LEN} chars."
else
  print_pass "ENCRYPTION_KEY is a valid 32-byte hex string"
fi

# --- OPENAI_API_KEY ---
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  print_fail "OPENAI_API_KEY is empty (RAG + AI features will not work)"
elif [[ "$OPENAI_API_KEY" != sk-* ]]; then
  print_fail "OPENAI_API_KEY must start with 'sk-' (got: ${OPENAI_API_KEY:0:6}...)"
else
  print_pass "OPENAI_API_KEY present and starts with 'sk-'"
fi

echo -e "${CYAN}▸ Validating database + cache URLs...${RESET}"

# --- DATABASE_URL ---
if [[ -z "${DATABASE_URL:-}" ]]; then
  print_fail "DATABASE_URL is empty"
elif [[ ! "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then
  print_fail "DATABASE_URL must start with postgres:// or postgresql://"
else
  print_pass "DATABASE_URL is a valid PostgreSQL connection string"
fi

# --- REDIS_URL ---
if [[ -z "${REDIS_URL:-}" ]]; then
  print_fail "REDIS_URL is empty"
elif [[ ! "$REDIS_URL" =~ ^redis(s)?:// ]]; then
  print_fail "REDIS_URL must start with redis:// or rediss://"
else
  print_pass "REDIS_URL is a valid Redis connection string"
fi

echo -e "${CYAN}▸ Validating optional / production-grade settings...${RESET}"

# --- DEFAULT_TENANT_ID ---
if [[ -z "${DEFAULT_TENANT_ID:-}" ]]; then
  print_warn "DEFAULT_TENANT_ID is empty — Step 3 will print the seeded UUID for you to paste here"
elif [[ ! "$DEFAULT_TENANT_ID" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  print_warn "DEFAULT_TENANT_ID does not look like a UUID (got: ${DEFAULT_TENANT_ID})"
else
  print_pass "DEFAULT_TENANT_ID set to a UUID"
fi

# --- BCRYPT_ROUNDS ---
if [[ -z "${BCRYPT_ROUNDS:-}" ]]; then
  print_warn "BCRYPT_ROUNDS unset — default 12 will be used (set 14 for production)"
elif (( BCRYPT_ROUNDS < 12 )); then
  print_warn "BCRYPT_ROUNDS=${BCRYPT_ROUNDS} is below the recommended minimum of 12"
elif (( BCRYPT_ROUNDS < 14 )); then
  print_warn "BCRYPT_ROUNDS=${BCRYPT_ROUNDS} ok for staging; use 14 for production"
else
  print_pass "BCRYPT_ROUNDS=${BCRYPT_ROUNDS} (production-strength)"
fi

# --- NODE_ENV ---
if [[ "${NODE_ENV:-}" != "production" ]]; then
  print_warn "NODE_ENV='${NODE_ENV:-development}' — set NODE_ENV=production before launch"
else
  print_pass "NODE_ENV=production"
fi

# ---------- Channel credentials (warn, not fail) ----------
echo -e "${CYAN}▸ Checking AI channel credentials (warnings are OK if channel unused)...${RESET}"
[[ -n "${VAPI_API_KEY:-}" ]]       && print_pass "VAPI_API_KEY set"       || print_warn "VAPI_API_KEY missing — voice channel disabled (see step 7)"
[[ -n "${WHATSAPP_TOKEN:-}" ]]     && print_pass "WHATSAPP_TOKEN set"     || print_warn "WHATSAPP_TOKEN missing — WhatsApp channel disabled (see step 8)"
[[ -n "${TWILIO_ACCOUNT_SID:-}" ]] && print_pass "TWILIO_ACCOUNT_SID set" || print_warn "TWILIO_ACCOUNT_SID missing — SMS fallback disabled"
[[ -n "${SMTP_PASSWORD:-}" ]]      && print_pass "SMTP_PASSWORD set"      || print_warn "SMTP_PASSWORD missing — transactional email disabled"
[[ -n "${SENTRY_DSN:-}" ]]         && print_pass "SENTRY_DSN set"         || print_warn "SENTRY_DSN missing — error tracking disabled (see step 16)"

# ---------- Summary ----------
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━ SUMMARY ━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${RED}Errors:   ${ERRORS}${RESET}"
echo -e "  ${YELLOW}Warnings: ${WARNINGS}${RESET}"
echo ""

# ---------- Acceptance check ----------
if (( ERRORS > 0 )); then
  echo -e "${RED}❌ Step ${STEP_N} failed: ${ERRORS} critical env var(s) invalid or missing.${RESET}"
  echo -e "  Fix the errors above, then re-run: ${YELLOW}bash scripts/production/step-01-environment.sh${RESET}"
  exit 1
fi

if (( WARNINGS > 0 )); then
  echo -e "${YELLOW}⚠ Step ${STEP_N} passed with ${WARNINGS} warning(s). Review before continuing.${RESET}"
fi
echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
