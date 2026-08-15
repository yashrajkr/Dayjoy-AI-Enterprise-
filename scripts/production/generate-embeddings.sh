#!/usr/bin/env bash
set -euo pipefail

echo "▸ Dayjoy AI — Embedding Generation Wrapper"
echo ""

# Load .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs 2>/dev/null || true)
fi

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "❌ GEMINI_API_KEY is not set in .env"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgresql://dayjoy:dayjoy@localhost:5432/dayjoy_ai"
  echo "  Using default DATABASE_URL: $DATABASE_URL"
fi

echo "  Database: ${DATABASE_URL%%@*}@****"
echo "  Gemini Key: ${GEMINI_API_KEY:0:10}..."
echo ""

# Check if pg module is available
if ! node -e "require('pg')" 2>/dev/null; then
  echo "⚠ 'pg' module not found. Installing..."
  cd backend && pnpm add pg && cd ..
fi

echo "▸ Running embedding generation..."
node scripts/production/generate-embeddings.mjs

EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Embedding generation complete"
else
  echo "❌ Embedding generation failed (exit code: $EXIT_CODE)"
fi

exit $EXIT_CODE
