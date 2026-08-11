#!/usr/bin/env bash
# Dayjoy AI Enterprise — Verification Script
# Run: bash deployment/scripts/verify.sh
#
# Verifies the NestJS + Next.js monorepo is correctly structured and runnable.
# Exits 0 if all checks pass; 1 if any FAIL. WARNs are non-blocking (require running services).

set -euo pipefail

# Colors
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

# Counters
PASS=0
FAIL=0
WARN=0

# Helpers
check() {
    local name="$1"
    local cmd="$2"
    if eval "$cmd" > /dev/null 2>&1; then
        echo "  ${GREEN}✓ PASS${RESET}  $name"
        PASS=$((PASS + 1))
    else
        echo "  ${RED}✗ FAIL${RESET}  $name"
        FAIL=$((FAIL + 1))
    fi
}

warn() {
    local name="$1"
    local cmd="$2"
    if eval "$cmd" > /dev/null 2>&1; then
        echo "  ${GREEN}✓ PASS${RESET}  $name"
        PASS=$((PASS + 1))
    else
        echo "  ${YELLOW}⚠ WARN${RESET}  $name (may require running services)"
        WARN=$((WARN + 1))
    fi
}

# Version helpers
version_ge() {
    # Returns 0 (true) if $1 (installed major) >= $2 (required major)
    [ "$1" -ge "$2" ] 2>/dev/null
}

echo ""
echo "${CYAN}========================================${RESET}"
echo "${CYAN}  Dayjoy AI Enterprise — Verify${RESET}"
echo "${CYAN}========================================${RESET}"
echo ""

# ===== Toolchain Versions =====
echo "${CYAN}Toolchain Versions${RESET}"
if command -v node > /dev/null 2>&1; then
    NODE_MAJOR=$(node --version 2>&1 | sed 's/^v//' | cut -d. -f1)
    if version_ge "${NODE_MAJOR}" 20; then
        echo "  ${GREEN}✓ PASS${RESET}  Node >= 20 (found v${NODE_MAJOR})"
        PASS=$((PASS + 1))
    else
        echo "  ${RED}✗ FAIL${RESET}  Node >= 20 (found v${NODE_MAJOR})"
        FAIL=$((FAIL + 1))
    fi
else
    echo "  ${RED}✗ FAIL${RESET}  Node not found"
    FAIL=$((FAIL + 1))
fi

if command -v pnpm > /dev/null 2>&1; then
    PNPM_MAJOR=$(pnpm --version 2>&1 | cut -d. -f1)
    if version_ge "${PNPM_MAJOR}" 9; then
        echo "  ${GREEN}✓ PASS${RESET}  pnpm >= 9 (found v${PNPM_MAJOR})"
        PASS=$((PASS + 1))
    else
        echo "  ${RED}✗ FAIL${RESET}  pnpm >= 9 (found v${PNPM_MAJOR})"
        FAIL=$((FAIL + 1))
    fi
else
    echo "  ${RED}✗ FAIL${RESET}  pnpm not found"
    FAIL=$((FAIL + 1))
fi

if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
    echo "  ${GREEN}✓ PASS${RESET}  Docker + Docker Compose v2 available"
    PASS=$((PASS + 1))
else
    echo "  ${RED}✗ FAIL${RESET}  Docker / Docker Compose v2 not available"
    FAIL=$((FAIL + 1))
fi
echo ""

# ===== Repository Structure =====
echo "${CYAN}Repository Structure${RESET}"
check ".gitignore exists"           "test -f .gitignore"
check "README.md exists"            "test -f README.md"
check "LICENSE exists"              "test -f LICENSE"
check "CONTRIBUTING.md exists"      "test -f CONTRIBUTING.md"
check "Makefile exists"             "test -f Makefile"
check "docker-compose.yml exists"   "test -f docker-compose.yml"
check "docker-compose.prod.yml exists" "test -f docker-compose.prod.yml"
check "pnpm-workspace.yaml exists"  "test -f pnpm-workspace.yaml"
check "package.json exists"         "test -f package.json"
check ".env exists at repo root"    "test -f .env"
echo ""

# ===== Backend (NestJS) =====
echo "${CYAN}Backend (NestJS)${RESET}"
check "backend/package.json exists"     "test -f backend/package.json"
check "backend/tsconfig.json exists"    "test -f backend/tsconfig.json"
check "backend/nest-cli.json exists"    "test -f backend/nest-cli.json"
check "backend/main.ts exists"          "test -f backend/main.ts"
check "backend/app.module.ts exists"    "test -f backend/app.module.ts"
check "auth.controller.ts exists"       "test -f backend/auth/auth.controller.ts"
check "backend/Dockerfile exists"       "test -f backend/Dockerfile"
check "backend/vitest.config.ts exists" "test -f backend/vitest.config.ts"
echo ""

# ===== Frontend (Admin Dashboard) =====
echo "${CYAN}Frontend (Admin Dashboard — Next.js)${RESET}"
check "admin-dashboard/package.json exists" "test -f apps/admin-dashboard/package.json"
check "admin-dashboard/tsconfig.json exists" "test -f apps/admin-dashboard/tsconfig.json"
check "admin-dashboard/next.config.ts exists" "test -f apps/admin-dashboard/next.config.ts"
check "admin-dashboard/tailwind.config.ts exists" "test -f apps/admin-dashboard/tailwind.config.ts"
check "admin-dashboard/Dockerfile exists"   "test -f apps/admin-dashboard/Dockerfile"
check "admin-dashboard page.tsx exists"     "test -f apps/admin-dashboard/src/app/page.tsx"
check "admin-dashboard layout.tsx exists"   "test -f apps/admin-dashboard/src/app/layout.tsx"
echo ""

# ===== Docker Compose (root dev stack) =====
echo "${CYAN}Docker${RESET}"
check "docker-compose.yml exists (repo root)" "test -f docker-compose.yml"
check "docker-compose.prod.yml exists"        "test -f docker-compose.prod.yml"
check "backend/Dockerfile exists"             "test -f backend/Dockerfile"
check "vapi/Dockerfile exists"                "test -f vapi/Dockerfile"
check "whatsapp-ai/Dockerfile exists"         "test -f whatsapp-ai/Dockerfile"
echo ""

# ===== Database (Prisma) =====
echo "${CYAN}Database (Prisma)${RESET}"
check "database/prisma/schema.prisma exists" "test -f database/prisma/schema.prisma"
check "database/seed/seed.ts exists"         "test -f database/seed/seed.ts"
check "database/migrations/001_initial.sql exists" "test -f database/migrations/001_initial.sql"
echo ""

# ===== Build Artifact =====
echo "${CYAN}Backend Build${RESET}"
if [ -f backend/dist/main.js ]; then
    echo "  ${GREEN}✓ PASS${RESET}  backend/dist/main.js exists (pre-built)"
    PASS=$((PASS + 1))
else
    echo "  ${CYAN}•${RESET} backend/dist/main.js not found — attempting 'pnpm --filter backend build'..."
    if pnpm --filter backend build > /dev/null 2>&1; then
        if [ -f backend/dist/main.js ]; then
            echo "  ${GREEN}✓ PASS${RESET}  pnpm --filter backend build succeeded (backend/dist/main.js present)"
            PASS=$((PASS + 1))
        else
            echo "  ${RED}✗ FAIL${RESET}  pnpm --filter backend build ran but backend/dist/main.js missing"
            FAIL=$((FAIL + 1))
        fi
    else
        echo "  ${RED}✗ FAIL${RESET}  pnpm --filter backend build failed"
        FAIL=$((FAIL + 1))
    fi
fi
echo ""

# ===== Live Service Checks (requires stack running) =====
echo "${CYAN}Live Service Checks (requires 'make dev' or 'docker compose up')${RESET}"
warn "Backend health endpoint (port 3000)" "curl -sf http://localhost:3000/health > /dev/null"
warn "PostgreSQL reachable (dayjoy-postgres)" "docker exec dayjoy-postgres pg_isready -U dayjoy -d dayjoy_ai > /dev/null"
warn "Redis reachable (dayjoy-redis)"        "docker exec dayjoy-redis redis-cli ping | grep -q PONG"
echo ""

# ===== Summary =====
echo "${CYAN}========================================${RESET}"
echo "  ${GREEN}Passed: $PASS${RESET}"
if [ $WARN -gt 0 ]; then
    echo "  ${YELLOW}Warnings: $WARN${RESET} (live checks — run 'make dev' first)"
fi
if [ $FAIL -gt 0 ]; then
    echo "  ${RED}Failed: $FAIL${RESET}"
fi
echo "${CYAN}========================================${RESET}"
echo ""

if [ $FAIL -gt 0 ]; then
    echo "${RED}❌ Verification FAILED${RESET}"
    echo "Fix the failing items above before proceeding."
    exit 1
else
    echo "${GREEN}✅ Verification PASSED!${RESET}"
    echo "All structural checks passed."
    if [ $WARN -gt 0 ]; then
        echo ""
        echo "${YELLOW}Note: $WARN live service checks were skipped.${RESET}"
        echo "Run 'make dev' (or 'docker compose up -d') and then 'make verify' to check live services."
    fi
    echo ""
    exit 0
fi
