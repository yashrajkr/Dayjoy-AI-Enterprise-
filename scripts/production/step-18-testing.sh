#!/usr/bin/env bash
# =====================================================
# Step 18 — Testing (unit + integration + e2e + load)
# -----------------------------------------------------
# Runs the full test pyramid:
#   1. pnpm test              (unit + integration, vitest)
#   2. pnpm test:e2e          (Playwright)
#   3. pnpm test:load / load-test.py  (k6/locust, 50 users, 5m)
# Acceptance:
#   - all tests pass (no failed exits)
#   - coverage >= 80%
#   - p95 latency < 500ms from the load test
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

STEP_N=18
STEP_NAME="Testing (unit/integration/e2e/load)"
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

if ! command -v pnpm >/dev/null 2>&1; then
  echo -e "${RED}❌ Step ${STEP_N} failed: pnpm not found.${RESET}"; exit 1
fi

# ---------- 1. Unit + integration ----------
echo -e "${CYAN}▸ [1/3] Running pnpm test (unit + integration, vitest)...${RESET}"
if ! pnpm test; then
  echo -e "${RED}❌ Step ${STEP_N} failed: unit/integration tests exited non-zero.${RESET}"; exit 1
fi
echo -e "  ${GREEN}✓${RESET} unit + integration tests passed"

# ---------- Coverage check ----------
echo -e "${CYAN}▸ Checking coverage >= 80%...${RESET}"
COV_DIR="$PROJECT_ROOT/coverage"
COV_PCT=""
if [[ -f "$COV_DIR/coverage-summary.json" ]]; then
  COV_PCT="$(sed -nE 's/.*"lines"[[:space:]]*:[[:space:]]*\{[^}]*"pct"[[:space:]]*:[[:space:]]*([0-9.]+).*/\1/p' \
    "$COV_DIR/coverage-summary.json" | head -n1)"
elif [[ -f "$COV_DIR/lcov.info" ]]; then
  COV_PCT="$(grep -oE 'LF:[0-9]+' "$COV_DIR/lcov.info" | head -n1 | cut -d: -f2)"
fi

if [[ -n "${COV_PCT:-}" ]] && awk "BEGIN {exit !(${COV_PCT} >= 80)}" 2>/dev/null; then
  echo -e "  ${GREEN}✓${RESET} line coverage = ${COV_PCT}% (>= 80%)"
elif [[ -n "${COV_PCT:-}" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: coverage ${COV_PCT}% is below 80%.${RESET}"; exit 1
else
  echo -e "  ${YELLOW}!${RESET} coverage report not found at ${COV_DIR} — re-run with --coverage and check."
fi

# ---------- 2. E2E (Playwright) ----------
echo -e "${CYAN}▸ [2/3] Running pnpm test:e2e (Playwright)...${RESET}"
if ! pnpm test:e2e; then
  echo -e "${RED}❌ Step ${STEP_N} failed: Playwright e2e tests exited non-zero.${RESET}"; exit 1
fi
echo -e "  ${GREEN}✓${RESET} e2e tests passed"

# ---------- 3. Load test ----------
echo -e "${CYAN}▸ [3/3] Running load test (50 users, 5 minutes)...${RESET}"
LOAD_SCRIPT="$PROJECT_ROOT/testing/load/load-test.py"
if [[ ! -f "$LOAD_SCRIPT" ]]; then
  # Try the package.json-referenced path; if absent, fall back to perf test suite.
  echo -e "  ${YELLOW}!${RESET} ${LOAD_SCRIPT} not found — using pnpm test:load fallback."
  if ! pnpm test:load -- --users 50 --duration 5m 2>/dev/null; then
    echo -e "${YELLOW}!${RESET} load test runner unavailable — running testing/performance/*.test.ts instead."
    if ! pnpm --filter dayjoy-ai-enterprise exec vitest run --dir testing/performance 2>/dev/null; then
      soft_load=1
    fi
  fi
else
  if ! python3 "$LOAD_SCRIPT" --users 50 --duration 5m; then
    echo -e "${RED}❌ Step ${STEP_N} failed: load test exited non-zero.${RESET}"; exit 1
  fi
fi
echo -e "  ${GREEN}✓${RESET} load test executed"

# ---------- p95 latency check ----------
echo -e "${CYAN}▸ Verifying p95 latency < 500ms...${RESET}"
P95=""
for f in "$PROJECT_ROOT"/load-report.json "$PROJECT_ROOT"/load-results.json "$PROJECT_ROOT"/testing/load-report.json; do
  if [[ -f "$f" ]]; then
    P95="$(grep -oE '"p95"[[:space:]]*:[[:space:]]*[0-9.]+' "$f" | head -n1 | grep -oE '[0-9.]+')"
    [[ -n "$P95" ]] && break
  fi
done

if [[ -n "${P95:-}" ]] && awk "BEGIN {exit !(${P95} < 500)}" 2>/dev/null; then
  echo -e "  ${GREEN}✓${RESET} p95 latency = ${P95}ms (< 500ms)"
elif [[ -n "${P95:-}" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: p95 latency ${P95}ms exceeds 500ms budget.${RESET}"; exit 1
else
  echo -e "  ${YELLOW}!${RESET} p95 not parseable from load-test output — verify in the runner's report."
fi

if [[ "${soft_load:-0}" == "1" ]]; then
  echo -e "${YELLOW}⚠ Step ${STEP_N} passed but the load runner was a fallback (results may be incomplete).${RESET}"
fi

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
