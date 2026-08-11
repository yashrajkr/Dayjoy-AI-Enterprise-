"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bot,
  Loader2,
  Mic,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  useAIConversations,
  useAIConversation,
  useSendAIMessage,
  useCreateAIConversation,
} from "@/hooks/use-ai";
import { useEmployee } from "@/hooks/use-employee";
import { cn, formatRelativeTime, getInitials } from "@/lib/utils";

const QUICK_ACTIONS = [
  "Summarise my open tickets",
  "Draft a reply to ticket TKT-4821",
  "Find product info for Wellness Bundle",
  "Generate a weekly activity report",
];

export default function AIAssistantPage() {
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") ?? "";

  const { employee } = useEmployee();
  const { data: conversations, isLoading: convsLoading } =
    useAIConversations();
  const [activeId, setActiveId] = useState<string | null>(
    conversations?.[0]?.id ?? null,
  );
  const { data: activeConv, isLoading: convLoading } =
    useAIConversation(activeId);
  const sendMutation = useSendAIMessage();
  const createMutation = useCreateAIConversation();

  const [input, setInput] = useState(initialPrompt);
  const [listening, setListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-select the first conversation once the list loads.
  useEffect(() => {
    if (!activeId && conversations && conversations.length > 0) {
      setActiveId(conversations[0]!.id);
    }
  }, [conversations, activeId]);

  // If the user landed here via ?prompt=…, kick off the conversation.
  useEffect(() => {
    if (initialPrompt && activeId) {
      handleSend(initialPrompt);
      // Replace the URL so a refresh doesn't re-fire the prompt.
      window.history.replaceState({}, "", "/ai-assistant");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, activeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages]);

  const handleSend = async (content: string) => {
    if (!content.trim() || !activeId) return;
    setInput("");
    try {
      await sendMutation.mutateAsync({
        conversationId: activeId,
        content: content.trim(),
      });
    } catch {
      toast.error("Could not get a response — please try again.");
    }
  };

  const handleNewConversation = async () => {
    const conv = await createMutation.mutateAsync("New conversation");
    setActiveId(conv.id);
    setInput("");
  };

  const handleVoice = () => {
    if (!("webkitSpeechRecognition" in window)) {
      toast.error("Voice input isn't supported in this browser.");
      return;
    }
    if (listening) {
      setListening(false);
      return;
    }
    setListening(true);
    toast.info("Listening… speak now.");
    // NOTE: a real implementation would hook into webkitSpeechRecognition;
    // we keep the surface minimal here so the page never crashes.
    setTimeout(() => {
      setListening(false);
      toast.success("Voice captured (mock).");
    }, 2000);
  };

  const messages = activeConv?.messages ?? [];

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> AI Assistant
          </span>
        }
        description="Employee-focused AI — drafts, summaries, look-ups, and reports."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewConversation}
            disabled={createMutation.isPending}
          >
            <Plus className="h-4 w-4" /> New conversation
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Conversation list */}
        <Card className="hidden h-[calc(100vh-220px)] lg:flex lg:flex-col">
          <CardContent className="flex-1 overflow-hidden p-2">
            <ScrollArea className="h-full">
              {convsLoading ? (
                <div className="space-y-2 p-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : conversations && conversations.length > 0 ? (
                <ul className="space-y-1">
                  {conversations.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => setActiveId(c.id)}
                        className={cn(
                          "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                          c.id === activeId
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        )}
                      >
                        <p className="truncate font-medium">{c.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatRelativeTime(c.updatedAt ?? c.createdAt)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  No conversations yet.
                </p>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat surface */}
        <Card className="flex h-[calc(100vh-220px)] flex-col">
          <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
            {/* Messages */}
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-2">
                {convLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-3/4" />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-4 py-10">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                      <Bot className="h-7 w-7 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        Hi {employee?.firstName ?? "there"} — what can I help you ship today?
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Try one of these, or ask me anything.
                      </p>
                    </div>
                    <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
                      {QUICK_ACTIONS.map((q) => (
                        <Button
                          key={q}
                          variant="outline"
                          size="sm"
                          className="h-auto justify-start py-2 text-left text-xs"
                          onClick={() => handleSend(q)}
                        >
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      role={m.role}
                      content={m.content}
                      sources={m.sources}
                      createdAt={m.createdAt}
                      employeeName={
                        employee?.fullName ??
                        `${employee?.firstName ?? ""} ${employee?.lastName ?? ""}`.trim() ??
                        "You"
                      }
                    />
                  ))
                )}
                {sendMutation.isPending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                    <span>Thinking…</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <Separator />

            {/* Composer */}
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(input);
                    }
                  }}
                  rows={2}
                  placeholder="Ask the AI assistant… (Shift+Enter for newline)"
                  className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Message"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleVoice}
                  aria-label="Voice input"
                  className={cn(listening && "border-primary text-primary")}
                >
                  <Mic className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={() => handleSend(input)}
                  disabled={!input.trim() || sendMutation.isPending}
                  aria-label="Send"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                AI responses are grounded in your knowledge base and CRM. Always
                review before sending to customers.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function MessageBubble({
  role,
  content,
  sources,
  createdAt,
  employeeName,
}: {
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  sources?: { title: string; slug?: string; url?: string }[];
  createdAt: string;
  employeeName: string;
}) {
  const isUser = role === "USER";
  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          isUser
            ? "bg-secondary text-secondary-foreground"
            : "bg-primary/15 text-primary",
        )}
      >
        {isUser ? (
          getInitials(employeeName) || <UserCircle2 className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[80%] space-y-2 rounded-lg p-3 text-sm leading-relaxed",
          isUser ? "bg-secondary text-secondary-foreground" : "bg-muted",
        )}
      >
        <p className="whitespace-pre-wrap">{content}</p>
        {sources && sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <span className="text-[10px] text-muted-foreground">Sources:</span>
            {sources.map((s, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {s.title}
              </Badge>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          {formatRelativeTime(createdAt)}
        </p>
      </div>
    </div>
  );
}
