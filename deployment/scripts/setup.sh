#!/usr/bin/env bash
# Dayjoy AI Enterprise — One-time Setup Script
# Run: bash deployment/scripts/setup.sh
#
# Sets up the complete NestJS + Next.js development environment.
# This script assumes the new monorepo layout (NOT the legacy FastAPI apps/backend/ layout):
#   - backend/                   (NestJS, port 3000)
#   - vapi/                      (Voice AI, port 3001)
#   - whatsapp-ai/               (WhatsApp AI, port 3002)
#   - apps/admin-dashboard/      (Next.js admin dashboard, port 3003)
#   - database/prisma/schema.prisma
#   - docker-compose.yml         (root dev stack: postgres + redis + backend + ...)

set -euo pipefail

CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

echo ""
echo "${CYAN}========================================${RESET}"
echo "${CYAN}  Dayjoy AI Enterprise — Setup${RESET}"
echo "${CYAN}========================================${RESET}"
echo ""

# ===== Check Prerequisites =====
echo "${CYAN}Checking prerequisites...${RESET}"

check_cmd() {
    if command -v "$1" > /dev/null 2>&1; then
        echo "  ${GREEN}✓${RESET} $1 found: $(command -v "$1")"
    else
        echo "  ${RED}✗${RESET} $1 NOT found — please install it"
        exit 1
    fi
}

check_optional() {
    if command -v "$1" > /dev/null 2>&1; then
        echo "  ${GREEN}✓${RESET} $1 found (optional): $(command -v "$1")"
    else
        echo "  ${YELLOW}!${RESET} $1 not found (optional — skipping)"
    fi
}

# Required toolchain: Node + pnpm + Docker Compose (the new NestJS stack)
check_cmd git
check_cmd node
check_cmd pnpm
check_cmd docker
# `docker compose` (v2 plugin) — required, not the legacy `docker-compose` binary
if docker compose version > /dev/null 2>&1; then
    echo "  ${GREEN}✓${RESET} docker compose (v2 plugin) found"
else
    echo "  ${RED}✗${RESET} 'docker compose' subcommand NOT found — please install Docker Compose v2"
    exit 1
fi

# Optional: psql for ad-hoc DB verification (the stack itself runs Postgres in Docker)
check_optional psql
echo ""

# ===== Check Versions =====
echo "${CYAN}Checking versions...${RESET}"

# node --version prints e.g. "v20.18.0" — strip the leading "v" and compare major.
NODE_MAJOR=$(node --version 2>&1 | sed 's/^v//' | cut -d. -f1)
PNPM_VERSION=$(pnpm --version 2>&1)
DOCKER_VERSION=$(docker --version 2>&1 | awk '{print $3}' | tr -d ',')

echo "  Node:    v${NODE_MAJOR}.x (need >= 20)"
echo "  pnpm:    ${PNPM_VERSION} (need >= 9)"
echo "  Docker:  ${DOCKER_VERSION}"
echo ""

if [ "${NODE_MAJOR}" -lt 20 ]; then
    echo "  ${RED}✗${RESET} Node >= 20 is required (found v${NODE_MAJOR})"
    exit 1
fi

PNPM_MAJOR=$(echo "${PNPM_VERSION}" | cut -d. -f1)
if [ "${PNPM_MAJOR}" -lt 9 ]; then
    echo "  ${RED}✗${RESET} pnpm >= 9 is required (found ${PNPM_VERSION})"
    exit 1
fi

# ===== Copy Environment Files =====
echo "${CYAN}Setting up environment files...${RESET}"

# Root .env (consumed by docker-compose.yml + backend via env_file)
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "  ${GREEN}✓${RESET} Created .env from .env.example"
    else
        echo "  ${RED}✗${RESET} .env.example not found at repo root — cannot bootstrap .env"
        exit 1
    fi
else
    echo "  ${YELLOW}!${RESET} .env already exists (skipped)"
fi

# Admin dashboard .env.local (only if the example exists — it is optional)
if [ -f apps/admin-dashboard/.env.example ]; then
    if [ ! -f apps/admin-dashboard/.env.local ]; then
        cp apps/admin-dashboard/.env.example apps/admin-dashboard/.env.local
        echo "  ${GREEN}✓${RESET} Created apps/admin-dashboard/.env.local from .env.example"
    else
        echo "  ${YELLOW}!${RESET} apps/admin-dashboard/.env.local already exists (skipped)"
    fi
else
    echo "  ${YELLOW}!${RESET} apps/admin-dashboard/.env.example not found (skipped — optional)"
fi
echo ""

# ===== Install Dependencies (repo root) =====
echo "${CYAN}Installing monorepo dependencies (pnpm install)...${RESET}"
pnpm install
echo "  ${GREEN}✓${RESET} Dependencies installed"
echo ""

# ===== Generate Prisma Client =====
echo "${CYAN}Generating Prisma client...${RESET}"
pnpm db:generate
echo "  ${GREEN}✓${RESET} Prisma client generated"
echo ""

# ===== Start Infrastructure (Postgres + Redis via Docker Compose) =====
echo "${CYAN}Starting PostgreSQL + Redis (docker compose up -d)...${RESET}"
docker compose up -d postgres redis
echo "  ${GREEN}✓${RESET} Infrastructure services started"
echo ""

# ===== Wait for Postgres (container: dayjoy-postgres) =====
echo "${CYAN}Waiting for PostgreSQL to be ready (dayjoy-postgres)...${RESET}"
POSTGRES_READY=false
for i in {1..30}; do
    if docker exec dayjoy-postgres pg_isready -U dayjoy -d dayjoy_ai > /dev/null 2>&1; then
        echo "  ${GREEN}✓${RESET} PostgreSQL is ready"
        POSTGRES_READY=true
        break
    fi
    echo "  Waiting... ($i/30)"
    sleep 2
done

if [ "${POSTGRES_READY}" != "true" ]; then
    echo "  ${RED}✗${RESET} PostgreSQL did not become ready in 60s"
    echo "  Inspect logs with: docker compose logs postgres"
    exit 1
fi
echo ""

# ===== Run Prisma Migrations =====
echo "${CYAN}Running database migrations (pnpm db:migrate:deploy)...${RESET}"
pnpm db:migrate:deploy
echo "  ${GREEN}✓${RESET} Migrations applied"
echo ""

# ===== Seed Database =====
echo "${CYAN}Seeding database (pnpm db:seed)...${RESET}"
pnpm db:seed || echo "  ${YELLOW}!${RESET} db:seed exited non-zero (may be expected on re-runs)"
echo "  ${GREEN}✓${RESET} Seed step complete"
echo ""

# ===== Done =====
echo "${CYAN}========================================${RESET}"
echo "${GREEN}  ✓ Setup Complete!${RESET}"
echo "${CYAN}========================================${RESET}"
echo ""
echo "Next steps:"
echo "  1. Start the full stack:    ${CYAN}make dev${RESET}"
echo "  2. Or run services separately:"
echo "     Terminal 1: ${CYAN}pnpm --filter backend dev${RESET}"
echo "     Terminal 2: ${CYAN}pnpm --filter admin-dashboard dev${RESET}"
echo "  3. Verify:                  ${CYAN}make verify${RESET}"
echo ""
echo "Services:"
echo "  Backend:         http://localhost:3000/health"
echo "  Admin Dashboard: http://localhost:3003"
echo "  Postgres:        localhost:5432"
echo "  Redis:           localhost:6379"
echo ""
