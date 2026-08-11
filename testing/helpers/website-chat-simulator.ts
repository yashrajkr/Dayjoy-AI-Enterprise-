/**
 * Website Chat Widget Simulator
 * ==============================
 *
 * A lightweight in-process simulator that exercises the contract of
 * the Dayjoy Website AI chat widget — the embeddable chat widget that
 * customers see on dayjoy.ai and partner sites.
 *
 * The simulator models:
 *
 *   1. **Widget rendering** — the launcher button, the chat window,
 *      the message list, the input box.
 *   2. **Streaming responses** — server-sent events with token-by-token
 *      deltas, completed-event payload, and cancellation.
 *   3. **Voice input** — Web Speech API (mocked) for voice-to-text.
 *   4. **Guest vs logged-in** — anonymous (session-only) vs
 *      authenticated (persistent history) modes.
 *   5. **Admin controls** — widget title, color, position, voice
 *      toggle, online/offline mode, allowed domains.
 *   6. **Embed** — iframe + postMessage communication + URL-param
 *      config.
 *
 * The simulator is hermetic — no real OpenAI / Postgres / browser
 * APIs are required. All external dependencies are mocked.
 *
 * Reference: `apps/website-chat/` (the production widget app),
 *            `rag/response-pipeline/response-pipeline.service.ts`
 *            (streaming pipeline contract).
 */

import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  citations?: Array<{
    chunkId?: string;
    documentId?: string;
    documentTitle?: string;
    snippet?: string;
    score: number;
  }>;
  streaming?: boolean;
}

export interface WidgetConfig {
  title: string;
  color: string;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  voiceEnabled: boolean;
  online: boolean;
  allowedDomains: string[];
  welcomeMessage: string;
  placeholder: string;
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  title: 'Dayjoy AI Assistant',
  color: '#F97316', // dayjoy orange
  position: 'bottom-right',
  voiceEnabled: true,
  online: true,
  allowedDomains: ['dayjoy.ai', 'localhost'],
  welcomeMessage: "Hi! I'm your Dayjoy AI assistant. How can I help you today?",
  placeholder: 'Type your message...',
};

export interface ChatWidgetOptions {
  config?: Partial<WidgetConfig>;
  /** Logged-in user (null for guest). */
  user?: { id: string; name: string; email: string } | null;
  /** Pre-seed conversation history. */
  messages?: ChatMessage[];
  /** Auto-respond toggle (default: true). */
  autoRespond?: boolean;
  /** Per-domain allow-list check override. */
  domainCheck?: (origin: string) => boolean;
}

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

export function createChatWidgetSimulator(options: ChatWidgetOptions = {}) {
  const config: WidgetConfig = { ...DEFAULT_WIDGET_CONFIG, ...options.config };
  const messages: ChatMessage[] = options.messages ? [...options.messages] : [];
  // `user` is `let` because `login()` mutates it — the `isLoggedIn`
  // and `getUserName` helpers close over the variable, not its value.
  let user = options.user ?? null;
  let autoRespond = options.autoRespond ?? true;
  let isOpen = false;
  let isStreaming = false;
  let activeStreamId: string | null = null;
  let typingIndicator = false;

  // Voice input state (mocked Web Speech API).
  let voiceRecording = false;
  let voiceTranscript = '';

  // PostMessage log (for embed tests).
  const postMessageLog: Array<{ origin: string; data: unknown }> = [];

  // Streaming chunks emitted by the current response.
  const streamChunks: string[] = [];

  // ---------------------------------------------------------------------------
  // Widget rendering
  // ---------------------------------------------------------------------------

  function open(): void {
    isOpen = true;
    // If first open + no messages, push the welcome message.
    if (messages.length === 0) {
      messages.push({
        id: 'welcome',
        role: 'assistant',
        content: config.welcomeMessage,
        timestamp: Date.now(),
      });
    }
  }

  function close(): void {
    isOpen = false;
  }

  function isOpen_(): boolean {
    return isOpen;
  }

  // ---------------------------------------------------------------------------
  // Send message → assistant response
  // ---------------------------------------------------------------------------

  async function sendMessage(text: string): Promise<ChatMessage> {
    if (!isOpen) open();

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    messages.push(userMsg);

    if (!autoRespond || !config.online) {
      // Offline or auto-respond disabled → no response (or offline message).
      if (!config.online) {
        const offlineMsg: ChatMessage = {
          id: `asst_offline_${Date.now()}`,
          role: 'assistant',
          content:
            "We're currently offline. Please leave your contact info and we'll get back to you within 24 hours.",
          timestamp: Date.now(),
        };
        messages.push(offlineMsg);
        return offlineMsg;
      }
      const empty: ChatMessage = {
        id: `asst_empty_${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };
      return empty;
    }

    // Show typing indicator while "waiting for the LLM".
    typingIndicator = true;

    // Simulate streaming response.
    const responseText = generateResponse(text);
    const assistantId = `asst_${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
      citations: extractCitations(text),
    };
    messages.push(assistantMsg);
    activeStreamId = assistantId;
    isStreaming = true;

    // Stream token-by-token (split on whitespace).
    streamChunks.length = 0;
    const tokens = responseText.split(/(\s+)/);
    for (const token of tokens) {
      streamChunks.push(token);
      assistantMsg.content += token;
      // Yield to the event loop.
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    assistantMsg.streaming = false;
    isStreaming = false;
    activeStreamId = null;
    typingIndicator = false;

    return assistantMsg;
  }

  function generateResponse(text: string): string {
    const t = text.toLowerCase();
    if (/hi|hello|hey/.test(t)) {
      return "Hello! Welcome to Dayjoy. How can I help you today?";
    }
    if (/product/.test(t)) {
      return (
        "We have a range of wellness, beauty, and home-care products. " +
        'Our flagship is the Dayjoy Premium Health Tonic (₹699 for 500 ml). ' +
        'Would you like to know more about a specific product?'
      );
    }
    if (/price|cost|how much/.test(t)) {
      return 'The Dayjoy Premium Health Tonic is ₹699 for 500 ml. The Beauty Cream is ₹599.';
    }
    if (/return|refund/.test(t)) {
      return (
        'Our return policy allows 7-day returns on unopened products. ' +
        'Refunds are processed within 5–7 business days.'
      );
    }
    if (/distributor|join|business/.test(t)) {
      return (
        'To become a Dayjoy distributor, fill out the application form on our distributor portal. ' +
        'You\'ll need a GST number and a ₹2,000 refundable security deposit.'
      );
    }
    if (/order|track|status/.test(t)) {
      return 'Could you share your order ID so I can look up the status for you?';
    }
    if (/human|agent/.test(t)) {
      return "I'm transferring you to a human agent. They'll be with you shortly.";
    }
    return (
      "Thanks for your question! I can help with products, orders, returns, " +
      'distributor onboarding, and more. What would you like to know?'
    );
  }

  function extractCitations(text: string): ChatMessage['citations'] {
    const t = text.toLowerCase();
    if (/product|price/.test(t)) {
      return [
        {
          chunkId: 'pc-1',
          documentId: 'product-catalog',
          documentTitle: 'Product Catalog',
          snippet: 'Dayjoy Premium Health Tonic ₹699.',
          score: 0.95,
        },
      ];
    }
    if (/return|refund/.test(t)) {
      return [
        {
          chunkId: 'rp-1',
          documentId: 'return-policy',
          documentTitle: 'Return Policy',
          snippet: '7-day returns on unopened products.',
          score: 0.93,
        },
      ];
    }
    if (/distributor/.test(t)) {
      return [
        {
          chunkId: 'ds-1',
          documentId: 'distributor-system',
          documentTitle: 'Distributor System',
          snippet: 'Apply with GST + ₹2,000 refundable deposit.',
          score: 0.92,
        },
      ];
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Streaming control
  // ---------------------------------------------------------------------------

  function cancelStream(): void {
    if (activeStreamId) {
      const msg = messages.find((m) => m.id === activeStreamId);
      if (msg) {
        msg.streaming = false;
        msg.content = msg.content + ' [cancelled]';
      }
      isStreaming = false;
      activeStreamId = null;
      typingIndicator = false;
    }
  }

  function isStreaming_(): boolean {
    return isStreaming;
  }

  function isTyping_(): boolean {
    return typingIndicator;
  }

  // ---------------------------------------------------------------------------
  // Voice input (mocked Web Speech API)
  // ---------------------------------------------------------------------------

  function startVoiceRecording(): void {
    if (!config.voiceEnabled) {
      throw new Error('Voice input is disabled');
    }
    voiceRecording = true;
    voiceTranscript = '';
  }

  function pushVoiceTranscript(text: string): void {
    if (!voiceRecording) return;
    voiceTranscript += (voiceTranscript ? ' ' : '') + text;
  }

  function stopVoiceRecording(): string {
    voiceRecording = false;
    const transcript = voiceTranscript;
    voiceTranscript = '';
    return transcript;
  }

  function isVoiceRecording(): boolean {
    return voiceRecording;
  }

  function getVoiceTranscript(): string {
    return voiceTranscript;
  }

  // ---------------------------------------------------------------------------
  // Guest vs logged-in
  // ---------------------------------------------------------------------------

  function isLoggedIn(): boolean {
    return user !== null;
  }

  function getUserName(): string | null {
    return user?.name ?? null;
  }

  function login(newUser: { id: string; name: string; email: string }): void {
    // `user` is `let` — assign directly so isLoggedIn/getUserName
    // (which close over the variable) reflect the new state.
    user = newUser;
  }

  // ---------------------------------------------------------------------------
  // Admin controls
  // ---------------------------------------------------------------------------

  function updateConfig(patch: Partial<WidgetConfig>): void {
    Object.assign(config, patch);
  }

  function getConfig(): WidgetConfig {
    return { ...config };
  }

  // ---------------------------------------------------------------------------
  // Embed (iframe + postMessage)
  // ---------------------------------------------------------------------------

  function isDomainAllowed(origin: string): boolean {
    if (options.domainCheck) return options.domainCheck(origin);
    try {
      const url = new URL(origin);
      return config.allowedDomains.some(
        (d) => url.hostname === d || url.hostname.endsWith(`.${d}`),
      );
    } catch {
      return false;
    }
  }

  function receivePostMessage(origin: string, data: unknown): void {
    postMessageLog.push({ origin, data });
    if (!isDomainAllowed(origin)) return;

    if ((data as any)?.type === 'open') open();
    if ((data as any)?.type === 'close') close();
    if ((data as any)?.type === 'send') sendMessage((data as any).text);
  }

  function sendPostMessage(target: unknown, data: unknown): void {
    postMessageLog.push({ origin: 'widget', data });
  }

  function getPostMessageLog() {
    return postMessageLog;
  }

  // ---------------------------------------------------------------------------
  // URL params
  // ---------------------------------------------------------------------------

  function applyUrlParams(params: Record<string, string>): void {
    if (params.title) config.title = params.title;
    if (params.color) config.color = params.color;
    if (params.position) config.position = params.position as WidgetConfig['position'];
    if (params.voiceEnabled === 'false') config.voiceEnabled = false;
    if (params.voiceEnabled === 'true') config.voiceEnabled = true;
    if (params.online === 'false') config.online = false;
    if (params.online === 'true') config.online = true;
  }

  // ---------------------------------------------------------------------------
  // Public surface
  // ---------------------------------------------------------------------------

  return {
    // Config
    getConfig,
    updateConfig,
    applyUrlParams,

    // Widget lifecycle
    open,
    close,
    isOpen: isOpen_,

    // Messages
    sendMessage,
    cancelStream,
    getMessages: () => [...messages],
    getMessageCount: () => messages.length,
    getLastMessage: () => messages[messages.length - 1] ?? null,

    // Streaming
    isStreaming: isStreaming_,
    isTyping: isTyping_,

    // Voice
    startVoiceRecording,
    stopVoiceRecording,
    pushVoiceTranscript,
    isVoiceRecording,
    getVoiceTranscript,

    // Auth
    isLoggedIn,
    getUserName,
    login,

    // Embed
    isDomainAllowed,
    receivePostMessage,
    sendPostMessage,
    getPostMessageLog,

    // Test helpers
    _setAutoRespond: (v: boolean) => { autoRespond = v; },
    _messages: messages,
    _streamChunks: streamChunks,
    _reset: () => {
      messages.length = 0;
      streamChunks.length = 0;
      postMessageLog.length = 0;
      isOpen = false;
      isStreaming = false;
      activeStreamId = null;
      typingIndicator = false;
    },
  };
}

export type ChatWidgetSimulator = ReturnType<typeof createChatWidgetSimulator>;
