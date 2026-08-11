"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  History,
  Search,
  Trash2,
  MessageSquare,
  Loader2,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { useConversations, useDeleteConversation } from "@/hooks/use-ai";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ROUTES } from "@/lib/constants";
import { formatRelativeTime, formatDateTime } from "@/lib/utils";

/**
 * Conversation history — searchable list of past AI conversations.
 * Click a row to view the full thread; delete to remove it.
 */
export default function AIHistoryPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { data, isLoading, isError } = useConversations(search || undefined);
  const deleteConversation = useDeleteConversation();

  const conversations = data ?? [];

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteConversation.mutateAsync(pendingDelete);
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Conversation History"
        description="Browse, search, and resume your past AI conversations."
        icon={History}
        actions={
          <Button asChild>
            <Link href={ROUTES.aiAssistant}>New conversation</Link>
          </Button>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search conversations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search conversations"
        />
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading conversations…
          </CardContent>
        </Card>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load history"
          description="Please check your connection and try again."
          action={
            <Button
              variant="outline"
              onClick={() => router.refresh()}
            >
              Retry
            </Button>
          }
        />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={search ? "No matching conversations" : "No conversations yet"}
          description={
            search
              ? "Try a different search term."
              : "Start your first AI conversation to see it here."
          }
          action={
            !search ? (
              <Button asChild>
                <Link href={ROUTES.aiAssistant}>Start chatting</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <Card
              key={conv.id}
              className="group transition-colors hover:border-primary/30 hover:bg-accent/30"
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MessageSquare className="h-5 w-5" />
                </div>

                <Link
                  href={`/ai-assistant/${conv.id}`}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {conv.title || conv.firstMessage || "Untitled conversation"}
                    </p>
                    {conv.channel && conv.channel !== "website" ? (
                      <Badge variant="muted" className="capitalize">
                        {conv.channel}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatRelativeTime(conv.lastMessageAt || conv.createdAt)}</span>
                    <span>·</span>
                    <span>{conv.messageCount} messages</span>
                    <span className="hidden sm:inline">·</span>
                    <span className="hidden sm:inline">
                      Started {formatDateTime(conv.createdAt)}
                    </span>
                  </div>
                </Link>

                <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setPendingDelete(conv.id)}
                    aria-label="Delete conversation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    asChild
                    aria-label="Open conversation"
                  >
                    <Link href={`/ai-assistant/${conv.id}`}>
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the conversation and all its messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteConversation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
