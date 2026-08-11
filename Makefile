.PHONY: help setup dev build test lint typecheck db-reset db-seed docker-up docker-down

help: ## Show this help
        @grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup: ## One-time setup
        bash deployment/scripts/setup.sh

dev: ## Start development servers
        pnpm dev

build: ## Build all packages
        pnpm build

test: ## Run tests
        pnpm test

lint: ## Lint all packages
        pnpm lint

typecheck: ## TypeScript type checking
        pnpm typecheck

db-reset: ## Reset database (drop schema, re-apply Prisma migrations, seed)
	pnpm db:reset

db-seed: ## Seed database
        cd database && npx tsx seed/seed.ts

db-generate: ## Generate Prisma client
        npx prisma generate --schema database/prisma/schema.prisma

db-studio: ## Open Prisma Studio
        npx prisma studio --schema database/prisma/schema.prisma

docker-up: ## Start Docker Compose stack
        docker compose up -d

docker-down: ## Stop Docker Compose stack
        docker compose down

docker-logs: ## Tail Docker logs
        docker compose logs -f

backup: ## Backup database
        bash deployment/scripts/backup-postgres.sh

verify: ## Run verification script
        bash deployment/scripts/verify.sh

clean: ## Remove build artifacts and node_modules
        find . -name 'node_modules' -type d -prune -exec rm -rf {} + 2>/dev/null || true
        find . -name 'dist' -type d -prune -exec rm -rf {} + 2>/dev/null || true
        find . -name '.next' -type d -prune -exec rm -rf {} + 2>/dev/null || true
        find . -name '*.tsbuildinfo' -delete 2>/dev/null || true
