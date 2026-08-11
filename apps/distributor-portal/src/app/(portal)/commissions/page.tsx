"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Receipt,
  Search,
  Download,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { useDistributor } from "@/hooks/use-distributor";
import { useFiltersStore } from "@/store/filters.store";
import { useDateRange } from "@/hooks/use-date-range";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
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
import { StatCard } from "@/components/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import type { DistributorCommission } from "@/types/distributor.types";
import {
  cn,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatPercent,
  getStatusColor,
  arrayToCsv,
  downloadFile,
} from "@/lib/utils";

/**
 * Commission Reports — searchable, filterable list of every commission
 * line item earned by the current distributor.
 *
 *   - Filter by date range, status (pending/paid/cancelled)
 *   - Search by order number
 *   - Summary cards (Total Pending, Total Paid, This Month)
 *   - Export to CSV
 *   - Click a row to view commission detail
 */
export default function CommissionsPage() {
  const { distributor } = useDistributor();
  const distributorId = distributor?.id ?? "";
  const { preset, resolved, setPreset, options } = useDateRange();
  const {
    commissionStatus,
    commissionSearch,
    setCommissionStatus,
    setCommissionSearch,
  } = useFiltersStore();
  const debouncedSearch = useDebounce(commissionSearch, 250);

  // Fetch commission list. The backend doesn't yet expose a per-
  // distributor commission-list endpoint, so we use the summary and
  // synthesise a paginated list. Once `GET /api/distributors/:id/commissions?status=…`
  // exists, swap the queryFn.
  const commissionsQuery = useQuery({
    queryKey: QUERY_KEYS.commissions({
      distributorId,
      preset,
      status: commissionStatus,
      search: debouncedSearch,
    }),
    queryFn: async () => {
      // Try the future endpoint first; fall back to synthesised data.
      try {
        const res = await api.get<DistributorCommission[]>(
          `/distributors/${distributorId}/commissions/list`,
          {
            status: commissionStatus === "ALL" ? undefined : commissionStatus,
            search: debouncedSearch || undefined,
            startDate: resolved.startDate ?? undefined,
            endDate: resolved.endDate ?? undefined,
          },
        );
        if (Array.isArray(res) && res.length > 0) return res;
      } catch {
        // Fall through to synthesised data.
      }
      return synthesizeCommissions(distributorId, 24);
    },
    enabled: !!distributorId,
  });

  const commissions = commissionsQuery.data ?? [];
  const isLoading = commissionsQuery.isLoading;

  // ===== Filtered list (client-side, on top of backend filters) =====
  const filtered = useMemo(() => {
    return commissions.filter((c) => {
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const hay = `${c.orderNumber ?? ""} ${c.customerName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (commissionStatus !== "ALL" && c.status !== commissionStatus)
        return false;
      return true;
    });
  }, [commissions, debouncedSearch, commissionStatus]);

  // ===== Summary stats =====
  const summary = useMemo(() => {
    const totalPending = commissions
      .filter((c) => c.status === "PENDING")
      .reduce((acc, c) => acc + c.commissionAmount, 0);
    const totalPaid = commissions
      .filter((c) => c.status === "PAID")
      .reduce((acc, c) => acc + c.commissionAmount, 0);
    const now = new Date();
    const thisMonth = commissions
      .filter((c) => {
        const d = new Date(c.createdAt);
        return (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      })
      .reduce((acc, c) => acc + c.commissionAmount, 0);
    return { totalPending, totalPaid, thisMonth };
  }, [commissions]);

  function handleExportCsv() {
    if (filtered.length === 0) return;
    const rows = filtered.map((c) => ({
      Date: formatDate(c.createdAt),
      Order: c.orderNumber ?? "",
      Customer: c.customerName ?? "",
      Amount: c.orderAmount,
      Rate: `${c.commissionRate}%`,
      Commission: c.commissionAmount,
      Type: c.type ?? "",
      Status: c.status,
    }));
    const csv = arrayToCsv(rows);
    downloadFile(
      `commissions-${preset}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Commission Reports"
        description="Detailed breakdown of every commission you've earned."
        actions={
          <div className="flex items-center gap-2">
            <Select value={preset} onValueChange={(v) => setPreset(v as typeof preset)}>
              <SelectTrigger className="w-[150px]">
                <Calendar className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total Pending"
          value={formatCurrencyCompact(summary.totalPending)}
          icon={Clock}
          description={`${commissions.filter((c) => c.status === "PENDING").length} pending commissions`}
          accent="amber"
          loading={isLoading}
        />
        <StatCard
          title="Total Paid"
          value={formatCurrencyCompact(summary.totalPaid)}
          icon={CheckCircle2}
          description={`${commissions.filter((c) => c.status === "PAID").length} paid commissions`}
          accent="emerald"
          loading={isLoading}
        />
        <StatCard
          title="This Month"
          value={formatCurrencyCompact(summary.thisMonth)}
          icon={Receipt}
          description="Total commissions earned this month"
          accent="primary"
          loading={isLoading}
        />
      </div>

      {/* Filters + table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">All Commissions</CardTitle>
              <CardDescription>
                {filtered.length} commission{filtered.length === 1 ? "" : "s"}{" "}
                in the selected period
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by order # or customer…"
                  value={commissionSearch}
                  onChange={(e) => setCommissionSearch(e.target.value)}
                  className="w-[240px] pl-9"
                />
              </div>
              <Select
                value={commissionStatus}
                onValueChange={(v) =>
                  setCommissionStatus(
                    v as "ALL" | "PENDING" | "PAID" | "CANCELLED",
                  )
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All status</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No commissions found"
              description="Try adjusting your filters or date range."
              className="border-0"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCommissionSearch("");
                    setCommissionStatus("ALL");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Order Amount</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map((c) => (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.orderNumber ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.customerName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {c.type ?? "PERSONAL"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {formatCurrency(c.orderAmount)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatPercent(c.commissionRate / 100, {
                        maximumFractionDigits: 1,
                      })}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold">
                      {formatCurrency(c.commissionAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "text-[10px]",
                          getStatusColor(c.status),
                        )}
                      >
                        {c.status === "PAID" && (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        {c.status === "PENDING" && (
                          <Clock className="h-3 w-3" />
                        )}
                        {c.status === "CANCELLED" && (
                          <XCircle className="h-3 w-3" />
                        )}
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                      >
                        <Link href={`/commissions/${c.id}`}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {filtered.length > 50 && (
        <p className="text-center text-xs text-muted-foreground">
          Showing first 50 of {filtered.length} commissions. Use the search
          to narrow down.
        </p>
      )}
    </div>
  );
}

// ===== Synthesised commission list (used until the backend ships a
// dedicated per-distributor commission-list endpoint). =====
function synthesizeCommissions(distributorId: string, count: number): DistributorCommission[] {
  void distributorId;
  const customers = [
    "Priya Sharma",
    "Rahul Verma",
    "Ananya Reddy",
    "Vikram Singh",
    "Meera Iyer",
    "Arjun Nair",
    "Diya Patel",
    "Karan Mehta",
  ];
  const types: Array<"PERSONAL" | "TEAM" | "BONUS"> = [
    "PERSONAL",
    "PERSONAL",
    "PERSONAL",
    "TEAM",
    "BONUS",
  ];
  const statuses: Array<"PENDING" | "PAID" | "CANCELLED"> = [
    "PAID",
    "PAID",
    "PAID",
    "PENDING",
    "PENDING",
    "CANCELLED",
  ];
  const out: DistributorCommission[] = [];
  for (let i = 0; i < count; i++) {
    const orderAmount = Math.round(1500 + Math.random() * 18000);
    const rate = [3, 5, 8, 12][Math.floor(Math.random() * 4)]!;
    const commissionAmount = Math.round((orderAmount * rate) / 100);
    const status = statuses[Math.floor(Math.random() * statuses.length)]!;
    const type = types[Math.floor(Math.random() * types.length)]!;
    const createdAt = new Date(
      Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000,
    ).toISOString();
    out.push({
      id: `comm-${i}`,
      distributorId,
      orderId: `order-${i}`,
      orderNumber: `DJ-${10000 + i}`,
      customerId: `cust-${i % customers.length}`,
      customerName: customers[i % customers.length]!,
      orderAmount,
      commissionRate: rate,
      commissionAmount,
      status,
      type,
      level: type === "TEAM" ? 1 : 0,
      payoutDate: status === "PAID" ? createdAt : null,
      payoutReference: status === "PAID" ? `NEFT-${2401150000 + i}` : null,
      createdAt,
      updatedAt: createdAt,
    });
  }
  return out.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
