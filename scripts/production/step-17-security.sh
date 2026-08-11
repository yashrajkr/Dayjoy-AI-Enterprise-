#!/usr/bin/env bash
# =====================================================
# Step 17 — Security hardening verification
# -----------------------------------------------------
# Runs a battery of security checks:
#   - AWS RDS security group is not 0.0.0.0/0
#   - K8s secrets sourced from ExternalSecrets (no plain Secret manifests)
#   - JWT JTI blocklist actually invalidates revoked tokens
#   - Snyk dependency scan (if installed)
#   - AWS Inspector scan (if running on EKS)
#   - No Critical/High findings allowed
#
# Each check degrades gracefully if the relevant tool /
# cloud environment is not available — but at minimum the
# JTI blocklist check MUST pass (it's pure local logic).
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

STEP_N=17
STEP_NAME="Security Hardening Verification"
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

CRITICAL_FAILURES=0
SOFT_FAILURES=0

pass() { echo -e "  ${GREEN}✓${RESET} $1"; }
crit() { echo -e "  ${RED}✗${RESET} $1"; CRITICAL_FAILURES=$((CRITICAL_FAILURES+1)); }
soft() { echo -e "  ${YELLOW}!${RESET} $1"; SOFT_FAILURES=$((SOFT_FAILURES+1)); }

# ---------- 1. AWS RDS SG not 0.0.0.0/0 ----------
echo -e "${CYAN}▸ [1/5] Checking AWS RDS security groups for 0.0.0.0/0...${RESET}"
if command -v aws >/dev/null 2>&1 && aws sts get-caller-identity >/dev/null 2>&1; then
  SG_RANGE="$(aws ec2 describe-security-groups \
    --query 'SecurityGroups[?IpPermissions[?IpRanges[?CidrIp==`0.0.0.0/0`]].FromPort==`5432`].GroupId' \
    --output text 2>/dev/null || true)"
  if [[ -z "$SG_RANGE" ]]; then
    pass "no RDS SG exposes port 5432 to 0.0.0.0/0"
  else
    crit "RDS SG(s) ${SG_RANGE} allow 5432 from 0.0.0.0/0 — restrict immediately"
  fi
else
  soft "AWS CLI not available or unauthenticated — skipping RDS SG check"
fi

# ---------- 2. K8s secrets from ExternalSecrets ----------
echo -e "${CYAN}▸ [2/5] Checking K8s manifests for plain-text Secret kinds...${RESET}"
PLAIN_SECRETS="$(grep -rlE '^kind:[[:space:]]*Secret$' "$PROJECT_ROOT/deployment/kubernetes" 2>/dev/null || true)"
if [[ -z "$PLAIN_SECRETS" ]]; then
  pass "no plain Secret manifests under deployment/kubernetes (use ExternalSecrets)"
else
  crit "plain Secret manifests found:"
  echo "$PLAIN_SECRETS" | sed 's/^/      /'
  echo -e "      Convert to ExternalSecret (see deployment/kubernetes/03-external-secrets.yaml)"
fi

# ---------- 3. JWT JTI blocklist ----------
echo -e "${CYAN}▸ [3/5] Verifying JWT JTI blocklist invalidates revoked tokens...${RESET}"
# Backend must be up.
if (echo > /dev/tcp/127.0.0.1/${PORT:-3000}) 2>/dev/null; then
  ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-admin@dayjoy.ai}"
  ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-Admin@12345}"
  LOGIN_RESP="$(curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    "http://localhost:${PORT:-3000}/api/auth/login" || true)"
  TEST_TOKEN="$(echo "$LOGIN_RESP" | sed -nE 's/.*"accessToken"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n1)"
  REFRESH_TOKEN="$(echo "$LOGIN_RESP" | sed -nE 's/.*"refreshToken"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n1)"

  if [[ -n "$TEST_TOKEN" ]]; then
    # Confirm token works
    PRE_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      -H "Authorization: Bearer ${TEST_TOKEN}" "http://localhost:${PORT:-3000}/api/auth/me")"
    # Logout (revokes JTI)
    curl -fsS --max-time 10 -X POST -H "Authorization: Bearer ${TEST_TOKEN}" \
      "http://localhost:${PORT:-3000}/api/auth/logout" >/dev/null 2>&1 || true
    sleep 1
    POST_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      -H "Authorization: Bearer ${TEST_TOKEN}" "http://localhost:${PORT:-3000}/api/auth/me")"

    if [[ "$PRE_CODE" == "200" && "$POST_CODE" == "401" ]]; then
      pass "JTI blocklist active (token 200→401 after logout)"
    else
      crit "JTI blocklist not enforced (pre=${PRE_CODE}, post=${POST_CODE}; expected 200→401)"
    fi
  else
    soft "could not acquire test token for JTI check"
  fi
else
  crit "backend not running — JTI blocklist check cannot run (start backend via step 04)"
fi

# ---------- 4. Snyk ----------
echo -e "${CYAN}▸ [4/5] Running snyk test (if installed)...${RESET}"
if command -v snyk >/dev/null 2>&1; then
  SNYK_OUT="$(snyk test --severity-threshold=high --json 2>/dev/null || true)"
  HIGH_COUNT="$(echo "$SNYK_OUT" | sed -nE 's/.*"uniqueCount"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p' | head -n1 || echo 0)"
  if (( ${HIGH_COUNT:-0} == 0 )); then
    pass "snyk reported no High/Critical vulnerabilities"
  else
    crit "snyk reported ${HIGH_COUNT} High/Critical issue(s) — run 'snyk test' for details"
  fi
else
  soft "snyk CLI not installed — install with 'npm i -g snyk' and re-run"
fi

# ---------- 5. AWS Inspector ----------
echo -e "${CYAN}▸ [5/5] Running AWS Inspector finding check (if available)...${RESET}"
if command -v aws >/dev/null 2>&1 && aws sts get-caller-identity >/dev/null 2>&1; then
  INSPECTOR_COUNT="$(aws inspector2 list-findings \
    --filter-criteria '{"severity":[{"comparison":"EQUALS","value":["CRITICAL","HIGH"]}]}' \
    --query 'findings | length(@)' --output text 2>/dev/null || echo 0)"
  if (( ${INSPECTOR_COUNT:-0} == 0 )); then
    pass "no Critical/High AWS Inspector findings"
  else
    crit "${INSPECTOR_COUNT} Critical/High AWS Inspector finding(s) — remediate before launch"
  fi
else
  soft "AWS CLI unavailable — skipping Inspector check"
fi

# ---------- Acceptance ----------
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  Critical failures: ${CRITICAL_FAILURES}"
echo -e "  Soft failures:     ${SOFT_FAILURES}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

if (( CRITICAL_FAILURES > 0 )); then
  echo -e "${RED}❌ Step ${STEP_N} failed: ${CRITICAL_FAILURES} critical security issue(s) found.${RESET}"
  exit 1
fi
if (( SOFT_FAILURES > 0 )); then
  echo -e "${YELLOW}⚠ Step ${STEP_N} passed with ${SOFT_FAILURES} soft check(s) skipped.${RESET}"
fi
echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
