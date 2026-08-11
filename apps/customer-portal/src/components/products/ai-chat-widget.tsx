"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, User as UserIcon } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface AIChatWidgetProps {
  productId: string;
  productName: string;
  onClose?: () => void;
}

/**
 * AIChatWidget — a lightweight chat surface for the "Ask AI about this
 * product" button. Creates a conversation scoped to the product, sends
 * each message to `POST /api/ai/conversations/:id/messages`, and
 * renders the streamed / returned reply.
 *
 * This widget is intentionally compact (no markdown, no history) — the
 * full assistant experience lives at `/assistant`.
 */
export function AIChatWidget({ productId, productName, onClose }: AIChatWidgetProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Create the conversation once, scoped to this product.
  const createConversation = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/ai/conversations", {
        context: { type: "product", productId },
        title: `Ask about ${productName}`,
      }),
    onSuccess: (data) => {
      setConversationId(data.id);
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `Hi! I'm the Dayjoy AI. Ask me anything about ${productName} — features, specs, compatibility, or whether it's right for you.`,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
  });

  useEffect(() => {
    if (!conversationId) createConversation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useMutation({
    mutationFn: (text: string) =>
      api.post<{ id: string; content: string; createdAt: string }>(
        `/ai/conversations/${conversationId}/messages`,
        { content: text },
      ),
    onSuccess: (reply) => {
      setMessages((prev) => [
        ...prev,
        {
          id: reply.id,
          role: "assistant",
          content: reply.content,
          createdAt: reply.createdAt,
        },
      ]);
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !conversationId || sendMessage.isPending) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `u_${Date.now()}`,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput("");
    sendMessage.mutate(text);
  };

  const initializing = createConversation.isPending && !conversationId;

  return (
    <div className="flex h-[60vh] min-h-[420px] flex-col">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto p-4"
        aria-live="polite"
      >
        {initializing ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-16 w-2/3" />
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full brand-gradient">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
            {sendMessage.isPending && (
              <div className="flex gap-2">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full brand-gradient">
                  <Bot className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="flex items-center gap-1 rounded-2xl bg-muted px-3 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask about ${productName}…`}
          disabled={!conversationId || sendMessage.isPending}
        />
        <Button
          type="submit"
          size="icon"
          variant="gradient"
          disabled={!input.trim() || sendMessage.isPending}
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
