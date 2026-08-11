#!/usr/bin/env bash
# =====================================================================
# Dayjoy AI Enterprise — Database Validation Script
# =====================================================================
# Purpose: Verify that the database is correctly set up and all
#          tables, functions, views, triggers exist.
#
# Usage:   bash database/scripts/validate.sh
# =====================================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(dirname "$SCRIPT_DIR")"

# Load DATABASE_URL
if [ -f "$DB_DIR/.env" ]; then
  set -a
  source "$DB_DIR/.env"
  set +a
elif [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}Error: DATABASE_URL not set and no .env found${NC}"
  exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Dayjoy AI Enterprise — DB Validation${NC}"
echo -e "${GREEN}========================================${NC}"

check() {
  local description="$1"
  local query="$2"
  local expected="$3"

  result=$(psql "$DATABASE_URL" -tAc "$query" 2>/dev/null || echo "ERROR")

  if [ "$result" = "ERROR" ]; then
    echo -e "  ${RED}✗${NC} $description (query failed)"
    FAIL=$((FAIL + 1))
  elif [ "$result" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} $description"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}✗${NC} $description (expected '$expected', got '$result')"
    FAIL=$((FAIL + 1))
  fi
}

check_count() {
  local description="$1"
  local query="$2"
  local min_expected="$3"

  result=$(psql "$DATABASE_URL" -tAc "$query" 2>/dev/null || echo "0")

  if [ "$result" = "ERROR" ] || [ "$result" -lt "$min_expected" ] 2>/dev/null; then
    echo -e "  ${RED}✗${NC} $description (expected >= $min_expected, got $result)"
    FAIL=$((FAIL + 1))
  else
    echo -e "  ${GREEN}✓${NC} $description ($result)"
    PASS=$((PASS + 1))
  fi
}

# --- 1. Extensions ---
echo -e "\n${YELLOW}[1/8] Checking extensions...${NC}"
check "pgcrypto extension" "SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'" "pgcrypto"
check "pg_trgm extension" "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'" "pg_trgm"
check "vector extension" "SELECT extname FROM pg_extension WHERE extname = 'vector'" "vector"
check "citext extension" "SELECT extname FROM pg_extension WHERE extname = 'citext'" "citext"

# --- 2. Tables ---
echo -e "\n${YELLOW}[2/8] Checking tables (expecting 60+)...${NC}"
TABLE_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'" 2>/dev/null)
if [ "$TABLE_COUNT" -ge 60 ] 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} $TABLE_COUNT tables exist"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} Only $TABLE_COUNT tables (expected 60+)"
  FAIL=$((FAIL + 1))
fi

# Spot-check critical tables
for table in tenants users sessions roles permissions role_permissions user_roles audit_logs \
             customers customer_addresses leads lead_sources interactions follow_ups support_tickets appointments \
             distributors orders order_items distributor_commissions shipments \
             products product_categories inventory inventory_transactions product_reviews \
             ai_agents conversations messages ai_memory tool_executions \
             voice_sessions voice_transcripts voice_analytics \
             whatsapp_sessions whatsapp_messages whatsapp_contacts website_chats telephony_calls \
             notification_templates notifications notification_logs notification_preferences \
             workflows workflow_versions workflow_triggers workflow_steps workflow_executions execution_logs scheduled_jobs \
             analytics_events metrics metric_values dashboards dashboard_widgets reports report_schedules web_sessions \
             activity_logs webhook_events integrations tenant_config knowledge_articles compliance_records retention_policies; do
  check "Table '$table' exists" "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '$table'" "1"
done

# --- 3. Indexes ---
echo -e "\n${YELLOW}[3/8] Checking indexes (expecting 100+)...${NC}"
INDEX_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'" 2>/dev/null)
if [ "$INDEX_COUNT" -ge 100 ] 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} $INDEX_COUNT indexes exist"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} Only $INDEX_COUNT indexes (expected 100+)"
  FAIL=$((FAIL + 1))
fi

# --- 4. Functions ---
echo -e "\n${YELLOW}[4/8] Checking functions...${NC}"
for func in trigger_set_updated_at generate_uuid current_tenant_id generate_slug generate_order_number \
            write_audit_log get_customer_ltv get_customer_order_count search_products search_knowledge \
            generate_ticket_number cleanup_expired_sessions get_tenant_stats calculate_lead_score \
            archive_old_conversations validate_order_status_transition audit_trigger_fn; do
  check "Function '$func' exists" "SELECT COUNT(*) FROM pg_proc WHERE proname = '$func' AND pronamespace = 'public'::regnamespace" "1"
done

# --- 5. Views ---
echo -e "\n${YELLOW}[5/8] Checking views...${NC}"
for view in v_active_customers v_distributor_performance v_order_summary v_lead_pipeline \
            v_voice_call_summary v_conversation_summary v_low_stock_products v_user_activity \
            v_daily_revenue v_unread_notifications; do
  check "View '$view' exists" "SELECT COUNT(*) FROM information_schema.views WHERE table_name = '$view' AND table_schema = 'public'" "1"
done

# --- 6. Triggers ---
echo -e "\n${YELLOW}[6/8] Checking triggers (expecting 30+)...${NC}"
TRIGGER_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = 'public'" 2>/dev/null)
if [ "$TRIGGER_COUNT" -ge 30 ] 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} $TRIGGER_COUNT triggers exist"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} Only $TRIGGER_COUNT triggers (expected 30+)"
  FAIL=$((FAIL + 1))
fi

# --- 7. RLS ---
echo -e "\n${YELLOW}[7/8] Checking Row-Level Security...${NC}"
RLS_COUNT=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true" 2>/dev/null)
if [ "$RLS_COUNT" -ge 50 ] 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} $RLS_COUNT tables have RLS enabled"
  PASS=$((PASS + 1))
else
  echo -e "  ${RED}✗${NC} Only $RLS_COUNT tables have RLS (expected 50+)"
  FAIL=$((FAIL + 1))
fi

# --- 8. Seed data ---
echo -e "\n${YELLOW}[8/8] Checking seed data...${NC}"
check_count "Permissions seeded" "SELECT COUNT(*) FROM public.permissions" "20"
check_count "Tenants seeded" "SELECT COUNT(*) FROM public.tenants" "1"
check_count "Users seeded" "SELECT COUNT(*) FROM public.users" "1"
check_count "Roles seeded" "SELECT COUNT(*) FROM public.roles" "4"

# --- Summary ---
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Validation Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "  Passed: ${GREEN}$PASS${NC}"
echo -e "  Failed: ${RED}$FAIL${NC}"

if [ "$FAIL" -eq 0 ]; then
  echo -e "\n${GREEN}✓ All checks passed! Database is ready.${NC}"
  exit 0
else
  echo -e "\n${RED}✗ Some checks failed. Review the output above.${NC}"
  exit 1
fi
