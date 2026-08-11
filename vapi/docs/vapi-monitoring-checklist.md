# Dayjoy Voice AI — Monitoring Checklist

> What to monitor, what to alert on, and how to set up dashboards.
> For incident response procedures, see [`vapi-runbooks.md`](vapi-runbooks.md).

**Version:** 2.0.0  •  **Audience:** SRE + on-call engineers  •  **Last updated:** 2025-01

---

## Table of Contents

1. [Monitoring Stack](#1-monitoring-stack)
2. [Metrics to Track](#2-metrics-to-track)
3. [Alert Thresholds](#3-alert-thresholds)
4. [Dashboard Setup](#4-dashboard-setup)
5. [Log Queries](#5-log-queries)
6. [Synthetic Monitoring](#6-synthetic-monitoring)
7. [SLIs + SLOs](#7-slis--slos)

---

## 1. Monitoring Stack

```
┌──────────────────────────────────────────────────────────────────┐
│                      Voice AI Pod                                 │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  /metrics endpoint (Prometheus format)                   │    │
│  │  • http_requests_total                                   │    │
│  │  • http_request_duration_seconds                         │    │
│  │  • voice_ai_calls_total                                  │    │
│  │  • voice_ai_tool_executions_total                        │    │
│  │  • voice_ai_rag_queries_total                            │    │
│  │  • voice_ai_webhook_signature_failures_total             │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                                │
                                │ scrape (30s)
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Prometheus                                  │
│  • TSDB (30-day retention)                                       │
│  • Recording rules (5-min windows)                               │
│  • Alerting rules (PrometheusRule CRD)                           │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ├───────────────┐
                                │               │
                                ▼               ▼
┌──────────────────────────────────┐  ┌────────────────────────────┐
│           Grafana                 │  │      Alertmanager          │
│  • Dashboards (3)                 │  │  • Routes alerts           │
│  • Alerts via dashboard panels    │  │  • Slack + PagerDuty       │
│  • SLO tracking                   │  │  • Inhibition + silencing  │
└──────────────────────────────────┘  └────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Loki (log aggregation)                      │
│  • JSON logs from all pods                                        │
│  • 30-day retention                                               │
│  • Log queries via LogQL                                          │
└──────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Sentry (error tracking)                     │
│  • Stack traces                                                   │
│  • Source maps                                                    │
│  • Release tracking                                               │
└──────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose | Version |
|-----------|---------|---------|
| Prometheus | Metrics scraping + storage | v2.50+ |
| Grafana | Dashboards + visualisation | v10+ |
| Alertmanager | Alert routing | v0.26+ |
| Loki | Log aggregation | v3+ |
| Sentry | Error tracking | SaaS |

---

## 2. Metrics to Track

### 2.1 Application metrics (custom)

These metrics are emitted by the Voice AI service on `/metrics`:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `voice_ai_calls_total` | counter | `tenant_id`, `direction`, `status` | Total calls initiated/ended |
| `voice_ai_calls_active` | gauge | `tenant_id` | Currently active calls |
| `voice_ai_call_duration_seconds` | histogram | `tenant_id`, `direction` | Call duration |
| `voice_ai_tool_executions_total` | counter | `tool_name`, `success` | Tool execution count |
| `voice_ai_tool_execution_duration_seconds` | histogram | `tool_name` | Tool execution time |
| `voice_ai_rag_queries_total` | counter | `tenant_id`, `success` | RAG query count |
| `voice_ai_rag_query_duration_seconds` | histogram | `tenant_id` | RAG query latency |
| `voice_ai_webhook_events_total` | counter | `event_type`, `success` | Webhook events received |
| `voice_ai_webhook_duration_seconds` | histogram | `event_type` | Webhook processing time |
| `voice_ai_webhook_signature_failures_total` | counter | `reason` | Signature verification failures |
| `voice_ai_escalations_total` | counter | `department`, `reason` | Calls escalated to humans |
| `voice_ai_session_memory_size` | gauge | — | Active sessions in memory |
| `voice_ai_ai_accuracy` | gauge | `tenant_id` | AI accuracy (from QA sampling) |
| `voice_ai_hallucination_rate` | gauge | `tenant_id` | Hallucination rate |

### 2.2 Infrastructure metrics

| Metric | Source | Description |
|--------|--------|-------------|
| `kube_pod_status_phase` | kube-state-metrics | Pod phase |
| `kube_pod_container_status_restarts_total` | kube-state-metrics | Pod restart count |
| `container_cpu_usage_seconds_total` | cAdvisor | CPU usage |
| `container_memory_usage_bytes` | cAdvisor | Memory usage |
| `node_cpu_seconds_total` | node-exporter | Node CPU |
| `node_memory_MemAvailable_bytes` | node-exporter | Node memory |
| `kubelet_running_pod_count` | kubelet | Pods per node |

### 2.3 Database metrics

| Metric | Source | Description |
|--------|--------|-------------|
| `pg_stat_database_xact_commit` | postgres-exporter | Committed transactions |
| `pg_stat_database_xact_rollback` | postgres-exporter | Rolled-back transactions |
| `pg_stat_activity_count` | postgres-exporter | Active connections |
| `pg_database_size_bytes` | postgres-exporter | DB size |
| `pg_stat_user_tables_seq_scan` | postgres-exporter | Sequential scans (bad) |

### 2.4 Redis metrics

| Metric | Source | Description |
|--------|--------|-------------|
| `redis_connected_clients` | redis-exporter | Connected clients |
| `redis_used_memory_bytes` | redis-exporter | Memory usage |
| `redis_keyspace_hits_total` | redis-exporter | Cache hits |
| `redis_keyspace_misses_total` | redis-exporter | Cache misses |
| `redis_evicted_keys_total` | redis-exporter | Evicted keys (memory pressure) |

### 2.5 HTTP metrics

| Metric | Source | Description |
|--------|--------|-------------|
| `http_requests_total` | nginx/istio | Request count by status code |
| `http_request_duration_seconds` | nginx/istio | Request latency |
| `nginx_ingress_controller_request_duration_seconds` | ingress-nginx | Ingress latency |

### 2.6 External dependency metrics

| Metric | Source | Description |
|--------|--------|-------------|
| `voice_ai_vapi_api_duration_seconds` | custom | Vapi API call latency |
| `voice_ai_vapi_api_errors_total` | custom | Vapi API errors |
| `voice_ai_openai_api_duration_seconds` | custom | OpenAI API call latency |
| `voice_ai_openai_api_errors_total` | custom | OpenAI API errors |

---

## 3. Alert Thresholds

### 3.1 Critical alerts (page on-call)

| Alert | Expression | For | Severity |
|-------|------------|-----|----------|
| `VoiceAIHighErrorRate` | `rate(http_requests_total{service="voice-ai",status=~"5.."}[5m]) / rate(http_requests_total{service="voice-ai"}[5m]) > 0.05` | 5m | critical |
| `VoiceAIHighLatency` | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{service="voice-ai"}[5m])) > 2` | 5m | critical |
| `VoiceAIPodNotReady` | `kube_pod_status_ready{namespace="dayjoy-voice-ai",condition="true"} == 0` | 5m | critical |
| `VoiceAIPodRestart` | `rate(kube_pod_container_status_restarts_total{namespace="dayjoy-voice-ai"}[1h]) > 0` | 5m | warning |
| `VoiceAIWebhookSignatureFailures` | `rate(voice_ai_webhook_signature_failures_total[5m]) > 0.05` | 5m | critical |
| `VoiceAIDatabaseDown` | `pg_up == 0` | 1m | critical |
| `VoiceAIRedisDown` | `redis_up == 0` | 1m | critical |
| `VoiceAIVapiAPIErrors` | `rate(voice_ai_vapi_api_errors_total[5m]) > 0.1` | 5m | critical |
| `VoiceAIHighEscalationRate` | `rate(voice_ai_escalations_total[1h]) / rate(voice_ai_calls_total[1h]) > 0.25` | 30m | warning |

### 3.2 Warning alerts (Slack only, business hours)

| Alert | Expression | For | Severity |
|-------|------------|-----|----------|
| `VoiceAILowAccuracy` | `voice_ai_ai_accuracy < 0.80` | 1h | warning |
| `VoiceAIHighHallucination` | `voice_ai_hallucination_rate > 0.05` | 1h | warning |
| `VoiceAIDBConnectionPoolHigh` | `pg_stat_activity_count > 15` | 10m | warning |
| `VoiceAIRedisMemoryHigh` | `redis_used_memory_bytes / redis_memory_max_bytes > 0.8` | 10m | warning |
| `VoiceAISlowTool` | `histogram_quantile(0.95, voice_ai_tool_execution_duration_seconds_bucket) > 2` | 5m | warning |
| `VoiceAISlowRAG` | `histogram_quantile(0.95, voice_ai_rag_query_duration_seconds_bucket) > 2` | 5m | warning |

### 3.3 Alert routing

```yaml
# alertmanager.yml (excerpt)
routes:
  - matchers: ['severity="critical"']
    receiver: pagerduty-voice-ai
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
  - matchers: ['severity="warning"']
    receiver: slack-voice-ai-alerts
    group_wait: 5m
    group_interval: 30m
    repeat_interval: 12h
```

### 3.4 Alert silence / maintenance

During planned maintenance:

```bash
# Silence alerts for 1 hour
amtool silence add \
  --comment "Planned maintenance — DB upgrade" \
  --duration 1h \
  --author "oncall@dayjoy.ai" \
  alertname="VoiceAIDatabaseDown"
```

---

## 4. Dashboard Setup

### 4.1 Dashboard: "Voice AI Overview"

**Purpose:** At-a-glance health of the Voice AI service.

**Panels:**

1. **Stat: Active calls (now)**
   - Query: `voice_ai_calls_active`
2. **Stat: Calls today**
   - Query: `increase(voice_ai_calls_total[24h])`
3. **Stat: Error rate (5m)**
   - Query: `rate(http_requests_total{service="voice-ai",status=~"5.."}[5m]) / rate(http_requests_total{service="voice-ai"}[5m])`
4. **Stat: p95 latency (5m)**
   - Query: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{service="voice-ai"}[5m]))`
5. **Time series: Calls per minute (last 24h)**
   - Query: `rate(voice_ai_calls_total[1m]) * 60`
   - Group by: `direction`
6. **Time series: Call duration (last 24h)**
   - Query: `histogram_quantile(0.95, rate(voice_ai_call_duration_seconds_bucket[5m]))`
7. **Time series: Error rate (last 24h)**
   - Query: `rate(http_requests_total{service="voice-ai",status=~"5.."}[5m])`
8. **Table: Top 10 errors (last 1h)**
   - Loki query: `{app="voice-ai"} |= "error" | json | line_format "{{.message}}"`

### 4.2 Dashboard: "Voice AI Tools"

**Purpose:** Tool execution health.

**Panels:**

1. **Stat: Total tool calls (today)**
2. **Stat: Tool success rate (5m)**
3. **Bar chart: Tool calls by tool name**
4. **Time series: Tool execution duration p95 by tool**
5. **Table: Top 10 failing tool calls**
6. **Heatmap: Tool execution duration over time**

### 4.3 Dashboard: "Voice AI Quality"

**Purpose:** AI quality + customer experience.

**Panels:**

1. **Stat: AI accuracy (last hour)**
2. **Stat: Hallucination rate (last hour)**
3. **Stat: Escalation rate (last hour)**
4. **Stat: Customer satisfaction (last 24h)**
5. **Time series: AI accuracy trend (7 days)**
6. **Time series: Escalations per hour**
7. **Pie chart: Resolution breakdown (resolved / escalated / abandoned)**
8. **Table: Latest 10 escalated calls (with link to transcript)**

### 4.4 Dashboard: "Voice AI Infrastructure"

**Purpose:** Resource usage + scaling.

**Panels:**

1. **Stat: Pod count**
2. **Stat: CPU usage (avg)**
3. **Stat: Memory usage (avg)**
4. **Time series: CPU + memory per pod**
5. **Time series: HPA events**
6. **Time series: DB connection count**
7. **Time series: Redis memory + evictions**
8. **Table: Pod restart history**

### 4.5 Import dashboards

```bash
# Dashboards live in the repo
ls monitoring/grafana/dashboards/

# They're auto-provisioned via the Grafana ConfigMap
kubectl apply -f monitoring/grafana/
```

---

## 5. Log Queries

### 5.1 Loki (LogQL) queries

#### Find errors by severity

```logql
{app="voice-ai",namespace="dayjoy-voice-ai"} |= "error" | json | level="error"
```

#### Trace a single call

```logql
{app="voice-ai"} | json | callId="<call-id>"
```

#### Find slow webhooks

```logql
{app="voice-ai"} | json | durationMs > 2000
| line_format "{{.timestamp}} {{.eventType}} {{.durationMs}}ms {{.callId}}"
```

#### Find signature failures

```logql
{app="voice-ai"} |= "Webhook signature" |= "rejecting"
```

#### Find escalation events

```logql
{app="voice-ai"} |= "escalation" | json
| line_format "{{.timestamp}} {{.callId}} {{.department}} {{.reason}}"
```

### 5.2 kubectl queries

#### Recent ERROR logs (last 5 min)

```bash
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --since=5m | \
  jq -R 'fromjson? | select(.level == "error")'
```

#### Logs for a specific call

```bash
CALL_ID=<call-id>
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --tail=10000 | \
  jq -R "fromjson? | select(.callId == \"$CALL_ID\")"
```

#### Count of errors by type (last hour)

```bash
kubectl logs -n dayjoy-voice-ai -l app=voice-ai --since=1h | \
  jq -R 'fromjson? | select(.level == "error") | .message' | \
  sort | uniq -c | sort -rn | head -20
```

---

## 6. Synthetic Monitoring

### 6.1 Health check probe

Run a synthetic probe every minute from outside the cluster:

```bash
#!/bin/bash
# voice-ai-synthetic-check.sh (run from a monitoring host)

URL="https://api.dayjoy.ai/health/ready"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code} %{time_total}" $URL)
HTTP_CODE=$(echo $RESPONSE | cut -d' ' -f1)
LATENCY=$(echo $RESPONSE | cut -d' ' -f2)

# Push to Pushgateway for Prometheus
echo "voice_ai_synthetic_health $HTTP_CODE" | \
  curl --data-binary @- \
  http://pushgateway.monitoring:9091/metrics/job/voice-ai-synthetic

if [ "$HTTP_CODE" != "200" ]; then
  echo "ALERT: Voice AI health check failed: $HTTP_CODE"
  exit 1
fi
```

### 6.2 End-to-end call test

Schedule a daily synthetic call:

```bash
# Schedule via cron
0 8 * * * /opt/dayjoy/synthetic-call.sh
```

```bash
#!/bin/bash
# synthetic-call.sh

JWT=$(get_jwt_for_service_account)

# Initiate a test call
CALL=$(curl -s -X POST https://api.dayjoy.ai/api/voice/calls \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+15551234567",
    "assistantId": "asst_test_synthetic",
    "metadata": { "synthetic": true }
  }')

CALL_ID=$(echo $CALL | jq -r .sessionId)

# Wait 30 seconds
sleep 30

# End the call
curl -X POST https://api.dayjoy.ai/api/voice/calls/$CALL_ID/end \
  -H "Authorization: Bearer $JWT"

# Verify the call was recorded
sleep 5
STATUS=$(curl -s https://api.dayjoy.ai/api/voice/calls/$CALL_ID \
  -H "Authorization: Bearer $JWT" | jq -r .status)

if [ "$STATUS" != "ended" ]; then
  echo "ALERT: Synthetic call did not end cleanly"
  exit 1
fi
```

### 6.3 Webhook delivery test

Schedule a synthetic webhook every 5 minutes to verify the endpoint
is reachable + signatures verify:

```bash
#!/bin/bash
# webhook-probe.sh

SECRET=$VAPI_WEBHOOK_SECRET
PAYLOAD='{"type":"call.started","call":{"id":"synthetic-$(date +%s)","phoneNumber":"+15551234567","status":"active"}}'
TIMESTAMP=$(date +%s)
SIGNATURE=$(echo -n "${TIMESTAMP}.${PAYLOAD}" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://api.dayjoy.ai/api/voice/webhook \
  -H "Content-Type: application/json" \
  -H "x-vapi-signature: $SIGNATURE" \
  -H "x-vapi-timestamp: $TIMESTAMP" \
  -d "$PAYLOAD")

if [ "$HTTP_CODE" != "200" ]; then
  echo "ALERT: Webhook probe failed: $HTTP_CODE"
  exit 1
fi
```

---

## 7. SLIs + SLOs

### 7.1 Service Level Indicators (SLIs)

| SLI | Definition |
|-----|------------|
| **Availability** | % of HTTP requests returning non-5xx |
| **Latency** | p95 HTTP request duration |
| **Call success rate** | % of calls ending in `ended` (not `failed`) |
| **Tool success rate** | % of tool executions returning success |
| **AI accuracy** | % of sampled calls rated accurate by QA |
| **Webhook delivery** | % of webhooks processed without error |

### 7.2 Service Level Objectives (SLOs)

| SLO | Target | Window |
|-----|--------|--------|
| Availability | 99.9% | 30 days |
| p95 latency | < 2s | 30 days |
| Call success rate | 95% | 30 days |
| Tool success rate | 95% | 30 days |
| AI accuracy | 80% | 7 days |
| Webhook delivery | 99.5% | 30 days |

### 7.3 Error budget

For 99.9% availability over 30 days:
- **Total minutes:** 43,200
- **Error budget:** 43.2 minutes of downtime per month
- **Burn rate alerts:**
  - **1 hour burn:** if we burn > 2% of the monthly budget in 1 hour → page
  - **1 day burn:** if we burn > 10% of the monthly budget in 1 day → page

### 7.4 SLO dashboard

Create a Grafana dashboard that shows:
- Current SLO attainment (per indicator)
- Error budget remaining
- Burn rate (1h + 1d windows)
- Historical SLO attainment (last 12 months)

---

## Appendix: PrometheusRule YAML

The full alert rules are in `vapi/deployment/vapi-kubernetes-manifests.yml`
under the `PrometheusRule` resource. Apply with:

```bash
kubectl apply -f vapi/deployment/vapi-kubernetes-manifests.yml
```

To add a new alert, edit the `PrometheusRule` and re-apply. Validate
with:

```bash
kubectl get prometheusrule voice-ai-alerts -n dayjoy-voice-ai -o yaml
```

---

## Appendix: Useful PromQL queries

```promql
# Calls per minute (last hour)
rate(voice_ai_calls_total[1m]) * 60

# p95 call duration (last 5 min)
histogram_quantile(0.95, sum(rate(voice_ai_call_duration_seconds_bucket[5m])) by (le))

# Error rate (last 5 min)
sum(rate(http_requests_total{service="voice-ai",status=~"5.."}[5m]))
  /
sum(rate(http_requests_total{service="voice-ai"}[5m]))

# Tool success rate by tool (last hour)
sum(rate(voice_ai_tool_executions_total{success="true"}[1h])) by (tool_name)
  /
sum(rate(voice_ai_tool_executions_total[1h])) by (tool_name)

# Top 5 tools by call count (last hour)
topk(5, sum(rate(voice_ai_tool_executions_total[1h])) by (tool_name))

# Avg webhook processing time by event type (last 5 min)
sum(rate(voice_ai_webhook_duration_seconds_sum[5m])) by (event_type)
  /
sum(rate(voice_ai_webhook_duration_seconds_count[5m])) by (event_type)

# Pods not ready
kube_pod_status_ready{namespace="dayjoy-voice-ai",condition="true"} == 0

# DB connection pool usage
pg_stat_activity_count / 20  # 20 = max pool size

# Redis memory usage %
redis_used_memory_bytes / redis_memory_max_bytes * 100
```
