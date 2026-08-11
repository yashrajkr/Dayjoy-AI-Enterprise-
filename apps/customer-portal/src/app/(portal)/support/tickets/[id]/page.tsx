"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  LifeBuoy,
  Loader2,
  AlertCircle,
  Send,
  XCircle,
  Paperclip,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
} from "@/components/support/ticket-status-badge";
import {
  useSupportTicket,
  useReplyToTicket,
  useCloseTicket,
} from "@/hooks/use-api";
import { ROUTES } from "@/lib/constants";
import {
  cn,
  formatDateTime,
  formatRelativeTime,
  getInitials,
} from "@/lib/utils";
import { toast } from "sonner";
import type { TicketReply } from "@/types";

/**
 * Ticket Detail — ticket metadata + conversation thread + reply form
 * + close-ticket action.
 */
export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? null;

  const { data: ticket, isLoading, isError } = useSupportTicket(id);
  const replyMutation = useReplyToTicket(id ?? "");
  const closeMutation = useCloseTicket(id ?? "");
  const [reply, setReply] = useState("");

  const handleReply = async () => {
    const trimmed = reply.trim();
    if (!trimmed) return;
    try {
      await replyMutation.mutateAsync(trimmed);
      setReply("");
      toast.success("Reply sent");
    } catch {
      toast.error("Failed to send reply");
    }
  };

  const handleClose = async () => {
    try {
      await closeMutation.mutateAsync();
      toast.success("Ticket closed");
    } catch {
      toast.error("Failed to close ticket");
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Ticket"
          description="Loading…"
          icon={LifeBuoy}
        />
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading ticket…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={AlertCircle}
          title="Ticket not found"
          description="This ticket may have been deleted, or the link is incorrect."
          action={
            <div className="flex gap-2">
              <Button asChild>
                <Link href={ROUTES.supportTickets}>All tickets</Link>
              </Button>
              <Button variant="outline" onClick={() => router.back()}>
                Go back
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const replies = ticket.replies ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={ticket.subject}
        description={`${ticket.ticketNumber} · opened ${formatRelativeTime(ticket.createdAt)}`}
        icon={LifeBuoy}
        actions={
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href={ROUTES.supportTickets}>
              <ArrowLeft className="h-4 w-4" />
              All tickets
            </Link>
          </Button>
        }
      />

      {/* Ticket metadata */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
              {ticket.category}
            </span>
            {ticket.assignedAgent ? (
              <span className="text-xs text-muted-foreground">
                Assigned to{" "}
                <span className="font-medium text-foreground">
                  {ticket.assignedAgent}
                </span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Awaiting assignment
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <CardDescription className="text-xs font-medium uppercase tracking-wide">
            Original request
          </CardDescription>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {ticket.description}
          </p>
          {ticket.attachments && ticket.attachments.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {ticket.attachments.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
                >
                  <Paperclip className="h-3 w-3" />
                  {a.name}
                </a>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Conversation thread */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Conversation
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {replies.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No replies yet. We typically respond within a few hours.
            </p>
          ) : (
            replies.map((r: TicketReply) => (
              <ReplyBubble key={r.id} reply={r} />
            ))
          )}

          <Separator />

          {/* Reply form */}
          {ticket.status === "CLOSED" ? (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
              This ticket is closed.{" "}
              <Link
                href={ROUTES.supportNewTicket}
                className="font-medium text-primary hover:underline"
              >
                Open a new ticket
              </Link>{" "}
              if you need more help.
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                placeholder="Add a reply…"
                aria-label="Reply"
              />
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  disabled={closeMutation.isPending}
                  className="gap-1.5 text-muted-foreground"
                >
                  <XCircle className="h-4 w-4" />
                  {closeMutation.isPending ? "Closing…" : "Close ticket"}
                </Button>
                <Button
                  onClick={handleReply}
                  disabled={!reply.trim() || replyMutation.isPending}
                  className="gap-1.5"
                >
                  {replyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send reply
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReplyBubble({ reply }: { reply: TicketReply }) {
  const isCustomer = reply.author === "customer";
  return (
    <div
      className={cn(
        "flex gap-3",
        isCustomer ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback
          className={cn(
            isCustomer
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground",
            "text-xs",
          )}
        >
          {getInitials(reply.authorName || (isCustomer ? "You" : "Agent"))}
        </AvatarFallback>
      </Avatar>
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-1",
          isCustomer ? "items-end" : "items-start",
        )}
      >
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">
            {reply.authorName || (isCustomer ? "You" : "Support Agent")}
          </span>
          <span>·</span>
          <time dateTime={reply.createdAt}>
            {formatDateTime(reply.createdAt)}
          </time>
        </div>
        <div
          className={cn(
            isCustomer
              ? "chat-bubble-user"
              : "chat-bubble-assistant",
          )}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {reply.content}
          </p>
        </div>
        {reply.attachments && reply.attachments.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {reply.attachments.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
              >
                <Paperclip className="h-3 w-3" />
                {a.name}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
