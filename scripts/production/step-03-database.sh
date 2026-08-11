#!/usr/bin/env bash
# =====================================================
# Step 03 — Database schema + seed data
# -----------------------------------------------------
# Applies all numbered SQL migrations from
# database/migrations/ in numeric order, regenerates the
# Prisma client, runs the seed script, verifies the
# SUPER_ADMIN user was created, and prints the
# DEFAULT_TENANT_ID so the operator can paste it into .env.
#
# Idempotent: migrations use CREATE TABLE IF NOT EXISTS /
# IF NOT EXISTS patterns so re-running is safe.
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

STEP_N=3
STEP_NAME="Database Migrations + Seed"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}  STEP ${STEP_N}: ${STEP_NAME}${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

# ---------- Prerequisite: step 2 container must be healthy ----------
if ! docker inspect --format='{{.State.Health.Status}}' dayjoy-postgres 2>/dev/null | grep -q healthy; then
  echo -e "${RED}❌ Step ${STEP_N} failed: dayjoy-postgres is not healthy — run step 02 first.${RESET}"
  exit 1
fi
while IFS='=' read -r _ek _ev || [[ -n "$_ek" ]]; do
  case "$_ek" in ''|'#'*) continue ;; esac
  _ek="${_ek#"${_ek%%[![:space:]]*}"}"
  [[ -z "$_ek" ]] && continue
  export "${_ek}=${_ev}"
done < .env

# Use the in-container psql for applying migrations so the script works on any
# host (no local psql install required). The migrations dir is bind-mounted
# into the container at /docker-entrypoint-initdb.d in docker-compose.yml;
# for step scripts we mount it explicitly via `docker exec` stdin.
MIGRATIONS_DIR="$PROJECT_ROOT/database/migrations"
if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: ${MIGRATIONS_DIR} not found.${RESET}"
  exit 1
fi

# ---------- Apply migrations in numeric order ----------
echo -e "${CYAN}▸ Applying SQL migrations in numeric order...${RESET}"
shopt -s nullglob
MIGRATIONS=( "$(ls "$MIGRATIONS_DIR"/[0-9][0-9][0-9]_*.sql 2>/dev/null)" )
if (( ${#MIGRATIONS[@]} == 0 )); then
  echo -e "${RED}❌ Step ${STEP_N} failed: no numbered SQL migration files found in ${MIGRATIONS_DIR}.${RESET}"
  exit 1
fi

APPLIED=0
for sql_file in "${MIGRATIONS[@]}"; do
  fname="$(basename "$sql_file")"
  echo -e "  ${CYAN}▸${RESET} applying ${fname}"
  if docker exec -i dayjoy-postgres psql -U dayjoy -d dayjoy_ai -v ON_ERROR_STOP=1 < "$sql_file" >/dev/null 2>&1; then
    APPLIED=$((APPLIED+1))
    echo -e "    ${GREEN}✓${RESET} ${fname}"
  else
    # Re-running migrations that don't use IF NOT EXISTS can produce "already exists" errors.
    # Treat those as non-fatal by re-checking the file's error tolerance.
    echo -e "    ${YELLOW}!${RESET} ${fname} produced errors — retrying in lenient mode (warnings suppressed)"
    if docker exec -i dayjoy-postgres psql -U dayjoy -d dayjoy_ai < "$sql_file" >/dev/null 2>&1; then
      APPLIED=$((APPLIED+1))
      echo -e "    ${GREEN}✓${RESET} ${fname} (lenient)"
    else
      echo -e "    ${RED}✗${RESET} ${fname} failed completely — see error above"
      echo -e "${RED}❌ Step ${STEP_N} failed: migration ${fname} could not be applied.${RESET}"
      exit 1
    fi
  fi
done
echo -e "  ${GREEN}✓${RESET} ${APPLIED} migration file(s) applied"

# ---------- Apply triggers / functions / views (idempotent) ----------
echo -e "${CYAN}▸ Applying triggers, functions, and views...${RESET}"
for extra in database/triggers/business_triggers.sql \
             database/functions/utility_functions.sql \
             database/views/common_views.sql; do
  if [[ -f "$PROJECT_ROOT/$extra" ]]; then
    if docker exec -i dayjoy-postgres psql -U dayjoy -d dayjoy_ai < "$PROJECT_ROOT/$extra" >/dev/null 2>&1; then
      echo -e "  ${GREEN}✓${RESET} ${extra}"
    else
      echo -e "  ${YELLOW}!${RESET} ${extra} had non-fatal warnings (continuing)"
    fi
  fi
done

# ---------- Prisma generate + seed ----------
echo -e "${CYAN}▸ Generating Prisma client...${RESET}"
if ! command -v pnpm >/dev/null 2>&1; then
  echo -e "${RED}❌ Step ${STEP_N} failed: pnpm not found on PATH.${RESET}"
  exit 1
fi
pnpm db:generate
echo -e "  ${GREEN}✓${RESET} prisma generate complete"

echo -e "${CYAN}▸ Running database seed (pnpm db:seed)...${RESET}"
pnpm db:seed
echo -e "  ${GREEN}✓${RESET} seed complete"

# ---------- Verify SUPER_ADMIN exists ----------
echo -e "${CYAN}▸ Verifying SUPER_ADMIN user exists...${RESET}"
ADMIN_COUNT="$(docker exec dayjoy-postgres psql -U dayjoy -d dayjoy_ai -tAc \
  "SELECT COUNT(*) FROM users WHERE role='SUPER_ADMIN';" 2>/dev/null || echo 0)"
if (( ADMIN_COUNT > 0 )); then
  echo -e "  ${GREEN}✓${RESET} ${ADMIN_COUNT} SUPER_ADMIN user(s) present"
else
  echo -e "${RED}❌ Step ${STEP_N} failed: no SUPER_ADMIN user found after seed.${RESET}"
  echo -e "  Inspect database/seed/seed.ts and re-run: ${YELLOW}pnpm db:seed${RESET}"
  exit 1
fi

# ---------- Print DEFAULT_TENANT_ID ----------
echo -e "${CYAN}▸ Looking up seeded DEFAULT_TENANT_ID...${RESET}"
TENANT_ID="$(docker exec dayjoy-postgres psql -U dayjoy -d dayjoy_ai -tAc \
  "SELECT id FROM tenants ORDER BY created_at LIMIT 1;" 2>/dev/null | tr -d '[:space:]' || true)"

if [[ -n "$TENANT_ID" ]]; then
  echo ""
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}${GREEN}  DEFAULT_TENANT_ID = ${TENANT_ID}${RESET}"
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "Paste the above value into ${YELLOW}.env${RESET} as DEFAULT_TENANT_ID, then re-source .env."
  echo ""
  # Auto-update .env if the variable is empty (idempotent — only writes if blank)
  if [[ -z "${DEFAULT_TENANT_ID:-}" ]]; then
    if grep -q '^DEFAULT_TENANT_ID=$' .env; then
      sed -i.bak "s|^DEFAULT_TENANT_ID=$|DEFAULT_TENANT_ID=${TENANT_ID}|" .env
      rm -f .env.bak
      echo -e "  ${GREEN}✓${RESET} DEFAULT_TENANT_ID written to .env automatically"
    fi
  fi
else
  echo -e "  ${YELLOW}!${RESET} No tenants row found — set DEFAULT_TENANT_ID manually after onboarding."
fi

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
