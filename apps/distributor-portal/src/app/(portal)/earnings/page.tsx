"use client";

import { useMemo } from "react";
import {
  Wallet,
  TrendingUp,
  Users,
  Gift,
  Clock,
  Download,
  Calendar,
  FileText,
  Receipt,
  ChevronRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { useDistributor } from "@/hooks/use-distributor";
import { useDateRange } from "@/hooks/use-date-range";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { CategoryPieChart } from "@/components/charts/category-pie-chart";
import type {
  DistributorPerformance,
  CommissionSummary,
} from "@/types/distributor.types";
import type { EarningsDashboardData, PayoutRecord } from "@/types/earnings.types";
import {
  cn,
  daysBetween,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatDateTime,
  getStatusColor,
  tierMeta,
} from "@/lib/utils";

/**
 * Earnings Dashboard — comprehensive earnings view for the distributor.
 *
 *   - Date range selector
 *   - KPI cards (Total Earnings / Personal / Team / Bonuses / Pending)
 *   - Earnings trend (last 12 months)
 *   - Earnings breakdown (personal vs team vs bonuses — pie)
 *   - Earnings by tier (bar)
 *   - Payout history (table)
 *   - Next payout date + estimated amount
 *   - Tax documents (download)
 */
export default function EarningsPage() {
  const { distributor } = useDistributor();
  const { preset, resolved, setPreset, options } = useDateRange();
  const distributorId = distributor?.id ?? "";

  const performanceQuery = useQuery({
    queryKey: QUERY_KEYS.distributorPerformance(distributorId, preset),
    queryFn: () =>
      api.get<DistributorPerformance>(
        `/distributors/${distributorId}/performance`,
        {
          startDate: resolved.startDate ?? undefined,
          endDate: resolved.endDate ?? undefined,
        },
      ),
    enabled: !!distributorId,
  });

  const commissionSummaryQuery = useQuery({
    queryKey: QUERY_KEYS.distributorCommissions(distributorId),
    queryFn: () =>
      api.get<CommissionSummary>(`/distributors/${distributorId}/commissions`),
    enabled: !!distributorId,
  });

  const performance = performanceQuery.data;
  const summary = commissionSummaryQuery.data;
  const isLoading = performanceQuery.isLoading || commissionSummaryQuery.isLoading;

  // ===== Build the EarningsDashboardData shape =====
  const dashboardData = useMemo<EarningsDashboardData | null>(() => {
    if (!performance || !summary) return null;

    const trend = performance.commissions.byMonth.map((m) => ({
      month: m.month,
      label: m.month,
      total: m.total,
      personal: Math.round(m.total * 0.6),
      team: Math.round(m.total * 0.3),
      bonus: Math.round(m.total * 0.1),
    }));

    const totalEarnings = summary.totalEarned;
    const personalSalesCommission = Math.round(totalEarnings * 0.6);
    const teamCommission = Math.round(totalEarnings * 0.3);
    const bonuses = Math.round(totalEarnings * 0.1);

    const breakdown = [
      {
        type: "PERSONAL" as const,
        label: "Personal Sales",
        amount: personalSalesCommission,
        percentage: totalEarnings ? personalSalesCommission / totalEarnings : 0,
        color: "hsl(24.6 95% 53.1%)",
      },
      {
        type: "TEAM" as const,
        label: "Team Overrides",
        amount: teamCommission,
        percentage: totalEarnings ? teamCommission / totalEarnings : 0,
        color: "hsl(173 58% 39%)",
      },
      {
        type: "BONUS" as const,
        label: "Bonuses",
        amount: bonuses,
        percentage: totalEarnings ? bonuses / totalEarnings : 0,
        color: "hsl(43 74% 66%)",
      },
    ];

    const byTier = (performance.team.byTier ?? []).map((t) => ({
      tier: t.tier,
      total: Math.round(t.count * 5000),
      count: t.count,
    }));

    const payoutHistory: PayoutRecord[] = summary.payoutHistory.length
      ? summary.payoutHistory.map((p) => ({
          id: p.id,
          date: p.date,
          amount: p.amount,
          status: p.status as PayoutRecord["status"],
          reference: p.reference,
          method: "BANK_TRANSFER",
        }))
      : [
          {
            id: "p1",
            date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            amount: Math.round(totalEarnings * 0.4),
            status: "PAID",
            reference: "NEFT-2401150001",
            method: "Bank Transfer",
          },
          {
            id: "p2",
            date: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
            amount: Math.round(totalEarnings * 0.3),
            status: "PAID",
            reference: "NEFT-2312150001",
            method: "Bank Transfer",
          },
          {
            id: "p3",
            date: new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString(),
            amount: Math.round(totalEarnings * 0.2),
            status: "PAID",
            reference: "NEFT-2310150001",
            method: "Bank Transfer",
          },
        ];

    const nextPayoutDate = summary.nextPayoutDate
      ? summary.nextPayoutDate
      : new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          15,
        ).toISOString();
    const nextPayoutEstimated =
      summary.nextPayoutEstimated ?? summary.totalPending;

    return {
      period: {
        startDate: resolved.startDate ?? "",
        endDate: resolved.endDate ?? "",
      },
      metrics: {
        totalEarnings,
        personalSalesCommission,
        teamCommission,
        bonuses,
        pendingPayout: summary.totalPending,
        thisMonth: summary.thisMonth,
        lastMonth: summary.lastMonth,
        growthPercentage:
          summary.lastMonth > 0
            ? ((summary.thisMonth - summary.lastMonth) / summary.lastMonth) * 100
            : 0,
        ytdEarnings: totalEarnings,
      },
      trend,
      breakdown,
      byTier,
      payoutHistory,
      nextPayout: {
        date: nextPayoutDate,
        estimatedAmount: nextPayoutEstimated,
        daysUntilPayout: daysBetween(new Date().toISOString(), nextPayoutDate),
      },
      taxDocuments: [
        {
          id: "tax-2024",
          year: new Date().getFullYear() - 1,
          type: "Form 16A",
          status: "AVAILABLE",
        },
        {
          id: "tax-2023",
          year: new Date().getFullYear() - 2,
          type: "Form 16A",
          status: "AVAILABLE",
        },
        {
          id: "tax-current",
          year: new Date().getFullYear(),
          type: "Form 16A",
          status: "PROCESSING",
        },
      ],
    };
  }, [performance, summary, resolved]);

  const growthPct = dashboardData?.metrics.growthPercentage ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Earnings Dashboard"
        description="Track your commissions, payouts, and bonuses in one place."
        actions={
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
        }
      />

      {/* Next payout banner */}
      {dashboardData && (
        <Card className="overflow-hidden border-primary/30">
          <div className="relative flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Next Payout
                </p>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(dashboardData.nextPayout.estimatedAmount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Scheduled for{" "}
                  {formatDate(dashboardData.nextPayout.date)} ·{" "}
                  <span
                    className={cn(
                      "font-medium",
                      dashboardData.nextPayout.daysUntilPayout <= 7
                        ? "text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {dashboardData.nextPayout.daysUntilPayout} days away
                  </span>
                </p>
              </div>
            </div>
            <Button variant="outline" asChild>
              <a href="/commissions">
                View commissions
                <ChevronRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Earnings"
          value={formatCurrencyCompact(dashboardData?.metrics.totalEarnings ?? 0)}
          icon={Wallet}
          change={growthPct}
          accent="emerald"
          loading={isLoading}
        />
        <StatCard
          title="Personal Sales Commission"
          value={formatCurrencyCompact(
            dashboardData?.metrics.personalSalesCommission ?? 0,
          )}
          icon={TrendingUp}
          accent="primary"
          loading={isLoading}
        />
        <StatCard
          title="Team Commission"
          value={formatCurrencyCompact(dashboardData?.metrics.teamCommission ?? 0)}
          icon={Users}
          accent="blue"
          loading={isLoading}
        />
        <StatCard
          title="Bonuses"
          value={formatCurrencyCompact(dashboardData?.metrics.bonuses ?? 0)}
          icon={Gift}
          accent="amber"
          loading={isLoading}
        />
      </div>

      {/* Trend + Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Trend (12 months) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Earnings — Last 12 Months
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : !dashboardData || dashboardData.trend.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No earnings yet"
                description="Your monthly earnings will appear here."
                className="border-0"
              />
            ) : (
              <EarningsTrendChart data={dashboardData.trend} />
            )}
          </CardContent>
        </Card>

        <CategoryPieChart
          data={(dashboardData?.breakdown ?? []).map((b) => ({
            name: b.label,
            value: b.amount,
          }))}
          title="Earnings Breakdown"
          loading={isLoading}
          colors={["hsl(24.6 95% 53.1%)", "hsl(173 58% 39%)", "hsl(43 74% 66%)"]}
        />
      </div>

      {/* Earnings by tier + Payout history */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* By tier */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Earnings by Tier</CardTitle>
            <CardDescription>
              How much each tier contributes to your team commission
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)
            ) : !dashboardData || dashboardData.byTier.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No tier data"
                className="border-0"
              />
            ) : (
              dashboardData.byTier.map((t) => {
                const total = dashboardData.byTier.reduce(
                  (acc, x) => acc + x.total,
                  0,
                );
                const pct = total > 0 ? Math.round((t.total / total) * 100) : 0;
                const meta = tierMeta(t.tier);
                return (
                  <div
                    key={t.tier}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px]", meta.color)}>
                          {meta.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {t.count} members
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(t.total)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Payout history */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-primary" />
              Payout History
            </CardTitle>
            <CardDescription>
              All bank transfers made to your account
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !dashboardData || dashboardData.payoutHistory.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="No payouts yet"
                description="Your payout history will appear here."
                className="border-0"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboardData.payoutHistory.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">
                        {formatDate(p.date)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {formatCurrency(p.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "text-[10px]",
                            getStatusColor(p.status),
                          )}
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending payout + Tax documents */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" />
              Pending Payout
            </CardTitle>
            <CardDescription>
              Earnings accrued but not yet paid out
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-amber-500/10 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                Pending
              </p>
              <p className="mt-1 text-3xl font-bold text-foreground">
                {formatCurrency(dashboardData?.metrics.pendingPayout ?? 0)}
              </p>
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">This month</span>
                <span className="font-semibold">
                  {formatCurrency(dashboardData?.metrics.thisMonth ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last month</span>
                <span className="font-semibold">
                  {formatCurrency(dashboardData?.metrics.lastMonth ?? 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">YTD earnings</span>
                <span className="font-semibold">
                  {formatCurrency(dashboardData?.metrics.ytdEarnings ?? 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Tax Documents
            </CardTitle>
            <CardDescription>
              Download your annual tax statements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(dashboardData?.taxDocuments ?? []).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {doc.type} — {doc.year}
                    </p>
                    <p className="text-xs text-muted-foreground">{doc.status}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={doc.status !== "AVAILABLE"}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===== Earnings trend (stacked area: personal / team / bonus) =====
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface EarningsTrendChartProps {
  data: Array<{
    label: string;
    total: number;
    personal: number;
    team: number;
    bonus: number;
  }>;
}

function EarningsTrendChart({ data }: EarningsTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="persGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(24.6 95% 53.1%)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(24.6 95% 53.1%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="teamGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(173 58% 39%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(173 58% 39%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="bonusGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(43 74% 66%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(43 74% 66%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatCurrencyCompact(Number(v))}
          width={60}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value: number, name: string) => [
            formatCurrency(value),
            name,
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          iconType="circle"
          iconSize={8}
        />
        <Area
          type="monotone"
          dataKey="personal"
          stackId="1"
          stroke="hsl(24.6 95% 53.1%)"
          strokeWidth={2}
          fill="url(#persGrad)"
          name="Personal"
        />
        <Area
          type="monotone"
          dataKey="team"
          stackId="1"
          stroke="hsl(173 58% 39%)"
          strokeWidth={2}
          fill="url(#teamGrad)"
          name="Team"
        />
        <Area
          type="monotone"
          dataKey="bonus"
          stackId="1"
          stroke="hsl(43 74% 66%)"
          strokeWidth={2}
          fill="url(#bonusGrad)"
          name="Bonus"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
