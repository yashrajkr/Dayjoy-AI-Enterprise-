#!/usr/bin/env bash
# =====================================================
# Step 19 — Staging deployment (Kubernetes + Helm)
# -----------------------------------------------------
# Deploys the Dayjoy AI Helm chart to the staging cluster,
# waits for all pods to reach Ready, verifies the ingress
# and TLS certificate, and asserts /health returns 200
# from the public staging URL.
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

STEP_N=19
STEP_NAME="Staging Deployment (K8s + Helm)"
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

HELM_CHART="$PROJECT_ROOT/deployment/kubernetes/helm/dayjoyai"
KUSTOMIZE_DIR="$PROJECT_ROOT/deployment/kubernetes/staging"

# ---------- Prerequisites ----------
for cmd in kubectl helm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo -e "${RED}❌ Step ${STEP_N} failed: '${cmd}' not found on PATH.${RESET}"; exit 1
  fi
done

if ! kubectl cluster-info >/dev/null 2>&1; then
  echo -e "${RED}❌ Step ${STEP_N} failed: kubectl cannot reach a cluster.${RESET}"
  echo -e "  Set KUBECONFIG or run: ${YELLOW}aws eks update-kubeconfig --name <staging-cluster>${RESET}"
  exit 1
fi

STAGING_NS="${STAGING_NAMESPACE:-dayjoy-staging}"
STAGING_DOMAIN="${STAGING_DOMAIN:-staging.dayjoy.ai}"
RELEASE_NAME="${HELM_RELEASE_NAME:-dayjoy}"

# ---------- Deploy via Helm ----------
echo -e "${CYAN}▸ helm upgrade --install ${RELEASE_NAME} ${HELM_CHART} -n ${STAGING_NS}...${RESET}"
kubectl get ns "$STAGING_NS" >/dev/null 2>&1 || kubectl create ns "$STAGING_NS"

VALUES_FILE="$KUSTOMIZE_DIR/values.yaml"
HELM_ARGS=(--install --wait --timeout 10m --namespace "$STAGING_NS")
if [[ -f "$VALUES_FILE" ]]; then
  HELM_ARGS+=(--values "$VALUES_FILE")
fi

if ! helm upgrade "$RELEASE_NAME" "$HELM_CHART" "${HELM_ARGS[@]}"; then
  echo -e "${RED}❌ Step ${STEP_N} failed: helm upgrade exited non-zero.${RESET}"
  echo -e "  Diagnose: ${YELLOW}kubectl -n ${STAGING_NS} describe pod -l app.kubernetes.io/instance=${RELEASE_NAME}${RESET}"
  exit 1
fi
echo -e "  ${GREEN}✓${RESET} helm release ${RELEASE_NAME} deployed"

# ---------- Wait for all pods Ready ----------
echo -e "${CYAN}▸ Waiting for all pods in ${STAGING_NS} to be Ready...${RESET}"
kubectl -n "$STAGING_NS" wait --for=condition=Ready pods --all --timeout=300s
echo -e "  ${GREEN}✓${RESET} all pods Ready"
kubectl -n "$STAGING_NS" get pods -o wide | sed 's/^/    /'

# ---------- Verify ingress + TLS ----------
echo -e "${CYAN}▸ Verifying Ingress + TLS for ${STAGING_DOMAIN}...${RESET}"
if ! kubectl -n "$STAGING_NS" get ingress -o name | grep -q ingress; then
  echo -e "${YELLOW}!${RESET} no Ingress resources found in ${STAGING_NS}"
else
  kubectl -n "$STAGING_NS" get ingress | sed 's/^/    /'
fi

# Wait for TLS cert (cert-manager)
echo -e "${CYAN}▸ Waiting for Certificate to be Ready (cert-manager)...${RESET}"
if kubectl -n "$STAGING_NS" get certificate >/dev/null 2>&1; then
  kubectl -n "$STAGING_NS" wait --for=condition=Ready certificate --all --timeout=180s \
    && echo -e "  ${GREEN}✓${RESET} TLS certificate Ready" \
    || echo -e "  ${YELLOW}!${RESET} certificate did not reach Ready in 180s — check cert-manager logs."
else
  echo -e "  ${YELLOW}!${RESET} no Certificate resource found (TLS may be terminated at ALB)."
fi

# ---------- Verify /health from public URL ----------
echo -e "${CYAN}▸ GET https://${STAGING_DOMAIN}/health ...${RESET}"
for i in $(seq 1 12); do
  HEALTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://${STAGING_DOMAIN}/health" || echo 000)"
  if [[ "$HEALTH_CODE" == "200" ]]; then break; fi
  sleep 5
done

if [[ "$HEALTH_CODE" == "200" ]]; then
  HEALTH_BODY="$(curl -fsS --max-time 15 "https://${STAGING_DOMAIN}/health" || true)"
  if echo "$HEALTH_BODY" | grep -q '"success":true'; then
    echo -e "  ${GREEN}✓${RESET} /health returned 200 + success:true from ${STAGING_DOMAIN}"
  else
    echo -e "  ${YELLOW}!${RESET} /health returned 200 but body missing success:true"
  fi
else
  echo -e "${RED}❌ Step ${STEP_N} failed: https://${STAGING_DOMAIN}/health returned HTTP ${HEALTH_CODE}.${RESET}"
  echo -e "  Check DNS, ALB listeners, and backend pod logs."
  exit 1
fi

echo -e "${GREEN}✅ Step ${STEP_N} complete${RESET}"
exit 0
