"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trash2, Volume2, VolumeX } from "lucide-react";
import type { ChatMessage, Citation } from "@/types";
import {
  useConversation,
  useCreateConversation,
  useDeleteConversation,
  streamMessage,
} from "@/hooks/use-ai";
import { QUERY_KEYS, AI_QUICK_REPLIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessageBubble } from "./chat-message";
import { ChatInput } from "./chat-input";
import { ChatTyping } from "./chat-typing";
import { EmptyState } from "@/components/ui/empty-state";
import { useSpeech } from "@/hooks/use-speech";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  /** Existing conversation id (history view). When omitted, a fresh
   *  conversation is created on first message. */
  conversationId?: string;
  /** Called when a new conversation is created (so the parent route
   *  can update the URL). */
  onConversationCreated?: (id: string) => void;
  className?: string;
}

/**
 * Full chat window — orchestrates message list, streaming, voice
 * input/output, citations, and quick replies. Composes ChatMessageBubble,
 * ChatInput, ChatTyping.
 */
export function ChatWindow({
  conversationId: initialId,
  onConversationCreated,
  className,
}: ChatWindowProps) {
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | undefined>(
    initialId,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
  const [voiceOutputOn, setVoiceOutputOn] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversation } = useConversation(
    conversationId ?? null,
  );
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const { speak, cancelSpeak, speaking, speechSynthesisSupported } = useSpeech();

  // Hydrate messages when conversation data arrives (history view).
  useEffect(() => {
    if (conversation?.messages) {
      setMessages(conversation.messages);
    }
  }, [conversation]);

  // Auto-scroll to bottom on new messages / streaming updates.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, streamingContent, showTyping]);

  const speakMessage = useCallback(
    (msg: ChatMessage) => {
      if (speaking) {
        cancelSpeak();
        setSpeakingId(null);
        return;
      }
      // Strip markdown for cleaner TTS
      const text = msg.content.replace(/[#*_>`-]/g, "").trim();
      speak(text);
      setSpeakingId(msg.id);
    },
    [speaking, speak, cancelSpeak],
  );

  const cancelSpeaking = useCallback(() => {
    cancelSpeak();
    setSpeakingId(null);
  }, [cancelSpeak]);

  const handleSend = async (text: string) => {
    // Cancel any in-flight TTS
    cancelSpeaking();

    // Optimistically add the user's message
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      conversationId: conversationId ?? "pending",
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMessage]);

    // Create a conversation lazily if one doesn't exist yet
    let convId = conversationId;
    if (!convId) {
      try {
        const conv = await createConversation.mutateAsync({
          title: text.slice(0, 60),
          channel: "website",
        });
        convId = conv.id;
        setConversationId(conv.id);
        onConversationCreated?.(conv.id);
      } catch {
        // Fall back to a synthetic placeholder so the user still sees
        // their message; the assistant will reply with an error card.
      }
    }

    // Add a streaming assistant placeholder
    const assistantId = `assistant_${Date.now()}`;
    setShowTyping(true);
    setStreaming(true);
    setStreamingContent("");
    setStreamingCitations([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const finalMessage = await streamMessage({
        conversationId: convId ?? "pending",
        message: { content: text, stream: true },
        signal: controller.signal,
        onToken: (chunk) => {
          setShowTyping(false);
          setStreamingContent((prev) => prev + chunk);
        },
        onCitations: (citations) => {
          setStreamingCitations(citations);
        },
      });

      // Replace placeholder with the final message
      const assistantMessage: ChatMessage = {
        id: finalMessage.id || assistantId,
        conversationId: convId ?? "pending",
        role: "assistant",
        content: finalMessage.content || streamingContent,
        citations: finalMessage.citations ?? streamingCitations,
        createdAt: finalMessage.createdAt,
      };
      setMessages((m) => [...m, assistantMessage]);

      // Voice output (if enabled) — speak the assistant reply
      if (voiceOutputOn && speechSynthesisSupported) {
        const ttsText = assistantMessage.content
          .replace(/[#*_>`-]/g, "")
          .trim();
        speak(ttsText);
        setSpeakingId(assistantMessage.id);
      }

      // Invalidate conversations list so history refreshes
      qc.invalidateQueries({ queryKey: QUERY_KEYS.aiConversations });
    } catch (err) {
      const isAbort =
        err instanceof DOMException && err.name === "AbortError";
      if (!isAbort) {
        const errorMessage: ChatMessage = {
          id: assistantId,
          conversationId: convId ?? "pending",
          role: "assistant",
          content:
            "I'm sorry, I had trouble responding just now. Please try again, or [contact support](/support) if the issue persists.",
          createdAt: new Date().toISOString(),
        };
        setMessages((m) => [...m, errorMessage]);
      } else if (streamingContent) {
        // Preserve partial streamed content on abort
        setMessages((m) => [
          ...m,
          {
            id: assistantId,
            conversationId: convId ?? "pending",
            role: "assistant",
            content: streamingContent,
            citations: streamingCitations,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setShowTyping(false);
      setStreaming(false);
      setStreamingContent("");
      setStreamingCitations([]);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleClear = async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    try {
      await deleteConversation.mutateAsync(conversationId);
      setMessages([]);
      setConversationId(undefined);
      onConversationCreated?.("");
    } catch {
      // Soft fail — at least clear the local view
      setMessages([]);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Dayjoy AI Assistant
            </p>
            <p className="text-[11px] text-muted-foreground">
              {streaming ? "Generating response…" : "Online · answers in seconds"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {speechSynthesisSupported ? (
            <Button
              variant={voiceOutputOn ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                if (voiceOutputOn) cancelSpeaking();
                setVoiceOutputOn((v) => !v);
              }}
              aria-label={
                voiceOutputOn
                  ? "Disable voice output"
                  : "Enable voice output"
              }
              title={
                voiceOutputOn
                  ? "Voice output on — clicks Stop to mute"
                  : "Voice output off"
              }
            >
              {voiceOutputOn ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleClear}
            aria-label="Clear conversation"
            title="Clear conversation"
            disabled={messages.length === 0 && !conversationId}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef as never}>
        <div className="space-y-5 px-4 py-5">
          {messages.length === 0 && !streaming && !showTyping ? (
            <EmptyState
              icon={Sparkles}
              title="How can I help you today?"
              description="Ask about your orders, product recommendations, returns, or anything else. I'm powered by the Dayjoy AI knowledge base."
            />
          ) : null}

          {messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              speakEnabled={speechSynthesisSupported}
              speaking={speakingId === msg.id}
              onSpeak={speakMessage}
              onCancelSpeak={cancelSpeaking}
            />
          ))}

          {showTyping ? <ChatTyping /> : null}

          {streaming && streamingContent ? (
            <ChatMessageBubble
              message={{
                id: "streaming",
                conversationId: conversationId ?? "pending",
                role: "assistant",
                content: streamingContent,
                citations: streamingCitations,
                createdAt: new Date().toISOString(),
              }}
            />
          ) : null}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border bg-card p-3">
        <ChatInput
          onSend={handleSend}
          disabled={createConversation.isPending}
          isStreaming={streaming}
          onStop={handleStop}
          quickReplies={messages.length === 0 ? AI_QUICK_REPLIES : undefined}
          onQuickReply={(q) => handleSend(q)}
        />
      </div>
    </div>
  );
}
