"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  History,
  MessageCircle,
  Phone,
  Search,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { aiService } from "@/lib/services";
import { cn, formatRelativeTime } from "@/lib/utils";

export default function AiHistoryPage() {
  const [search, setSearch] = useState("");

  const { data: conversations, isLoading, isError, error } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: () => aiService.getConversations(),
  });

  const filtered = (conversations ?? []).filter(
    (c) =>
      !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.preview.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Conversation History"
        description="Browse your past AI assistant conversations across web, voice, and WhatsApp."
        icon={History}
      />

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search conversations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search conversations"
            />
          </div>
        </CardContent>
      </Card>

      {isError && (
        <InlineAlert variant="error">
          Failed to load history: {(error as Error)?.message ?? "Unknown error"}.
        </InlineAlert>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No conversations yet"
          description="Start chatting with your AI assistant to see history here."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((conv) => (
            <Card
              key={conv.id}
              interactive
              className="cursor-pointer"
              onClick={() => (window.location.href = "/ai-assistant")}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    conv.channel === "VOICE" && "bg-sky-500/10 text-sky-600",
                    conv.channel === "WHATSAPP" && "bg-emerald-500/10 text-emerald-600",
                    conv.channel === "WEB" && "bg-primary/10 text-primary",
                  )}
                >
                  {conv.channel === "VOICE" && <Phone className="h-4 w-4" />}
                  {conv.channel === "WHATSAPP" && <MessageCircle className="h-4 w-4" />}
                  {conv.channel === "WEB" && <Sparkles className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-foreground">
                      {conv.title}
                    </p>
                    <Badge variant="secondary">{conv.channel}</Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                    {conv.preview}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {conv.messageCount} messages · {formatRelativeTime(conv.lastMessageAt)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
