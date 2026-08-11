#!/usr/bin/env bash
# =====================================================
# Step 05 — RAG ingest + retrieval smoke test
# -----------------------------------------------------
# Ingests the knowledge base from packages/knowledge-base/
# into the rag_chunks table (pgvector), verifies the table
# has at least 1500 rows, then issues a test query through
# POST /api/knowledge/query and asserts that returned
# chunks have similarity > 0.7.
#
# Idempotent: ingest deduplicates on document hash.
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

STEP_N=5
STEP_NAME="RAG Ingest + Retrieval Smoke Test"
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

# ---------- Prerequisite: backend must be up ----------
if ! (echo > /dev/tcp/127.0.0.1/${PORT:-3000}) 2>/dev/null; then
  echo -e "${RED}❌ Step ${STEP_N} failed: backend not running on :${PORT:-3000} — run step 04 first.${RESET}"
  exit 1
fi

KB_DIR="$PROJECT_ROOT/packages/knowledge-base"
if [[ ! -d "$KB_DIR" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: knowledge-base dir not found at ${KB_DIR}.${RESET}"
  exit 1
fi

# ---------- Ingest ----------
echo -e "${CYAN}▸ Ingesting knowledge base via pnpm --filter rag ingest...${RESET}"
if ! pnpm --filter rag ingest -- --source packages/knowledge-base/; then
  echo -e "${RED}❌ Step ${STEP_N} failed: RAG ingest command exited non-zero.${RESET}"
  exit 1
fi
echo -e "  ${GREEN}✓${RESET} ingest command completed"

# ---------- Verify row count ----------
echo -e "${CYAN}▸ Counting rows in rag_chunks...${RESET}"
CHUNK_COUNT="$(docker exec dayjoy-postgres psql -U dayjoy -d dayjoy_ai -tAc \
  "SELECT COUNT(*) FROM rag_chunks;" 2>/dev/null | tr -d '[:space:]' || echo 0)"

if (( CHUNK_COUNT >= 1500 )); then
  echo -e "  ${GREEN}✓${RESET} rag_chunks has ${CHUNK_COUNT} rows (>= 1500 threshold)"
else
  echo -e "${RED}❌ Step ${STEP_N} failed: rag_chunks only has ${CHUNK_COUNT} rows (need >= 1500).${RESET}"
  echo -e "  Possible causes: embedding API rate-limited, OpenAI key invalid, or knowledge-base dir empty."
  exit 1
fi

# ---------- Retrieval smoke test ----------
echo -e "${CYAN}▸ Issuing test query: POST /api/knowledge/query ...${RESET}"
TOKEN="$(cat "$SCRIPT_DIR/.admin-token" 2>/dev/null || true)"
if [[ -z "$TOKEN" ]]; then
  echo -e "${YELLOW}!${RESET} no cached admin token — re-running step 04 login inline"
  ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-admin@dayjoy.ai}"
  ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-Admin@12345}"
  LOGIN_RESPONSE="$(curl -fsS --max-time 15 -X POST -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    "http://localhost:${PORT:-3000}/api/auth/login" || true)"
  TOKEN="$(echo "$LOGIN_RESPONSE" | sed -nE 's/.*"accessToken"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p')"
fi

QUERY_PAYLOAD='{"query":"What is the Dayjoy compensation plan for distributors?","topK":5,"minSimilarity":0.7}'
QUERY_RESPONSE="$(curl -fsS --max-time 30 -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "$QUERY_PAYLOAD" \
  "http://localhost:${PORT:-3000}/api/knowledge/query" || true)"

# Extract the highest similarity value from the JSON response (works for common shapes).
MAX_SIM="$(echo "$QUERY_RESPONSE" | \
  grep -oE '"(similarity|score)"[[:space:]]*:[[:space:]]*0\.[0-9]+' | \
  grep -oE '0\.[0-9]+' | sort -rn | head -n1 || true)"

if [[ -z "$MAX_SIM" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: no similarity scores found in response.${RESET}"
  echo -e "  Response: ${QUERY_RESPONSE:0:400}..."
  exit 1
fi

# bash float comparison
if awk "BEGIN {exit !($MAX_SIM > 0.7)}"; then
  echo -e "  ${GREEN}✓${RESET} top chunk similarity = ${MAX_SIM} (>= 0.7)"
else
  echo -e "${RED}❌ Step ${STEP_N} failed: best similarity ${MAX_SIM} is below 0.7 threshold.${RESET}"
  echo -e "  Likely causes: pgvector index not built, wrong embedding model, or knowledge-base not indexed."
  exit 1
fi

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
