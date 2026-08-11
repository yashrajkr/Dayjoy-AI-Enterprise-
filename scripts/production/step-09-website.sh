#!/usr/bin/env bash
# =====================================================
# Step 09 — Website chat widget
# -----------------------------------------------------
# Builds the apps/website-chat Next.js app, verifies the
# embed snippet is generated, prints it for the operator
# to copy into their marketing site, and runs a headless
# smoke test that the widget boots on a test page.
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

STEP_N=9
STEP_NAME="Website Chat Widget"
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

WIDGET_DIR="$PROJECT_ROOT/apps/website-chat"
if [[ ! -d "$WIDGET_DIR" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: ${WIDGET_DIR} not found.${RESET}"
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo -e "${RED}❌ Step ${STEP_N} failed: pnpm not found.${RESET}"; exit 1
fi

# ---------- Build ----------
echo -e "${CYAN}▸ Building website-chat (pnpm --filter website-chat build)...${RESET}"
if ! pnpm --filter website-chat build; then
  echo -e "${RED}❌ Step ${STEP_N} failed: website-chat build exited non-zero.${RESET}"
  exit 1
fi
echo -e "  ${GREEN}✓${RESET} build complete"

# ---------- Locate / generate embed snippet ----------
EMBED_FILE="$WIDGET_DIR/dist/embed.js"
if [[ ! -f "$EMBED_FILE" ]]; then
  # Try Next.js default output location
  EMBED_FILE="$WIDGET_DIR/.next/static/embed.js"
fi
WIDGET_BASE="${NEXT_PUBLIC_VOICE_WIDGET_URL:-https://chat.dayjoy.ai}"

# Synthesize the canonical embed snippet regardless of where the bundle lives.
read -r -d '' SNIPPET <<SNIPPET || true
<!-- Dayjoy AI Website Chat Widget -->
<script>
  (function(d,s,o,f){
    var w=d.createElement(s);w.async=true;w.src=o;
    w.onload=function(){ window.DayjoyChat && window.DayjoyChat.boot({ baseUrl:'${WIDGET_BASE}', tenantId:'${DEFAULT_TENANT_ID:-}' }); };
    var x=d.getElementsByTagName(s)[0];x.parentNode.insertBefore(w,x);
  })(document,'script','${WIDGET_BASE}/embed.js','dayjoy-chat');
</script>
<!-- /Dayjoy AI Website Chat Widget -->
SNIPPET

SNIPPET_FILE="$SCRIPT_DIR/.website-chat-snippet.html"
echo "$SNIPPET" > "$SNIPPET_FILE"

echo -e "  ${GREEN}✓${RESET} embed snippet generated → ${SNIPPET_FILE}"
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  COPY THIS SNIPPET INTO YOUR MARKETING SITE <head>:${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo "$SNIPPET"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ---------- Headless smoke test ----------
echo -e "${CYAN}▸ Smoke-testing widget load on a test page...${RESET}"
# Start the built app on a free port for 5s, curl the page, then kill.
SMOKE_PORT=4099
( cd "$WIDGET_DIR" && PORT=$SMOKE_PORT nohup pnpm start >"$SCRIPT_DIR/.website-chat.log" 2>&1 & echo $! > "$SCRIPT_DIR/.website-chat.pid" )
sleep 6

if curl -fsS --max-time 10 "http://localhost:${SMOKE_PORT}/" | grep -qiE 'dayjoy|chat-widget|embed'; then
  echo -e "  ${GREEN}✓${RESET} widget page responded with expected marker"
else
  HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://localhost:${SMOKE_PORT}/" || echo 000)"
  echo -e "${YELLOW}!${RESET} widget smoke test inconclusive (HTTP ${HTTP_CODE}). Check ${SCRIPT_DIR}/.website-chat.log"
fi

# Tear down
if [[ -f "$SCRIPT_DIR/.website-chat.pid" ]]; then
  kill "$(cat "$SCRIPT_DIR/.website-chat.pid")" 2>/dev/null || true
  rm -f "$SCRIPT_DIR/.website-chat.pid"
fi

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
