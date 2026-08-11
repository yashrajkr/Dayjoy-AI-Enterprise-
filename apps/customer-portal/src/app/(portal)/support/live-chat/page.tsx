"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  Send,
  Sparkles,
  Loader2,
  Clock,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useLiveChatSession,
  useStartLiveChat,
  useSendLiveChatMessage,
} from "@/hooks/use-api";
import { ROUTES } from "@/lib/constants";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { LiveChatMessage } from "@/types";

/**
 * Live Chat — real-time chat with a human support agent. When no
 * active session exists, the user can request one (estimated wait
 * time is shown). Once active, the chat shows the conversation and
 * an input form. A "Transfer to AI" button hands the customer back
 * to the AI Assistant.
 */
export default function LiveChatPage() {
  const { data: session, isLoading } = useLiveChatSession();
  const startChat = useStartLiveChat();
  const sendMessage = useSendLiveChatMessage(session?.id ?? null);

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = session?.messages ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !session) return;
    setDraft("");
    try {
      await sendMessage.mutateAsync(trimmed);
    } catch {
      setDraft(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col space-y-4 sm:h-[calc(100vh-9rem)]">
      <PageHeader
        title="Live Chat"
        description="Chat with a human support agent in real time."
        icon={MessageCircle}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={ROUTES.aiAssistant}>
              <Sparkles className="h-4 w-4" />
              Switch to AI
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <Card className="flex-1">
          <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading chat…
          </CardContent>
        </Card>
      ) : !session ? (
        <Card className="flex-1">
          <CardContent className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessageCircle}
              title="No active chat"
              description="Start a live chat with our support team. Average wait time is under 3 minutes during business hours."
              action={
                <Button
                  onClick={() => startChat.mutate()}
                  disabled={startChat.isPending}
                  className="gap-2"
                >
                  {startChat.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageCircle className="h-4 w-4" />
                  )}
                  Start chat
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-2 w-2 rounded-full",
                  session.status === "active" ? "bg-success" : "bg-warning",
                )}
              />
              <CardTitle className="text-sm">
                {session.status === "active"
                  ? session.agentName
                    ? `Connected · ${session.agentName}`
                    : "Connected with an agent"
                  : "Waiting for an agent"}
              </CardTitle>
            </div>
            {session.status === "waiting" && session.estimatedWaitSeconds ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                ~{Math.ceil(session.estimatedWaitSeconds / 60)} min wait
              </span>
            ) : null}
          </CardHeader>

          {/* Messages */}
          <ScrollArea
            className="flex-1"
            ref={scrollRef as never}
          >
            <div className="space-y-4 p-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    Say hello to start the conversation.
                  </p>
                </div>
              ) : (
                messages.map((m) => <LiveChatBubble key={m.id} message={m} />)
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t border-border p-3">
            {session.status === "ended" ? (
              <div className="rounded-lg bg-muted/40 p-3 text-center text-sm text-muted-foreground">
                This chat has ended.{" "}
                <Link
                  href={ROUTES.supportNewTicket}
                  className="font-medium text-primary hover:underline"
                >
                  Open a ticket
                </Link>{" "}
                if you need more help.
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Type your message…"
                  className="min-h-[40px] flex-1 resize-none"
                  aria-label="Message"
                />
                <Button
                  onClick={handleSend}
                  disabled={!draft.trim() || sendMessage.isPending}
                  size="icon"
                  aria-label="Send message"
                >
                  {sendMessage.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function LiveChatBubble({ message }: { message: LiveChatMessage }) {
  if (message.author === "system") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
          {message.content}
        </span>
      </div>
    );
  }
  const isCustomer = message.author === "customer";
  return (
    <div
      className={cn(
        "flex gap-2",
        isCustomer ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar className="h-7 w-7 shrink-0">
        <AvatarFallback
          className={cn(
            "text-[10px]",
            isCustomer
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          {isCustomer ? "You" : "A"}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-0.5",
          isCustomer ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            isCustomer
              ? "chat-bubble-user"
              : "chat-bubble-assistant",
          )}
        >
          <p className="text-sm leading-relaxed">{message.content}</p>
        </div>
        <span className="px-1 text-[10px] text-muted-foreground">
          {formatRelativeTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}
