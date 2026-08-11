"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { subDays, format, parseISO } from "date-fns";
import {
  Ticket as TicketIcon,
  Download,
  Filter,
  Clock,
  Smile,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { QUERY_KEYS } from "@/lib/constants";
import {
  getTicketReport,
  summariseTickets,
  type TicketPriority,
  type TicketReportRow,
  type TicketStatus,
} from "@/lib/mock-data";
import { cn, downloadCSV, formatNumber } from "@/lib/utils";

const RANGES = [
  { label: "Last 7 days", value: "7d", days: 7 },
  { label: "Last 30 days", value: "30d", days: 30 },
  { label: "Last 90 days", value: "90d", days: 90 },
];

const STATUS_VARIANT: Record<TicketStatus, "warning" | "live" | "success" | "secondary"> = {
  open: "warning",
  "in-progress": "live",
  resolved: "success",
  closed: "secondary",
};

const PRIORITY_VARIANT: Record<TicketPriority, "secondary" | "warning" | "destructive" | "default"> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
  urgent: "default",
};

const STATUS_COLORS: Record<string, string> = {
  open: "hsl(45 93% 58%)",
  "in-progress": "hsl(219 100% 65%)",
  resolved: "hsl(156 64% 48%)",
  closed: "hsl(230 15% 30%)",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "hsl(230 15% 50%)",
  medium: "hsl(45 93% 58%)",
  high: "hsl(351 83% 64%)",
  urgent: "hsl(0 75% 55%)",
};

export default function TicketsReportPage() {
  const [range, setRange] = useState("30d");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [category, setCategory] = useState("all");
  const [assignee, setAssignee] = useState("all");

  const rangeDef = RANGES.find((r) => r.value === range) ?? RANGES[1]!;
  const startDate = subDays(new Date(), rangeDef.days);

  const reportQuery = useQuery({
    queryKey: QUERY_KEYS.reportTickets(range),
    queryFn: () => getTicketReport(startDate, new Date()),
  });

  const summary = useMemo(() => {
    if (!reportQuery.data) return null;
    return summariseTickets(reportQuery.data);
  }, [reportQuery.data]);

  const categoryOptions = useMemo(() => {
    if (!reportQuery.data) return [];
    return [...new Set(reportQuery.data.map((r) => r.category))].sort();
  }, [reportQuery.data]);
  const assigneeOptions = useMemo(() => {
    if (!reportQuery.data) return [];
    return [...new Set(reportQuery.data.map((r) => r.assignee))].sort();
  }, [reportQuery.data]);

  const filtered = useMemo(() => {
    if (!reportQuery.data) return [];
    return reportQuery.data.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (priority !== "all" && r.priority !== priority) return false;
      if (category !== "all" && r.category !== category) return false;
      if (assignee !== "all" && r.assignee !== assignee) return false;
      return true;
    });
  }, [reportQuery.data, status, priority, category, assignee]);

  function handleExportCSV() {
    if (!filtered.length) return;
    const rows = filtered.map((r: TicketReportRow) => ({
      Date: format(parseISO(r.date), "yyyy-MM-dd"),
      Ticket: r.id,
      Subject: r.subject,
      Status: r.status,
      Priority: r.priority,
      Category: r.category,
      Assignee: r.assignee,
      ResolutionHours: r.resolutionHours ?? "",
      CSAT: r.csat ?? "",
    }));
    downloadCSV(`tickets-report-${range}-${format(new Date(), "yyyyMMdd")}.csv`, rows);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets Report"
        description={`Volume, SLA, and CSAT — ${rangeDef.label.toLowerCase()}.`}
        icon={TicketIcon}
        actions={
          <Button variant="outline" onClick={handleExportCSV} disabled={!filtered.length}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label>Date range</Label>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in-progress">In-progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
                  {assigneeOptions.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Total tickets"
          value={summary ? formatNumber(summary.total) : "—"}
          icon={<TicketIcon className="h-4 w-4" />}
          accent="text-cyan"
        />
        <SummaryCard
          label="Resolved"
          value={summary ? formatNumber(summary.resolved + summary.closed) : "—"}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="text-emerald-500"
        />
        <SummaryCard
          label="Avg resolution"
          value={summary ? `${summary.avgResolutionHours}h` : "—"}
          icon={<Clock className="h-4 w-4" />}
          accent="text-amber-500"
        />
        <SummaryCard
          label="CSAT"
          value={summary ? `${summary.csat.toFixed(2)} / 5` : "—"}
          icon={<Smile className="h-4 w-4" />}
          accent="text-indigo"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By status</CardTitle>
            <CardDescription>Distribution of ticket statuses.</CardDescription>
          </CardHeader>
          <CardContent>
            {!summary ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={summary.byStatus} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 20%)" vertical={false} />
                  <XAxis dataKey="status" stroke="hsl(222 12% 62%)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(222 12% 62%)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(230 18% 9%)",
                      border: "1px solid hsl(230 15% 20%)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(220 25% 95%)" }}
                    cursor={{ fill: "hsl(0 0% 100% / 0.04)" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {summary.byStatus.map((d) => (
                      <Cell key={d.status} fill={STATUS_COLORS[d.status] ?? "hsl(230 15% 30%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By priority</CardTitle>
            <CardDescription>Ticket volume split by priority.</CardDescription>
          </CardHeader>
          <CardContent>
            {!summary ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={summary.byPriority} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 20%)" vertical={false} />
                  <XAxis dataKey="priority" stroke="hsl(222 12% 62%)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(222 12% 62%)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(230 18% 9%)",
                      border: "1px solid hsl(230 15% 20%)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "hsl(220 25% 95%)" }}
                    cursor={{ fill: "hsl(0 0% 100% / 0.04)" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {summary.byPriority.map((d) => (
                      <Cell key={d.priority} fill={PRIORITY_COLORS[d.priority] ?? "hsl(230 15% 30%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resolution trend */}
      <Card>
        <CardHeader>
          <CardTitle>Resolution time trend</CardTitle>
          <CardDescription>Daily average resolution time (hours) vs. tickets opened.</CardDescription>
        </CardHeader>
        <CardContent>
          {!summary ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={summary.byDay} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 20%)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="hsl(222 12% 62%)"
                  fontSize={10}
                  tickFormatter={(d) => format(parseISO(d), "MMM d")}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="hsl(222 12% 62%)" fontSize={10} tickLine={false} axisLine={false} unit="h" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(230 18% 9%)",
                    border: "1px solid hsl(230 15% 20%)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "hsl(220 25% 95%)" }}
                  labelFormatter={(d) => format(parseISO(String(d)), "MMM d, yyyy")}
                />
                <Line
                  type="monotone"
                  dataKey="avgResolution"
                  name="Avg resolution (h)"
                  stroke="hsl(249 70% 66%)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "hsl(249 70% 66%)", strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Detailed tickets table */}
      <Card>
        <CardHeader>
          <CardTitle>Tickets</CardTitle>
          <CardDescription>
            {filtered.length} ticket{filtered.length === 1 ? "" : "s"} match your filters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reportQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <ScrollArea className="max-h-[28rem]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead className="text-right">Resolution</TableHead>
                    <TableHead className="text-right">CSAT</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 100).map((r: TicketReportRow) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {format(parseISO(r.date), "MMM d")}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <span className="line-clamp-1 text-sm">{r.subject}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.assignee}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {r.resolutionHours != null ? `${r.resolutionHours}h` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {r.csat != null ? r.csat.toFixed(1) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Badge variant={PRIORITY_VARIANT[r.priority]} className="text-[10px]">
                            {r.priority}
                          </Badge>
                          <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">
                            {r.status}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.1] py-12 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              No tickets match your filters.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.04]", accent)}>
            {icon}
          </span>
        </div>
        <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}
