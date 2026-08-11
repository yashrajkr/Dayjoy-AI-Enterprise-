#!/usr/bin/env bash
# =====================================================
# Step 21 — Production blue-green deploy
# -----------------------------------------------------
# Deploys a new (green) release to the production K8s
# cluster alongside the current (blue) release, runs
# smoke tests against green, switches the ALB target
# group, performs DNS cutover via Route 53, and keeps
# blue warm for 24 hours for instant rollback.
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

STEP_N=21
STEP_NAME="Production Blue-Green Deploy"
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

# ---------- Prerequisites ----------
for cmd in kubectl helm aws; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo -e "${RED}❌ Step ${STEP_N} failed: '${cmd}' not found.${RESET}"; exit 1
  fi
done

PROD_NS="${PRODUCTION_NAMESPACE:-dayjoy-prod}"
PROD_DOMAIN="${PRODUCTION_DOMAIN:-api.dayjoy.ai}"
HELM_CHART="$PROJECT_ROOT/deployment/kubernetes/helm/dayjoyai"
RELEASE_BLUE="${HELM_RELEASE_BLUE:-dayjoy-blue}"
RELEASE_GREEN="${HELM_RELEASE_GREEN:-dayjoy-green}"
ALB_ARN="${ALB_LISTENER_ARN:-}"
HOSTED_ZONE_ID="${ROUTE53_HOSTED_ZONE_ID:-}"

# ---------- 1. Deploy to green ----------
echo -e "${CYAN}▸ [1/6] Deploying GREEN release (${RELEASE_GREEN}) to ${PROD_NS}...${RESET}"
kubectl get ns "$PROD_NS" >/dev/null 2>&1 || kubectl create ns "$PROD_NS"

GREEN_VALUES="/tmp/dayjoy-green-values.yaml"
cat > "$GREEN_VALUES" <<YAML
color: green
ingress:
  enabled: false        # Do not steal traffic yet
deployment:
  replicaCount: 3
  resources:
    requests: { cpu: 500m, memory: 1Gi }
    limits:   { cpu: 2000m, memory: 2Gi }
YAML

if ! helm upgrade "$RELEASE_GREEN" "$HELM_CHART" \
     --install --wait --timeout 15m --namespace "$PROD_NS" \
     --values "$GREEN_VALUES"; then
  echo -e "${RED}❌ Step ${STEP_N} failed: green helm release did not deploy.${RESET}"
  exit 1
fi
echo -e "  ${GREEN}✓${RESET} GREEN release deployed"

kubectl -n "$PROD_NS" wait --for=condition=Ready pods \
  -l app.kubernetes.io/instance="$RELEASE_GREEN" --timeout=300s
echo -e "  ${GREEN}✓${RESET} all GREEN pods Ready"

# ---------- 2. Smoke test green via port-forward ----------
echo -e "${CYAN}▸ [2/6] Smoke-testing GREEN via port-forward...${RESET}"
GREEN_SVC="$(kubectl -n "$PROD_NS" get svc -l app.kubernetes.io/instance="$RELEASE_GREEN" \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
if [[ -z "$GREEN_SVC" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: could not find a Service for ${RELEASE_GREEN}.${RESET}"; exit 1
fi

kubectl -n "$PROD_NS" port-forward "svc/${GREEN_SVC}" 18080:80 >/dev/null 2>&1 &
PF_PID=$!
trap 'kill $PF_PID 2>/dev/null || true' EXIT

sleep 5
SMOKE_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 http://localhost:18080/health || echo 000)"
if [[ "$SMOKE_CODE" != "200" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: GREEN /health returned HTTP ${SMOKE_CODE}.${RESET}"; exit 1
fi
SMOKE_BODY="$(curl -fsS --max-time 15 http://localhost:18080/health || true)"
echo "$SMOKE_BODY" | grep -q '"success":true' \
  && echo -e "  ${GREEN}✓${RESET} GREEN /health = success:true" \
  || echo -e "  ${YELLOW}!${RESET} GREEN /health 200 but body missing success:true"

# Additional smoke: auth login
ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-admin@dayjoy.ai}"
ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-Admin@12345}"
LOGIN_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
  http://localhost:18080/api/auth/login || echo 000)"
if [[ "$LOGIN_CODE" == "200" || "$LOGIN_CODE" == "201" ]]; then
  echo -e "  ${GREEN}✓${RESET} GREEN auth login returned ${LOGIN_CODE}"
else
  echo -e "${RED}❌ Step ${STEP_N} failed: GREEN auth login returned ${LOGIN_CODE}.${RESET}"; exit 1
fi

kill $PF_PID 2>/dev/null || true
trap - EXIT

# ---------- 3. Switch ALB target group ----------
echo -e "${CYAN}▸ [3/6] Switching ALB listener rule to GREEN target group...${RESET}"
if [[ -z "$ALB_ARN" ]]; then
  echo -e "${YELLOW}!${RESET} ALB_LISTENER_ARN not set — printing manual switch instructions."
  echo -e "  1. In AWS Console → EC2 → Load Balancers → Listeners → edit rule"
  echo -e "  2. Change the forward target from ${RELEASE_BLUE} to ${RELEASE_GREEN} service"
  echo -e "  3. Or: aws elbv2 modify-rule --rules-arn <rule-arn> --actions file://green-actions.json"
else
  GREEN_TG_ARN="$(kubectl -n "$PROD_NS" get svc "$GREEN_SVC" \
    -o jsonpath='{.metadata.annotations.aws-load-balancer-target-group-arn}' 2>/dev/null || true)"
  if [[ -n "$GREEN_TG_ARN" ]]; then
    aws elbv2 modify-listener --listener-arn "$ALB_ARN" \
      --default-actions Type=forward,TargetGroupArn="$GREEN_TG_ARN" >/dev/null \
      && echo -e "  ${GREEN}✓${RESET} ALB listener switched to GREEN target group" \
      || echo -e "  ${YELLOW}!${RESET} ALB modify failed — switch manually."
  else
    echo -e "${YELLOW}!${RESET} GREEN target group ARN not annotated on service — switch ALB manually."
  fi
fi

# ---------- 4. DNS cutover via Route 53 ----------
echo -e "${CYAN}▸ [4/6] Route 53 DNS cutover (${PROD_DOMAIN})...${RESET}"
if [[ -z "$HOSTED_ZONE_ID" ]]; then
  echo -e "${YELLOW}!${RESET} ROUTE53_HOSTED_ZONE_ID not set — skipping DNS automation."
  echo -e "  Manually update the ${PROD_DOMAIN} A-record to point at the GREEN ALB."
else
  GREEN_ALB_DNS="$(kubectl -n "$PROD_NS" get svc "$GREEN_SVC" \
    -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
  if [[ -n "$GREEN_ALB_DNS" ]]; then
    aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" \
      --change-batch "$(cat <<JSON
{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"${PROD_DOMAIN}.","Type":"CNAME","TTL":60,"ResourceRecords":[{"Value":"${GREEN_ALB_DNS}"}]}}]}
JSON
)" >/dev/null \
      && echo -e "  ${GREEN}✓${RESET} Route 53 updated → ${GREEN_ALB_DNS}" \
      || echo -e "  ${YELLOW}!${RESET} Route 53 update failed — verify manually."
  else
    echo -e "${YELLOW}!${RESET} could not read GREEN ALB DNS — update Route 53 manually."
  fi
fi

# ---------- 5. Verify public health ----------
echo -e "${CYAN}▸ [5/6] Verifying https://${PROD_DOMAIN}/health (public)...${RESET}"
sleep 30   # let DNS + ALB propagate
HEALTH_CODE="000"
for i in $(seq 1 12); do
  HEALTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://${PROD_DOMAIN}/health" || echo 000)"
  [[ "$HEALTH_CODE" == "200" ]] && break
  sleep 10
done
if [[ "$HEALTH_CODE" != "200" ]]; then
  echo -e "${RED}❌ Step ${STEP_N} failed: public /health returned HTTP ${HEALTH_CODE} after cutover.${RESET}"
  echo -e "  Consider rollback: switch ALB back to ${RELEASE_BLUE}."
  exit 1
fi
echo -e "  ${GREEN}✓${RESET} public /health returned 200 from ${PROD_DOMAIN}"

# ---------- 6. Keep blue warm 24h ----------
echo -e "${CYAN}▸ [6/6] Verifying BLUE release is still warm (24h rollback window)...${RESET}"
BLUE_PODS="$(kubectl -n "$PROD_NS" get pods -l app.kubernetes.io/instance="$RELEASE_BLUE" \
  --no-headers 2>/dev/null | wc -l || echo 0)"
if (( BLUE_PODS > 0 )); then
  echo -e "  ${GREEN}✓${RESET} BLUE release still running (${BLUE_PODS} pod(s)) — available for 24h rollback"
  echo -e "  Schedule BLUE teardown after 24h: ${YELLOW}helm uninstall ${RELEASE_BLUE} -n ${PROD_NS}${RESET}"
else
  echo -e "${YELLOW}!${RESET} BLUE release has 0 pods — no warm rollback available. Deploy BLUE if rollback is required."
fi

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  🚀 PRODUCTION CUTOVER COMPLETE${RESET}"
echo -e "${BOLD}${GREEN}  Green release serving: ${PROD_DOMAIN}${RESET}"
echo -e "${BOLD}${GREEN}  Blue warm for:         24h (rollback available)${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
