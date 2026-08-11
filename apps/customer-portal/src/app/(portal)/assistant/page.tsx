"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, Sparkles, User as UserIcon, Plus } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { cn, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

interface Conversation {
  id: string;
  title: string;
  lastMessageAt: string;
  messageCount: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

const SUGGESTIONS = [
  "What's the status of my recent order?",
  "Recommend a product within ₹2,000",
  "How do I return an item?",
  "What are your shipping options?",
];

export default function AssistantPage() {
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationsQuery = useQuery({
    queryKey: QUERY_KEYS.aiConversations,
    queryFn: () => api.get<Conversation[]>("/ai/conversations"),
    staleTime: 30 * 1000,
  });

  const messagesQuery = useQuery({
    queryKey: activeConversationId
      ? QUERY_KEYS.aiConversation(activeConversationId)
      : ["ai", "conversations", "none"],
    queryFn: () =>
      api.get<Message[]>(`/ai/conversations/${activeConversationId}/messages`),
    enabled: !!activeConversationId,
  });

  useEffect(() => {
    if (messagesQuery.data) setMessages(messagesQuery.data);
  }, [messagesQuery.data]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const newConversation = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/ai/conversations", {
        title: "New conversation",
      }),
    onSuccess: (data) => {
      setActiveConversationId(data.id);
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content:
            "Hi! I'm the Dayjoy AI assistant. How can I help you today? You can ask about products, orders, returns, or anything else.",
          createdAt: new Date().toISOString(),
        },
      ]);
      conversationsQuery.refetch();
    },
  });

  const sendMessage = useMutation({
    mutationFn: (text: string) =>
      api.post<{ id: string; content: string; createdAt: string }>(
        `/ai/conversations/${activeConversationId}/messages`,
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
      conversationsQuery.refetch();
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !activeConversationId || sendMessage.isPending) return;
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

  const startNewConversation = () => newConversation.mutate();

  const onSuggestionClick = (s: string) => {
    if (!activeConversationId) {
      newConversation.mutate();
    }
    setInput(s);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Assistant"
        description="Chat with the Dayjoy AI for product help, order updates, and instant answers — 24/7."
        actions={
          <Button
            variant="gradient"
            size="sm"
            onClick={startNewConversation}
            loading={newConversation.isPending}
          >
            <Plus className="h-4 w-4" /> New chat
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Conversation list */}
        <Card className="hidden lg:block">
          <CardContent className="p-3">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recent chats
            </p>
            {conversationsQuery.isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !conversationsQuery.data?.length ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                No conversations yet.
              </p>
            ) : (
              <ul className="space-y-1">
                {conversationsQuery.data.map((conv) => (
                  <li key={conv.id}>
                    <button
                      onClick={() => setActiveConversationId(conv.id)}
                      className={cn(
                        "w-full rounded-lg px-2 py-2 text-left transition-colors",
                        activeConversationId === conv.id
                          ? "bg-accent text-foreground"
                          : "hover:bg-accent",
                      )}
                    >
                      <p className="truncate text-sm font-medium">
                        {conv.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDateTime(conv.lastMessageAt)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Chat */}
        <Card className="flex h-[70vh] min-h-[500px] flex-col">
          {!activeConversationId ? (
            <div className="flex flex-1 flex-col items-center justify-center p-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl brand-gradient shadow-glow">
                <Bot className="h-8 w-8 text-white" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                How can I help you today?
              </h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Start a new conversation to chat with the Dayjoy AI assistant.
              </p>
              <div className="mt-6 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSuggestionClick(s)}
                    className="rounded-lg border border-border bg-card p-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
                  >
                    <Sparkles className="mb-1 h-3.5 w-3.5 text-primary" />
                    {s}
                  </button>
                ))}
              </div>
              <Button
                variant="gradient"
                className="mt-6"
                onClick={startNewConversation}
                loading={newConversation.isPending}
              >
                <Plus className="h-4 w-4" /> Start a new chat
              </Button>
            </div>
          ) : (
            <>
              <div
                ref={scrollRef}
                className="flex-1 space-y-4 overflow-y-auto p-4"
                aria-live="polite"
              >
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex gap-2",
                        msg.role === "user" ? "justify-end" : "justify-start",
                      )}
                    >
                      {msg.role === "assistant" && (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full brand-gradient">
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-4 py-2 text-sm",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground",
                        )}
                      >
                        {msg.content}
                      </div>
                      {msg.role === "user" && (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          <UserIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {sendMessage.isPending && (
                  <div className="flex gap-2">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full brand-gradient">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3.5">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
              <form
                onSubmit={onSubmit}
                className="flex items-center gap-2 border-t border-border p-3"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message…"
                  disabled={sendMessage.isPending}
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
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
