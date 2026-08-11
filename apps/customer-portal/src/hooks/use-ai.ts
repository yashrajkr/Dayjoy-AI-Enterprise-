"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiClient } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import type {
  Conversation,
  ChatMessage,
  SendMessageInput,
  Citation,
} from "@/types";

/**
 * AI conversation + message hooks — wraps the backend API endpoints
 * declared in the task spec:
 *   POST /api/ai/conversations
 *   POST /api/ai/conversations/:id/messages
 *   GET  /api/ai/conversations
 *   GET  /api/ai/conversations/:id
 *
 * Streaming: `sendMessage` falls back to a POST that returns the full
 * assistant message when the backend doesn't support SSE. The caller
 * (chat-window.tsx) supplies an `onToken` callback that streams tokens
 * to the UI as they arrive.
 */

export interface CreateConversationInput {
  title?: string;
  channel?: "website" | "voice" | "whatsapp" | "mobile";
  metadata?: Record<string, unknown>;
}

export function useConversations(search?: string) {
  return useQuery({
    queryKey: [...QUERY_KEYS.aiConversations, { search }],
    queryFn: () =>
      api.get<Conversation[]>("/ai/conversations", { search }),
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: id ? QUERY_KEYS.aiConversation(id) : ["ai", "conversations", "null"],
    queryFn: () => api.get<Conversation>(`/ai/conversations/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversationInput) =>
      api.post<Conversation>("/ai/conversations", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.aiConversations });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/ai/conversations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.aiConversations });
    },
  });
}

/**
 * Send a message and stream tokens as they arrive. The backend endpoint
 * is `POST /api/ai/conversations/:id/messages?stream=true`; the response
 * is `text/event-stream` with `data: {...}` frames.
 *
 * When `onToken` is supplied, the function reads the response body as a
 * stream and parses SSE frames; otherwise it returns the final assembled
 * message (a single POST round-trip).
 */
export async function streamMessage(params: {
  conversationId: string;
  message: SendMessageInput;
  onToken?: (chunk: string) => void;
  onCitations?: (citations: Citation[]) => void;
  signal?: AbortSignal;
}): Promise<ChatMessage> {
  const { conversationId, message, onToken, onCitations, signal } = params;

  // Build the SSE-capable fetch (axios doesn't stream response bodies).
  const url = `${apiClient.defaults.baseURL}/ai/conversations/${conversationId}/messages`;
  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("cp_access_token")
      : null;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...message, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    // Fallback: caller will treat this as a non-streaming response.
    throw new Error(`AI request failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let citations: Citation[] = [];
  const messageId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `msg_${Date.now()}`;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const frame = JSON.parse(payload) as {
          token?: string;
          content?: string;
          citations?: Citation[];
          done?: boolean;
        };
        if (frame.token) {
          content += frame.token;
          onToken?.(frame.token);
        }
        if (frame.content) {
          content = frame.content;
          onToken?.(frame.content);
        }
        if (frame.citations) {
          citations = frame.citations;
          onCitations?.(citations);
        }
      } catch {
        // Ignore malformed frame
      }
    }
  }

  return {
    id: messageId,
    conversationId,
    role: "assistant",
    content,
    citations,
    createdAt: new Date().toISOString(),
  };
}

/** Non-streaming fallback used when SSE isn't available. */
export async function sendMessagePlain(
  conversationId: string,
  message: SendMessageInput,
): Promise<ChatMessage> {
  return api.post<ChatMessage>(
    `/ai/conversations/${conversationId}/messages`,
    message,
  );
}
