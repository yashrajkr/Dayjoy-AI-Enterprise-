/**
 * Vapi Assistant Configuration
 *
 * Defines the voice, personality, and behaviour of the Dayjoy Voice AI
 * assistant. The exported `VAPI_ASSISTANT_CONFIG` is a complete payload
 * that can be sent directly to `VapiClientService.createAssistant()` —
 * the `messages` and `tools` arrays are populated at runtime by the
 * `VapiAssistantService` from the prompt + tool registry.
 *
 * The legacy `AssistantConfig` / `DEFAULT_ASSISTANT_CONFIG` /
 * `CUSTOMER_SUPPORT_CONFIG` / `SALES_CONFIG` / `BUSINESS_CONFIG` exports
 * are preserved as they are still referenced by the markdown docs and by
 * the `vapi/deployment/` checklist.
 */

import { DEFAULT_VAPI_CONFIG } from './vapi-config';

/**
 * Resolve the human-transfer phone number from env.
 *
 * Reads `VAPI_TRANSFER_PHONE_NUMBER` (a single E.164 number, e.g.
 * `+15551234567`). When set, the assistant is configured with
 * `forwardingPhoneNumbers=[...]` so Vapi can perform a real SIP
 * transfer when the `human_transfer` tool is invoked. When unset,
 * `forwardingPhoneNumbers` is omitted (Vapi will accept the tool call
 * but no transfer happens — the call stays on the line).
 *
 * Used by:
 *   - {@link VAPI_ASSISTANT_CONFIG} (assistant-create payload).
 *   - `VapiHumanTransferTool` (per-call override of the destination).
 */
export function getTransferPhoneNumber(): string | undefined {
  const raw = process.env.VAPI_TRANSFER_PHONE_NUMBER;
  return raw && raw.trim() ? raw.trim() : undefined;
}

/**
 * Resolve the list of forwarding phone numbers for the assistant. Reads
 * `VAPI_TRANSFER_PHONE_NUMBERS` (comma-separated) first, then falls back
 * to `VAPI_TRANSFER_PHONE_NUMBER` (single). Returns `undefined` when
 * neither is set so the field is omitted from the assistant payload.
 */
export function getForwardingPhoneNumbers(): string[] | undefined {
  const list = process.env.VAPI_TRANSFER_PHONE_NUMBERS;
  if (list && list.trim()) {
    const arr = list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (arr.length > 0) return arr;
  }
  const single = getTransferPhoneNumber();
  return single ? [single] : undefined;
}

/**
 * Legacy assistant config shape. Kept for backward compat with the
 * scaffold's docs + deployment checklist. The runtime config is
 * `VAPI_ASSISTANT_CONFIG` below.
 */
export interface AssistantConfig {
  identity: {
    name: string;
    role: string;
    company: string;
  };
  voice: {
    provider: '11labs' | 'playht';
    voiceId: string;
    stability: number;
    similarityBoost: number;
    style?: number;
    useSpeakerBoost?: boolean;
  };
  personality: {
    traits: string[];
    tone: 'professional' | 'friendly' | 'enthusiastic' | 'empathetic';
    speakingStyle: 'conversational' | 'formal' | 'casual';
    pace: 'slow' | 'normal' | 'fast';
  };
  businessRules: {
    maxCallDurationSeconds: number;
    allowInterruptions: boolean;
    silenceTimeoutSeconds: number;
    voicemailEnabled: boolean;
    recordingEnabled: boolean;
  };
  greeting: {
    firstMessage: string;
    voicemailMessage: string;
    holdMusic?: boolean;
  };
  fallback: {
    maxRetries: number;
    retryDelayMs: number;
    escalationTrigger: string[];
    humanTransferEnabled: boolean;
    humanTransferNumber?: string;
  };
}

/**
 * Vapi assistant payload — the complete object sent to the Vapi REST API
 * `POST /assistant` endpoint. `model.messages` and `model.tools` are
 * populated at runtime.
 */
export const VAPI_ASSISTANT_CONFIG: Record<string, any> = {
  name: DEFAULT_VAPI_CONFIG.voiceAgent.name,

  model: {
    provider: DEFAULT_VAPI_CONFIG.voiceAgent.model.provider,
    model: DEFAULT_VAPI_CONFIG.voiceAgent.model.model,
    temperature: DEFAULT_VAPI_CONFIG.voiceAgent.model.temperature,
    maxTokens: DEFAULT_VAPI_CONFIG.voiceAgent.model.maxTokens,
    // `messages` is populated by VapiAssistantService from the prompt
    // constants in `vapi/prompts/`.
    messages: [{ role: 'system', content: '' }],
    // `tools` is populated by VapiAssistantService from the
    // VapiToolRegistry.getToolDefinitions() output.
    tools: [],
  },

  voice: {
    provider: DEFAULT_VAPI_CONFIG.voiceAgent.voice.provider,
    voiceId: DEFAULT_VAPI_CONFIG.voiceAgent.voice.voiceId,
    speed: DEFAULT_VAPI_CONFIG.voiceAgent.voice.speed ?? 1.0,
    stability: DEFAULT_VAPI_CONFIG.voiceAgent.voice.stability,
    similarityBoost: DEFAULT_VAPI_CONFIG.voiceAgent.voice.similarityBoost,
  },

  transcriptionModel: {
    provider: DEFAULT_VAPI_CONFIG.voiceAgent.transcriptionModel.provider,
    model: DEFAULT_VAPI_CONFIG.voiceAgent.transcriptionModel.model,
    language: DEFAULT_VAPI_CONFIG.voiceAgent.transcriptionModel.language,
  },

  firstMessage: DEFAULT_VAPI_CONFIG.voiceAgent.firstMessage,
  silenceTimeoutSeconds: DEFAULT_VAPI_CONFIG.voiceAgent.silenceTimeoutSeconds,
  responseDelaySeconds: DEFAULT_VAPI_CONFIG.voiceAgent.responseDelaySeconds,
  endCallFunctionEnabled: DEFAULT_VAPI_CONFIG.voiceAgent.endCallFunctionEnabled,
  endCallMessage: DEFAULT_VAPI_CONFIG.voiceAgent.endCallMessage,
  backgroundSound: DEFAULT_VAPI_CONFIG.voiceAgent.backgroundSound,
  backchannelingEnabled: DEFAULT_VAPI_CONFIG.voiceAgent.backchannelingEnabled,
  backgroundSoundLevel: DEFAULT_VAPI_CONFIG.voiceAgent.backgroundSoundLevel,

  // When `VAPI_TRANSFER_PHONE_NUMBER` (or `VAPI_TRANSFER_PHONE_NUMBERS`)
  // is set, the assistant is wired to perform a real SIP transfer to the
  // listed number(s) when the `human_transfer` tool is invoked. Without
  // this, the tool records the transfer intent + notifies the support
  // team but the caller is NOT actually transferred — a critical UX
  // gap called out in the Vapi audit (V3).
  ...(getForwardingPhoneNumbers()
    ? { forwardingPhoneNumbers: getForwardingPhoneNumbers() }
    : {}),
};

// =====================================================================
// Legacy assistant configurations — kept for documentation + deployment
// checklist references. Not used by the runtime Vapi payload.
// =====================================================================

export const DEFAULT_ASSISTANT_CONFIG: AssistantConfig = {
  identity: {
    name: 'Sarah',
    role: 'Dayjoy Support Assistant',
    company: 'Dayjoy',
  },
  voice: {
    provider: '11labs',
    voiceId: 'rachel',
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.5,
    useSpeakerBoost: true,
  },
  personality: {
    traits: ['friendly', 'helpful', 'patient', 'knowledgeable', 'empathetic'],
    tone: 'friendly',
    speakingStyle: 'conversational',
    pace: 'normal',
  },
  businessRules: {
    maxCallDurationSeconds: 1800,
    allowInterruptions: true,
    silenceTimeoutSeconds: 30,
    voicemailEnabled: true,
    recordingEnabled: true,
  },
  greeting: {
    firstMessage: VAPI_ASSISTANT_CONFIG.firstMessage,
    voicemailMessage: DEFAULT_VAPI_CONFIG.voiceAgent.voicemailMessage,
    holdMusic: false,
  },
  fallback: {
    maxRetries: 3,
    retryDelayMs: 1000,
    escalationTrigger: [
      'I want to speak to a human',
      'transfer me to a person',
      'this is not helpful',
      "I'm frustrated",
      'complaint',
    ],
    humanTransferEnabled: true,
    humanTransferNumber: '+1234567890',
  },
};

export const CUSTOMER_SUPPORT_CONFIG: AssistantConfig = {
  ...DEFAULT_ASSISTANT_CONFIG,
  identity: {
    name: 'Sarah',
    role: 'Dayjoy Customer Support',
    company: 'Dayjoy',
  },
  personality: {
    ...DEFAULT_ASSISTANT_CONFIG.personality,
    tone: 'empathetic',
    traits: ['patient', 'empathetic', 'helpful', 'solution-oriented'],
  },
};

export const SALES_CONFIG: AssistantConfig = {
  ...DEFAULT_ASSISTANT_CONFIG,
  identity: {
    name: 'Alex',
    role: 'Dayjoy Sales Assistant',
    company: 'Dayjoy',
  },
  voice: {
    ...DEFAULT_ASSISTANT_CONFIG.voice,
    voiceId: 'josh',
  },
  personality: {
    ...DEFAULT_ASSISTANT_CONFIG.personality,
    tone: 'enthusiastic',
    traits: ['enthusiastic', 'persuasive', 'knowledgeable', 'friendly'],
    speakingStyle: 'conversational',
  },
};

export const BUSINESS_CONFIG: AssistantConfig = {
  ...DEFAULT_ASSISTANT_CONFIG,
  identity: {
    name: 'Jordan',
    role: 'Dayjoy Business Development',
    company: 'Dayjoy',
  },
  voice: {
    ...DEFAULT_ASSISTANT_CONFIG.voice,
    voiceId: 'arnold',
  },
  personality: {
    ...DEFAULT_ASSISTANT_CONFIG.personality,
    tone: 'professional',
    traits: ['professional', 'knowledgeable', 'inspiring', 'trustworthy'],
  },
};
