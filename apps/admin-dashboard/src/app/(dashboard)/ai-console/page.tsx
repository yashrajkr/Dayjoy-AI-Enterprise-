"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Send, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";

interface Agent {
  id: string;
  agent_type: string;
  name: string;
  status: string;
  is_active: boolean;
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-white/[0.04] px-4 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-cyan"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export default function AIConsolePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([
    { role: "assistant", content: "Hello! I'm your AI assistant. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { api } = await import("@/lib/api");
      const data = await api.get<Agent[]>("/ai/agents");
      setAgents(data);
      if (data.length > 0) setSelectedAgent(data[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    setSending(true);

    try {
      const { api } = await import("@/lib/api");
      const response = await api.post<{ response: string; conversation_id: string }>("/ai/chat", {
        message: userMessage,
        channel: "web",
      });
      setMessages((prev) => [...prev, { role: "assistant", content: response.response }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Bot}
        title="AI Console"
        description="Monitor and interact with your AI agents in real time"
      />

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Agents list */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-cyan" />
              Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-white/[0.04]" />
                ))}
              </div>
            ) : agents.length === 0 ? (
              <EmptyState icon={Bot} title="No agents configured" description="Deploy an agent to see it here." />
            ) : (
              <div className="space-y-2">
                {agents.map((agent) => {
                  const active = selectedAgent === agent.id;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent.id)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-indigo/40 bg-indigo/[0.08] shadow-glow"
                          : "border-white/[0.06] hover:bg-white/[0.04]",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{agent.name}</p>
                          <p className="text-xs capitalize text-muted-foreground">{agent.agent_type}</p>
                        </div>
                        <Badge variant={agent.is_active ? "success" : "warning"} dot>
                          {agent.is_active ? "active" : "inactive"}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chat interface */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-indigo" />
              Test Console
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-[28rem] flex-col">
              <div
                ref={scrollRef}
                className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-white/[0.05] bg-white/[0.015] p-4"
              >
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex items-start gap-3",
                        msg.role === "user" && "flex-row-reverse",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          msg.role === "user" ? "bg-white/[0.08]" : "bg-aurora shadow-glow",
                        )}
                      >
                        {msg.role === "user" ? (
                          <User className="h-4 w-4 text-foreground" />
                        ) : (
                          <Bot className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div
                        className={cn(
                          "max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                          msg.role === "user"
                            ? "rounded-br-sm bg-aurora text-white"
                            : "rounded-bl-sm bg-white/[0.05] text-foreground",
                        )}
                      >
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {sending && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-aurora shadow-glow">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <ThinkingIndicator />
                  </motion.div>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <Input
                  placeholder="Type a message…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={sending || !input.trim()} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
