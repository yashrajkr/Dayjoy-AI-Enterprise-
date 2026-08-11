/**
 * WhatsApp AI Configuration.
 *
 * Reads the `WHATSAPP_*` environment variables at module-eval time and
 * exposes them through a typed {@link WhatsAppConfig} object. The
 * values are populated from `process.env` so they are available
 * immediately on import — and re-read lazily by
 * `WhatsAppConfigService.getConfig()` so tests / ops can hot-swap a
 * token via `process.env.WHATSAPP_TOKEN = '...'` without restarting.
 *
 * Required env vars (production):
 *   WHATSAPP_TOKEN                  — Meta System-User access token
 *   WHATSAPP_PHONE_NUMBER_ID        — Phone Number ID from the Meta App dashboard
 *   WHATSAPP_BUSINESS_ACCOUNT_ID    — WABA id (used for media + management API)
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN   — Random string configured in the Meta dashboard
 *   WHATSAPP_APP_SECRET             — App Secret used to sign webhook payloads (HMAC-SHA256)
 *
 * Optional:
 *   WHATSAPP_API_VERSION            — Graph API version (default: v21.0)
 *   WHATSAPP_API_BASE_URL           — Override Graph API host (default: https://graph.facebook.com)
 *   WHATSAPP_DEFAULT_TENANT_ID      — Tenant to attach conversations to when the
 *                                     inbound number can't be mapped to a tenant.
 *   WHATSAPP_DEFAULT_AGENT_ID       — AiAgent id to attach conversations to (overrides
 *                                     the WHATSAPP-type agent auto-resolution).
 */

/** Meta Graph API versioning. */
export interface WhatsAppApiConfig {
  /** Graph API version string, e.g. `v21.0`. */
  version: string;
  /** Graph API base URL, e.g. `https://graph.facebook.com`. */
  baseUrl: string;
}

/** Webhook configuration. */
export interface WhatsAppWebhookConfig {
  /** Random string set in the Meta dashboard — echoed back on GET verify. */
  verifyToken: string;
  /** App Secret used to HMAC-SHA256-sign webhook payloads. NEVER expose client-side. */
  appSecret: string;
}

/** AI pipeline configuration. */
export interface WhatsAppAiConfig {
  /** Default OpenAI model (overridable per-agent via `configuration.model`). */
  model: string;
  /** Sampling temperature (0..2). */
  temperature: number;
  /** Max reply tokens per turn. */
  maxTokens: number;
  /** Last N messages kept in the prompt context window. */
  contextWindow: number;
  /** Hard ceiling on the number of tool-call iterations per turn. */
  maxToolRounds: number;
}

/** Top-level WhatsApp configuration object. */
export interface WhatsAppConfig {
  /** Meta System-User access token. */
  accessToken: string;
  /** Phone Number ID from the Meta dashboard. */
  phoneNumberId: string;
  /** WhatsApp Business Account (WABA) id. */
  businessAccountId: string;
  /** Graph API versioning. */
  api: WhatsAppApiConfig;
  /** Webhook verification + signature. */
  webhook: WhatsAppWebhookConfig;
  /** AI pipeline tuning. */
  ai: WhatsAppAiConfig;
  /** Default tenant id for unmapped inbound numbers. */
  defaultTenantId: string;
  /** Optional override for the AI agent to attach conversations to. */
  defaultAgentId?: string;
}

/**
 * Read a string env var with a fallback.
 */
function readString(name: string, fallback = ''): string {
  const raw = process.env[name];
  return raw === undefined || raw === null || raw === '' ? fallback : raw;
}

/**
 * Read a numeric env var with a fallback. Returns `fallback` when unset
 * or non-parseable.
 */
function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Build the WhatsApp config from `process.env`. Re-invoked on every
 * `WhatsAppConfigService.getConfig()` call so runtime env mutations
 * (e.g. token rotation via ExternalSecrets) are picked up.
 */
export function loadWhatsAppConfig(): WhatsAppConfig {
  return {
    accessToken: readString('WHATSAPP_TOKEN'),
    phoneNumberId: readString('WHATSAPP_PHONE_NUMBER_ID'),
    businessAccountId: readString('WHATSAPP_BUSINESS_ACCOUNT_ID'),

    api: {
      version: readString('WHATSAPP_API_VERSION', 'v21.0'),
      baseUrl: readString(
        'WHATSAPP_API_BASE_URL',
        'https://graph.facebook.com',
      ),
    },

    webhook: {
      verifyToken: readString('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
      appSecret: readString('WHATSAPP_APP_SECRET'),
    },

    ai: {
      model: readString('WHATSAPP_AI_MODEL', 'gpt-4o'),
      temperature: readNumber('WHATSAPP_AI_TEMPERATURE', 0.7),
      maxTokens: readNumber('WHATSAPP_AI_MAX_TOKENS', 1000),
      contextWindow: readNumber('WHATSAPP_AI_CONTEXT_WINDOW', 10),
      maxToolRounds: readNumber('WHATSAPP_AI_MAX_TOOL_ROUNDS', 3),
    },

    defaultTenantId: readString(
      'WHATSAPP_DEFAULT_TENANT_ID',
      readString('DEFAULT_TENANT_ID', 'default'),
    ),
    defaultAgentId:
      readString('WHATSAPP_DEFAULT_AGENT_ID', '') || undefined,
  };
}

/**
 * Validate the supplied WhatsApp config. Returns an array of human-readable
 * error strings (empty when config is sound).
 *
 * Callers (e.g. `WhatsAppConfigService.onModuleInit`) should log warnings
 * rather than crashing — the rest of the app should still boot when
 * WhatsApp is unconfigured, so the feature degrades gracefully.
 */
export function validateWhatsAppConfig(config: WhatsAppConfig): string[] {
  const errors: string[] = [];

  if (!config.accessToken) {
    errors.push(
      'WHATSAPP_TOKEN is not set — outbound WhatsApp messages will fail.',
    );
  }
  if (!config.phoneNumberId) {
    errors.push('WHATSAPP_PHONE_NUMBER_ID is not set — outbound messages will fail.');
  }
  if (!config.webhook.verifyToken) {
    errors.push(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set — Meta webhook verification will fail.',
    );
  }
  if (!config.webhook.appSecret) {
    errors.push(
      'WHATSAPP_APP_SECRET is not set — webhook signatures CANNOT be verified (CRITICAL security risk).',
    );
  }
  if (config.ai.temperature < 0 || config.ai.temperature > 2) {
    errors.push('WHATSAPP_AI_TEMPERATURE must be between 0 and 2.');
  }
  if (config.ai.maxTokens < 1) {
    errors.push('WHATSAPP_AI_MAX_TOKENS must be a positive integer.');
  }
  if (config.ai.contextWindow < 1) {
    errors.push('WHATSAPP_AI_CONTEXT_WINDOW must be a positive integer.');
  }

  return errors;
}
