"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LifeBuoy,
  Search,
  Loader2,
  ChevronRight,
  Plus,
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TicketStatusBadge,
  TicketPriorityBadge,
} from "@/components/support/ticket-status-badge";
import { useSupportTickets } from "@/hooks/use-api";
import { ROUTES, TICKET_STATUSES, TICKET_PRIORITIES } from "@/lib/constants";
import { formatRelativeTime, formatDateTime } from "@/lib/utils";

/**
 * My Tickets — table of the customer's support tickets with filters
 * for status and priority, plus a search box. Click a row to open the
 * ticket detail page.
 */
export default function MyTicketsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [priority, setPriority] = useState<string>("ALL");

  const { data, isLoading, isError } = useSupportTickets({
    search: search || undefined,
    status: status === "ALL" ? undefined : status,
    priority: priority === "ALL" ? undefined : priority,
  });

  const tickets = data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="My Tickets"
        description="Track the status of all your support requests."
        icon={LifeBuoy}
        actions={
          <Button asChild>
            <Link href={ROUTES.supportNewTicket}>
              <Plus className="mr-2 h-4 w-4" />
              New ticket
            </Link>
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by subject or ticket number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search tickets"
          />
        </div>
        <div className="flex gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px]" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-[140px]" aria-label="Filter by priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All priorities</SelectItem>
              {TICKET_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tickets…
            </div>
          ) : isError ? (
            <EmptyState
              icon={AlertCircle}
              title="Couldn't load tickets"
              description="Please try again later."
            />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title={search || status !== "ALL" || priority !== "ALL" ? "No matching tickets" : "No tickets yet"}
              description={
                search || status !== "ALL" || priority !== "ALL"
                  ? "Try adjusting your filters."
                  : "Raise a ticket to get help from our support team."
              }
              action={
                <Button asChild>
                  <Link href={ROUTES.supportNewTicket}>
                    <Plus className="mr-2 h-4 w-4" />
                    New ticket
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Ticket</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="hidden px-4 py-3 md:table-cell">Status</th>
                    <th className="hidden px-4 py-3 md:table-cell">Priority</th>
                    <th className="hidden px-4 py-3 lg:table-cell">Created</th>
                    <th className="px-4 py-3 text-right">Updated</th>
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      className="cursor-pointer transition-colors hover:bg-accent/30"
                      onClick={() =>
                        (window.location.href = `/support/tickets/${t.id}`)
                      }
                    >
                      <td className="px-4 py-3 align-top">
                        <span className="font-mono text-xs text-muted-foreground">
                          {t.ticketNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/support/tickets/${t.id}`}
                          className="font-medium text-foreground hover:text-primary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t.subject}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.category}
                        </p>
                      </td>
                      <td className="hidden px-4 py-3 align-top md:table-cell">
                        <TicketStatusBadge status={t.status} />
                      </td>
                      <td className="hidden px-4 py-3 align-top md:table-cell">
                        <TicketPriorityBadge priority={t.priority} />
                      </td>
                      <td className="hidden px-4 py-3 align-top text-xs text-muted-foreground lg:table-cell">
                        {formatDateTime(t.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right align-top text-xs text-muted-foreground">
                        {formatRelativeTime(t.updatedAt)}
                      </td>
                      <td className="px-2 py-3 align-top">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
