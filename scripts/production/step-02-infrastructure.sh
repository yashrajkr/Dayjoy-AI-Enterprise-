#!/usr/bin/env bash
# =====================================================
# Step 02 — Bring up local infrastructure
# -----------------------------------------------------
# Starts Postgres (pgvector), Redis, and MinIO via
# docker compose, waits for each container's healthcheck
# to report "healthy", and verifies that the pgvector
# extension is installed in the dayjoy_ai database.
#
# Idempotent: safe to re-run; will not tear down data.
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

STEP_N=2
STEP_NAME="Infrastructure (Postgres + Redis + MinIO)"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}  STEP ${STEP_N}: ${STEP_NAME}${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

# ---------- Prerequisite: step 1 must have passed ----------
if [[ ! -f .env ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: .env missing — run step 01 first.${RESET}"
  exit 1
fi
while IFS='=' read -r _ek _ev || [[ -n "$_ek" ]]; do
  case "$_ek" in ''|'#'*) continue ;; esac
  _ek="${_ek#"${_ek%%[![:space:]]*}"}"
  [[ -z "$_ek" ]] && continue
  export "${_ek}=${_ev}"
done < .env

# ---------- Prerequisite: docker available ----------
if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}❌ Step ${STEP_N} failed: 'docker' command not found.${RESET}"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo -e "${RED}❌ Step ${STEP_N} failed: docker daemon not reachable. Start Docker Desktop / dockerd.${RESET}"
  exit 1
fi

echo -e "${CYAN}▸ Bringing up docker compose stack (postgres, redis, minio)...${RESET}"
# Bring up the core infra services. If minio is not present in the compose file,
# docker compose will simply ignore it (we filter explicitly).
SERVICES="postgres redis"
if docker compose config --services 2>/dev/null | grep -q '^minio$'; then
  SERVICES="$SERVICES minio"
else
  echo -e "  ${YELLOW}!${RESET} 'minio' not declared in docker-compose.yml — skipping (S3-compatible storage will be AWS S3 in production)."
fi

docker compose up -d $SERVICES
echo -e "  ${GREEN}✓${RESET} docker compose up -d issued for: $SERVICES"

# ---------- Wait-for-healthy helper ----------
wait_healthy() {
  local container="$1"
  local timeout="${2:-90}"
  local elapsed=0
  echo -e "${CYAN}▸ Waiting for ${container} to become healthy (max ${timeout}s)...${RESET}"
  while (( elapsed < timeout )); do
    local status
    status="$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "missing")"
    case "$status" in
      healthy)
        echo -e "  ${GREEN}✓${RESET} ${container} healthy (after ${elapsed}s)"
        return 0
        ;;
      "missing")
        echo -e "  ${YELLOW}!${RESET} container ${container} not found — treating as optional"
        return 2
        ;;
      unhealthy)
        echo -e "  ${RED}✗${RESET} ${container} is unhealthy"
        return 1
        ;;
      *)
        sleep 2
        elapsed=$((elapsed+2))
        ;;
    esac
  done
  echo -e "  ${RED}✗${RESET} ${container} did not become healthy within ${timeout}s (last status: ${status})"
  return 1
}

FAILED=0
wait_healthy dayjoy-postgres 120 || FAILED=1
wait_healthy dayjoy-redis    60  || FAILED=1
if docker ps --format '{{.Names}}' | grep -q '^dayjoy-minio$'; then
  wait_healthy dayjoy-minio   60  || print_minio_warn=1
fi

if (( FAILED != 0 )); then
  echo -e "${RED}❌ Step ${STEP_N} failed: one or more infra containers did not become healthy.${RESET}"
  echo -e "  Diagnose with: ${YELLOW}docker compose ps${RESET} and ${YELLOW}docker compose logs postgres redis${RESET}"
  exit 1
fi

# ---------- Verify pgvector extension ----------
echo -e "${CYAN}▸ Verifying pgvector extension is installed...${RESET}"
PGVECTOR_OUTPUT="$(docker exec dayjoy-postgres \
  psql -U dayjoy -d dayjoy_ai -tAc "SELECT extname FROM pg_extension WHERE extname='vector';" 2>/dev/null || true)"

if [[ "$PGVECTOR_OUTPUT" == "vector" ]]; then
  echo -e "  ${GREEN}✓${RESET} pgvector extension 'vector' is installed"
else
  echo -e "${CYAN}▸ pgvector not yet installed — creating extension...${RESET}"
  if docker exec dayjoy-postgres psql -U dayjoy -d dayjoy_ai -c "CREATE EXTENSION IF NOT EXISTS vector;"; then
    echo -e "  ${GREEN}✓${RESET} pgvector extension created"
  else
    echo -e "${RED}❌ Step ${STEP_N} failed: could not create pgvector extension.${RESET}"
    echo -e "  Ensure the image is 'pgvector/pgvector:pg15' (see docker-compose.yml)."
    exit 1
  fi
fi

# ---------- Verify Redis connectivity ----------
echo -e "${CYAN}▸ Verifying Redis PING/PONG...${RESET}"
if docker exec dayjoy-redis redis-cli ping | grep -q PONG; then
  echo -e "  ${GREEN}✓${RESET} Redis responded PONG"
else
  echo -e "${RED}❌ Step ${STEP_N} failed: Redis did not respond to PING.${RESET}"
  exit 1
fi

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
