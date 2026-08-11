import { Controller, Get, Header } from '@nestjs/common';
import * as promClient from 'prom-client';

/**
 * A dedicated Prometheus registry. Using a fresh registry (instead of the global
 * `promClient.register`) keeps our metrics isolated from any other library that
 * might populate the default registry, and makes the metrics endpoint output
 * deterministic.
 */
export const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// ----------------------------------------------------------------------------
// Custom business metrics
// ----------------------------------------------------------------------------

/** HTTP request latency histogram, labelled by method, route and status code. */
export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5, 10],
});
register.registerMetric(httpRequestDuration);

/** Total HTTP requests counter, labelled by method, route and status code. */
export const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});
register.registerMetric(httpRequestTotal);

/** RAG retrieval latency histogram, labelled by tenant and agent. */
export const ragQueryDuration = new promClient.Histogram({
  name: 'rag_query_duration_seconds',
  help: 'RAG query duration in seconds',
  labelNames: ['tenant_id', 'agent_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});
register.registerMetric(ragQueryDuration);

/** Voice call duration histogram, labelled by tenant and call outcome. */
export const voiceCallDuration = new promClient.Histogram({
  name: 'voice_call_duration_seconds',
  help: 'Voice call duration in seconds',
  labelNames: ['tenant_id', 'outcome'],
  buckets: [10, 30, 60, 120, 300, 600, 1800],
});
register.registerMetric(voiceCallDuration);

/**
 * Exposes the Prometheus exposition format on `GET /metrics`.
 *
 * The Content-Type header is required so Prometheus' parser picks the right
 * exposition protocol version (0.0.4 text format).
 */
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', register.contentType)
  async metrics(): Promise<string> {
    return register.metrics();
  }
}
