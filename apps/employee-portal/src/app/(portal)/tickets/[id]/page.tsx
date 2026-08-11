"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Link2,
  Mail,
  Phone,
  Send,
  Sparkles,
  Tag,
  TicketIcon,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useTicket } from "@/hooks/use-tickets";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/constants";
import type { TicketPriority, TicketStatus } from "@/types/ticket.types";
import {
  cn,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getInitials,
  getStatusColor,
} from "@/lib/utils";

const STATUSES: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
  "ESCALATED",
];

const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const { ticket, isLoading, isError, updateTicket, reply, escalate } =
    useTicket(params.id);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Ticket" />
        <Skeleton className="h-64 w-full" />
      </>
    );
  }

  if (isError || !ticket) {
    return (
      <EmptyState
        title="Ticket not found"
        description="This ticket may have been deleted."
        action={
          <Button asChild size="sm">
            <Link href="/tickets">Back to tickets</Link>
          </Button>
        }
      />
    );
  }

  const handleReply = async () => {
    if (!replyBody.trim()) return;
    setSubmitting(true);
    try {
      await reply({ body: replyBody.trim(), isInternal: false });
      setReplyBody("");
      toast.success("Reply sent");
    } catch {
      toast.error("Could not send reply");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatus = async (status: TicketStatus) => {
    try {
      await updateTicket({ status });
      toast.success(`Status: ${TICKET_STATUS_LABELS[status]}`);
    } catch {
      toast.error("Could not update status");
    }
  };

  const handlePriority = async (priority: TicketPriority) => {
    try {
      await updateTicket({ priority });
      toast.success(`Priority: ${priority.toLowerCase()}`);
    } catch {
      toast.error("Could not update priority");
    }
  };

  const handleEscalate = async () => {
    try {
      await escalate();
    } catch {
      toast.error("Could not escalate");
    }
  };

  return (
    <>
      <PageHeader
        title={`${ticket.number} — ${ticket.subject}`}
        description={`${TICKET_CATEGORY_LABELS[ticket.category]} · created ${formatRelativeTime(ticket.createdAt)}`}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/tickets">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEscalate}
              disabled={ticket.status === "ESCALATED"}
            >
              <AlertTriangle className="h-4 w-4" /> Escalate
            </Button>
            <Button asChild size="sm">
              <Link
                href={`/ai-assistant?prompt=${encodeURIComponent(`Draft a reply to ticket ${ticket.number}`)}`}
              >
                <Sparkles className="h-4 w-4" /> Draft with AI
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left — conversation */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
              <CardDescription>
                Messages between customer, AI, and support team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.messages && ticket.messages.length > 0 ? (
                ticket.messages.map((m) => {
                  const isCustomer = m.authorRole === "CUSTOMER";
                  const isAI = m.authorRole === "AI";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex gap-3",
                        isCustomer ? "flex-row" : "flex-row-reverse",
                      )}
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback
                          className={cn(
                            "text-[10px]",
                            isAI
                              ? "bg-primary/15 text-primary"
                              : isCustomer
                                ? "bg-secondary text-secondary-foreground"
                                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                          )}
                        >
                          {isAI ? (
                            <Sparkles className="h-3.5 w-3.5" />
                          ) : (
                            getInitials(m.authorName)
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg p-3",
                          isCustomer
                            ? "bg-muted"
                            : isAI
                              ? "bg-primary/10"
                              : "bg-emerald-500/10",
                        )}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-medium">
                            {m.authorName}
                          </span>
                          {isAI && (
                            <Badge variant="secondary" className="text-[10px]">
                              AI
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            {formatRelativeTime(m.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed">{m.body}</p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No messages yet.
                </p>
              )}

              <Separator />

              <div className="space-y-2">
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Type your reply…"
                  rows={4}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Reply will be sent to {ticket.customer?.email ?? "the customer"}.
                  </p>
                  <Button
                    onClick={handleReply}
                    disabled={!replyBody.trim() || submitting}
                    size="sm"
                  >
                    <Send className="h-3.5 w-3.5" /> Send reply
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {ticket.activity && ticket.activity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {ticket.activity.map((a) => (
                    <li key={a.id} className="flex gap-3 text-sm">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                      <div>
                        <p>{a.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.actorName ?? "System"} ·{" "}
                          {formatRelativeTime(a.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right — ticket details */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Ticket details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Customer
                </p>
                <div className="mt-1 space-y-0.5">
                  <p className="font-medium">{ticket.customer?.name}</p>
                  {ticket.customer?.email && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" /> {ticket.customer.email}
                    </p>
                  )}
                  {ticket.customer?.phone && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" /> {ticket.customer.phone}
                    </p>
                  )}
                </div>
                {ticket.customer && (
                  <Button
                    asChild
                    variant="link"
                    size="sm"
                    className="mt-1 h-auto p-0 text-xs"
                  >
                    <Link href={`/crm/customers/${ticket.customer.id}`}>
                      View customer →
                    </Link>
                  </Button>
                )}
              </div>

              <Separator />

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Status
                </p>
                <Select
                  value={ticket.status}
                  onValueChange={(v) => handleStatus(v as TicketStatus)}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {TICKET_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Priority
                </p>
                <Select
                  value={ticket.priority}
                  onValueChange={(v) => handlePriority(v as TicketPriority)}
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Stat label="Category" value={TICKET_CATEGORY_LABELS[ticket.category]} />
              <Stat label="Channel" value={ticket.channel?.toLowerCase() ?? "—"} />
              <Stat label="Assigned to" value={ticket.assignedToName ?? "Unassigned"} />
              <Stat
                label="Time logged"
                value={
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatMinutes(ticket.totalMinutesLogged ?? 0)}
                  </span>
                }
              />
              <Stat
                label="Created"
                value={formatDateTime(ticket.createdAt)}
              />
              {ticket.resolvedAt && (
                <Stat
                  label="Resolved"
                  value={formatDateTime(ticket.resolvedAt)}
                />
              )}
              {ticket.slaDueAt && (
                <Stat
                  label="SLA due"
                  value={
                    <Badge
                      variant="outline"
                      className={cn(
                        getStatusColor(
                          new Date(ticket.slaDueAt).getTime() < Date.now()
                            ? "overdue"
                            : "open",
                        ),
                      )}
                    >
                      {formatDateTime(ticket.slaDueAt)}
                    </Badge>
                  }
                />
              )}
            </CardContent>
          </Card>

          {(ticket.relatedOrderId || ticket.relatedProductId) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Link2 className="h-4 w-4" /> Linked entities
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {ticket.relatedOrderId && (
                  <p>
                    Order:{" "}
                    <span className="font-mono text-xs">
                      {ticket.relatedOrderId}
                    </span>
                  </p>
                )}
                {ticket.relatedProductId && (
                  <p>
                    Product:{" "}
                    <span className="font-mono text-xs">
                      {ticket.relatedProductId}
                    </span>
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Tag className="h-4 w-4" /> Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {ticket.description ?? "No description provided."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
