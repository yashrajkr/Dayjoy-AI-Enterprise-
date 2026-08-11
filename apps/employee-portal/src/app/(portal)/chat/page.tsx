"use client";

import { useState } from "react";
import {
  Hash,
  Paperclip,
  Send,
  Search,
  Smile,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn, formatRelativeTime, formatTime, getInitials } from "@/lib/utils";

interface ChatChannel {
  id: string;
  type: "CHANNEL" | "DM";
  name: string;
  description?: string;
  unread?: number;
  members?: number;
}

interface ChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorRole?: string;
  authorInitials: string;
  body: string;
  createdAt: string;
  mentions?: string[];
  attachments?: { id: string; name: string; size: number }[];
}

const CHANNELS: ChatChannel[] = [
  {
    id: "ch_general",
    type: "CHANNEL",
    name: "general",
    description: "Company-wide chatter",
    members: 42,
    unread: 2,
  },
  {
    id: "ch_sales",
    type: "CHANNEL",
    name: "sales",
    description: "Sales team — pipeline & deals",
    members: 8,
  },
  {
    id: "ch_support",
    type: "CHANNEL",
    name: "support",
    description: "Support heroes",
    members: 6,
    unread: 5,
  },
  {
    id: "ch_announcements",
    type: "CHANNEL",
    name: "announcements",
    description: "Company news",
    members: 42,
  },
];

const DMS: ChatChannel[] = [
  { id: "dm_priya", type: "DM", name: "Priya Sharma", unread: 1 },
  { id: "dm_rahul", type: "DM", name: "Rahul Verma" },
  { id: "dm_sneha", type: "DM", name: "Sneha Iyer" },
  { id: "dm_amit", type: "DM", name: "Amit Singh" },
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    authorId: "u_001",
    authorName: "Priya Sharma",
    authorRole: "Sales Head",
    authorInitials: "PS",
    body: "Morning team! Reminder: Q3 kick-off call Friday 10am.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: "m2",
    authorId: "u_002",
    authorName: "Rahul Verma",
    authorRole: "Sales",
    authorInitials: "RV",
    body: "Got it. Will I need to prep the territory deck?",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2.5).toISOString(),
  },
  {
    id: "m3",
    authorId: "u_001",
    authorName: "Priya Sharma",
    authorRole: "Sales Head",
    authorInitials: "PS",
    body: "Yes please — focus on Mumbai + Pune. @Rahul Verma",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    mentions: ["Rahul Verma"],
  },
  {
    id: "m4",
    authorId: "u_003",
    authorName: "Sneha Iyer",
    authorRole: "Support",
    authorInitials: "SI",
    body: "FYI — the AI now summarises tickets. Massive time-saver.",
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "m5",
    authorId: "u_004",
    authorName: "Amit Singh",
    authorRole: "Ops",
    authorInitials: "AS",
    body: "Logistics update: Express shipping to Kerala is back to 1-2 days ✅",
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    attachments: [
      { id: "f1", name: "kerala-shipping-resume.pdf", size: 142_000 },
    ],
  },
];

export default function ChatPage() {
  const [activeId, setActiveId] = useState<string>(CHANNELS[0]!.id);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");

  const activeChannel =
    [...CHANNELS, ...DMS].find((c) => c.id === activeId) ?? CHANNELS[0]!;

  const filteredMessages = search
    ? messages.filter((m) =>
        m.body.toLowerCase().includes(search.toLowerCase()),
      )
    : messages;

  const handleSend = () => {
    if (!input.trim()) return;
    const newMsg: ChatMessage = {
      id: `m_${Math.random().toString(36).slice(2, 8)}`,
      authorId: "self",
      authorName: "You",
      authorRole: "Employee",
      authorInitials: "YO",
      body: input.trim(),
      createdAt: new Date().toISOString(),
      mentions: extractMentions(input),
    };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");
  };

  return (
    <>
      <PageHeader
        title="Internal Chat"
        description="Team channels and direct messages. Stay in sync, ship faster."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        {/* Channel list */}
        <Card className="hidden h-[calc(100vh-220px)] lg:flex lg:flex-col">
          <CardContent className="flex flex-1 flex-col overflow-hidden p-2">
            <div className="relative mb-2 px-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages…"
                className="h-8 pl-8 text-xs"
              />
            </div>
            <ScrollArea className="flex-1">
              <ChannelSection title="Channels" channels={CHANNELS} activeId={activeId} onSelect={setActiveId} />
              <ChannelSection title="Direct messages" channels={DMS} activeId={activeId} onSelect={setActiveId} />
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat surface */}
        <Card className="flex h-[calc(100vh-220px)] flex-col">
          <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border p-3">
              <div className="flex min-w-0 items-center gap-2">
                {activeChannel.type === "CHANNEL" ? (
                  <Hash className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Users className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {activeChannel.type === "CHANNEL"
                      ? `#${activeChannel.name}`
                      : activeChannel.name}
                  </p>
                  {activeChannel.description && (
                    <p className="truncate text-xs text-muted-foreground">
                      {activeChannel.description}
                    </p>
                  )}
                </div>
              </div>
              {activeChannel.members && (
                <Badge variant="secondary" className="shrink-0 text-xs">
                  <Users className="mr-1 h-3 w-3" />
                  {activeChannel.members}
                </Badge>
              )}
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-4">
                {filteredMessages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No messages match your search.
                  </p>
                ) : (
                  filteredMessages.map((m, i) => {
                    const prev = filteredMessages[i - 1];
                    const grouped =
                      prev &&
                      prev.authorId === m.authorId &&
                      new Date(m.createdAt).getTime() -
                        new Date(prev.createdAt).getTime() <
                        5 * 60 * 1000;
                    return (
                      <ChatMessageRow
                        key={m.id}
                        message={m}
                        grouped={!!grouped}
                      />
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {/* Composer */}
            <Separator />
            <div className="shrink-0 space-y-2 p-3">
              <div className="flex items-end gap-2">
                <Button variant="ghost" size="icon" aria-label="Attach file">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Add emoji">
                  <Smile className="h-4 w-4" />
                </Button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  placeholder={`Message ${
                    activeChannel.type === "CHANNEL"
                      ? `#${activeChannel.name}`
                      : activeChannel.name
                  }…`}
                  className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Use @ to mention a teammate. Shift+Enter for newline.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function ChannelSection({
  title,
  channels,
  activeId,
  onSelect,
}: {
  title: string;
  channels: ChatChannel[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {title}
      </p>
      <ul className="space-y-0.5">
        {channels.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                c.id === activeId
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {c.type === "CHANNEL" ? (
                <Hash className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-[9px]">
                    {getInitials(c.name)}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className="flex-1 truncate">
                {c.type === "CHANNEL" ? c.name : c.name}
              </span>
              {c.unread ? (
                <Badge className="h-4 min-w-[1rem] px-1 text-[10px]">
                  {c.unread}
                </Badge>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatMessageRow({
  message,
  grouped,
}: {
  message: ChatMessage;
  grouped: boolean;
}) {
  return (
    <div className={cn("flex gap-3", grouped && "mt-0.5")}>
      <div className="w-8 shrink-0">
        {!grouped && (
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-[10px]">
              {message.authorInitials}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="mb-0.5 flex items-baseline gap-2">
            <span className="text-sm font-medium">{message.authorName}</span>
            {message.authorRole && (
              <Badge variant="secondary" className="text-[10px]">
                {message.authorRole}
              </Badge>
            )}
            <span
              className="text-[10px] text-muted-foreground"
              title={formatRelativeTime(message.createdAt)}
            >
              {formatTime(message.createdAt)}
            </span>
          </div>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {highlightMentions(message.body)}
        </p>
        {message.attachments && message.attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {message.attachments.map((a) => (
              <li
                key={a.id}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
              >
                <Paperclip className="h-3 w-3" />
                <span className="font-medium">{a.name}</span>
                <span className="text-muted-foreground">
                  ({(a.size / 1024).toFixed(0)} KB)
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function extractMentions(text: string): string[] {
  const matches = text.match(/@(\w[\w\s.]*)/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1).trim());
}

function highlightMentions(text: string): React.ReactNode {
  if (!text.includes("@")) return text;
  const parts = text.split(/(@\w[\w\s.]*?)(?=\s|$|[.,!?])/g);
  return parts.map((p, i) =>
    p.startsWith("@") ? (
      <span key={i} className="rounded bg-primary/15 px-1 font-medium text-primary">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
