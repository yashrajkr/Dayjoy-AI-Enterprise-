"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, TicketIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useTickets } from "@/hooks/use-tickets";
import { useDebounce } from "@/hooks/use-debounce";
import {
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
} from "@/lib/constants";
import type {
  TicketPriority,
  TicketStatus,
} from "@/types/ticket.types";
import {
  cn,
  formatDate,
  formatRelativeTime,
  getStatusColor,
} from "@/lib/utils";

const STATUSES: (TicketStatus | "ALL")[] = [
  "ALL",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "CLOSED",
  "ESCALATED",
];

const PRIORITIES: (TicketPriority | "ALL")[] = [
  "ALL",
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
];

const ASSIGNEES = [
  { value: "ALL", label: "Anyone" },
  { value: "ME", label: "Me" },
  { value: "UNASSIGNED", label: "Unassigned" },
] as const;

export default function TicketsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TicketStatus | "ALL">("ALL");
  const [priority, setPriority] = useState<TicketPriority | "ALL">("ALL");
  const [assignee, setAssignee] = useState<
    "ALL" | "ME" | "UNASSIGNED"
  >("ME");
  const debouncedSearch = useDebounce(search, 300);

  const filters = useMemo(
    () => ({
      status,
      priority,
      assignedToId: assignee,
      search: debouncedSearch,
    }),
    [status, priority, assignee, debouncedSearch],
  );

  const { data, isLoading, isError } = useTickets(filters);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((t) => {
      if (status !== "ALL" && t.status !== status) return false;
      if (priority !== "ALL" && t.priority !== priority) return false;
      if (assignee === "ME" && !t.assignedToName) return false;
      if (assignee === "UNASSIGNED" && t.assignedToName) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        if (
          !t.number.toLowerCase().includes(q) &&
          !t.subject.toLowerCase().includes(q) &&
          !(t.customer?.name ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [data, status, priority, assignee, debouncedSearch]);

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Support requests assigned to you and your team."
        actions={
          <Button asChild size="sm">
            <Link href="/tickets/new">
              <Plus className="h-4 w-4" /> New ticket
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ticket #, subject, customer…"
              className="pl-9"
              aria-label="Search tickets"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus | "ALL")}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TICKET_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority | "ALL")}>
              <SelectTrigger className="h-9 w-[130px]">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p === "ALL" ? "All priorities" : p.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assignee} onValueChange={(v) => setAssignee(v as typeof assignee)}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNEES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <EmptyState title="Couldn't load tickets" description="Please try again in a moment." />
      ) : isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={TicketIcon}
          title="No tickets found"
          description="Try adjusting your filters."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Ticket #</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="w-[160px]">Customer</TableHead>
                <TableHead className="w-[100px]">Priority</TableHead>
                <TableHead className="w-[140px]">Status</TableHead>
                <TableHead className="w-[140px]">Assigned to</TableHead>
                <TableHead className="w-[120px]">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow
                  key={t.id}
                  onClick={() => router.push(`/tickets/${t.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-mono text-xs">{t.number}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium text-foreground">
                      {t.subject}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {TICKET_CATEGORY_LABELS[t.category]} ·{" "}
                      {t.channel?.toLowerCase()}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.customer?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(getStatusColor(t.priority))}
                    >
                      {t.priority.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(getStatusColor(t.status))}
                    >
                      {TICKET_STATUS_LABELS[t.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {t.assignedToName ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span title={formatDate(t.createdAt)}>
                      {formatRelativeTime(t.createdAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
