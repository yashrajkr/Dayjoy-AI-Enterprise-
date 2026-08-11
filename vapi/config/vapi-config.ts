/**
 * Vapi Configuration
 *
 * Environment variables and settings for the Vapi Voice AI integration.
 *
 * Loaded from process.env at module-eval time. `validateVapiConfig()` can be
 * called at bootstrap to fail-fast when required values are missing.
 */

export interface VapiVoiceConfig {
  provider: '11labs' | 'playht' | 'elevenlabs';
  voiceId: string;
  stability: number;
  similarityBoost: number;
  speed?: number;
}

export interface VapiModelConfig {
  provider: 'openai';
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface VapiTranscriptionConfig {
  provider: 'deepgram' | 'assemblyai';
  model: string;
  language: string;
}

export interface VapiWebhookConfig {
  url: string;
  secret: string;
  events: string[];
}

export interface VapiCallConfig {
  maxDurationSeconds: number;
  recordingEnabled: boolean;
  transcriptionEnabled: boolean;
}

export interface VapiConfig {
  /** Vapi REST API key (from dashboard). */
  apiKey: string;
  /** Vapi REST API base URL. */
  apiBaseUrl: string;
  /** Existing assistant ID to reuse (skip creating a new one). */
  assistantId?: string;
  /** Default voice settings applied to new assistants. */
  voiceAgent: {
    name: string;
    voice: VapiVoiceConfig;
    model: VapiModelConfig;
    transcriptionModel: VapiTranscriptionConfig;
    language: string;
    firstMessage: string;
    voicemailMessage: string;
    silenceTimeoutSeconds: number;
    responseDelaySeconds: number;
    endCallFunctionEnabled: boolean;
    endCallMessage: string;
    backgroundSound: string;
    backchannelingEnabled: boolean;
    backgroundSoundLevel: number;
    endCallPhrases: string[];
  };
  call: VapiCallConfig;
  webhook: VapiWebhookConfig;
}

/**
 * Read a numeric env var with a fallback. Accepts integers + floats; falls
 * back to `fallback` when unset or unparsable.
 */
function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Read a string env var with a fallback.
 */
function readString(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === null || raw === '' ? fallback : raw;
}

/**
 * Default Vapi Configuration. Values are pulled from env vars at module-eval
 * time so they are available immediately on import.
 */
export const DEFAULT_VAPI_CONFIG: VapiConfig = {
  apiKey: readString('VAPI_API_KEY', ''),
  apiBaseUrl: readString('VAPI_API_BASE_URL', 'https://api.vapi.ai'),
  assistantId: readString('VAPI_ASSISTANT_ID', '') || undefined,

  voiceAgent: {
    name: readString('VAPI_ASSISTANT_NAME', 'Dayjoy AI Assistant'),

    voice: {
      provider: '11labs',
      voiceId: readString('VAPI_VOICE_ID', 'rachel'),
      stability: readNumber('VAPI_VOICE_STABILITY', 0.5),
      similarityBoost: readNumber('VAPI_VOICE_SIMILARITY_BOOST', 0.75),
      speed: readNumber('VAPI_VOICE_SPEED', 1.0),
    },

    model: {
      provider: 'openai',
      model: readString('VAPI_MODEL', 'gpt-4o'),
      temperature: readNumber('VAPI_TEMPERATURE', 0.7),
      maxTokens: readNumber('VAPI_MAX_TOKENS', 1000),
    },

    transcriptionModel: {
      provider: 'deepgram',
      model: readString('VAPI_TRANSCRIPTION_MODEL', 'nova-2'),
      language: readString('VAPI_LANGUAGE', 'en-US'),
    },

    language: readString('VAPI_LANGUAGE', 'en-US'),

    firstMessage:
      'Hello! Thanks for calling Dayjoy. This is Sarah, your virtual assistant. How can I help you today?',

    voicemailMessage:
      "Hi! You've reached Dayjoy support. I'm unable to take your call right now, " +
      'but please leave a message and I\'ll get back to you as soon as possible. Thank you!',

    silenceTimeoutSeconds: readNumber('VAPI_SILENCE_TIMEOUT', 30),
    responseDelaySeconds: readNumber('VAPI_RESPONSE_DELAY', 0.4),
    endCallFunctionEnabled: true,
    endCallMessage: 'Thank you for calling Dayjoy. Have a great day!',
    backgroundSound: 'office',
    backchannelingEnabled: true,
    backgroundSoundLevel: 0.0,

    endCallPhrases: [
      'thank you',
      "that's all",
      'goodbye',
      'bye',
      'have a great day',
    ],
  },

  call: {
    maxDurationSeconds: readNumber('VAPI_CALL_MAX_DURATION', 1800),
    recordingEnabled: process.env.VAPI_RECORDING_ENABLED !== 'false',
    transcriptionEnabled: process.env.VAPI_TRANSCRIPTION_ENABLED !== 'false',
  },

  webhook: {
    url: readString('VAPI_WEBHOOK_URL', 'http://localhost:3000/api/voice/webhook'),
    secret: readString('VAPI_WEBHOOK_SECRET', ''),
    events: [
      'call.started',
      'call.ended',
      'call.transcript',
      'function-call',
      'end-of-call-report',
    ],
  },
};

/**
 * Validate the supplied Vapi config. Throws when required values are missing
 * or malformed — callers (e.g. `VapiClientService.onModuleInit`) should
 * catch + log a warning rather than crashing the app, since voice features
 * can degrade gracefully when Vapi is unconfigured.
 */
export function validateVapiConfig(config: VapiConfig): string[] {
  const errors: string[] = [];
  if (!config.apiKey) {
    errors.push('VAPI_API_KEY is not set — Vapi integration will not function.');
  }
  if (!config.webhook.secret) {
    errors.push('VAPI_WEBHOOK_SECRET is not set — webhook signatures cannot be verified.');
  }
  if (config.voiceAgent.model.temperature < 0 || config.voiceAgent.model.temperature > 2) {
    errors.push('VAPI_TEMPERATURE must be between 0 and 2.');
  }
  if (config.voiceAgent.model.maxTokens < 1) {
    errors.push('VAPI_MAX_TOKENS must be a positive integer.');
  }
  return errors;
}

/**
 * Environment variables required (documented for `.env.example`):
 *
 *   VAPI_API_KEY=your_vapi_api_key
 *   VAPI_ASSISTANT_ID=optional_existing_assistant_id
 *   VAPI_VOICE_ID=rachel
 *   VAPI_MODEL=gpt-4o
 *   VAPI_TEMPERATURE=0.7
 *   VAPI_MAX_TOKENS=1000
 *   VAPI_WEBHOOK_URL=https://your-domain.com/api/voice/webhook
 *   VAPI_WEBHOOK_SECRET=your_webhook_secret
 */
