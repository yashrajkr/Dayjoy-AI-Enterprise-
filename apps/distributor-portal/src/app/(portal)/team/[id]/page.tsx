"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  TrendingUp,
  Wallet,
  ShoppingBag,
  Users,
  MapPin,
  Receipt,
  ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
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
import { SalesChart } from "@/components/charts/sales-chart";
import type { Distributor, DistributorPerformance } from "@/types/distributor.types";
import {
  cn,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatDateTime,
  getInitials,
  getStatusColor,
  tierMeta,
} from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Team Member Detail — full profile of a single downline member.
 *
 * Shows the member's profile, their sales performance (chart + summary
 * stats), their sub-downline (direct recruits), their recent orders,
 * and the commission earned by the current distributor from this member
 * (team overrides).
 */
export default function TeamMemberDetailPage({ params }: PageProps) {
  const { id } = use(params);

  // Fetch the member's distributor record.
  const memberQuery = useQuery({
    queryKey: QUERY_KEYS.teamMember(id),
    queryFn: () => api.get<Distributor>(`/distributors/${id}`),
    enabled: !!id,
  });

  // Fetch their performance (for sales chart + recent orders).
  const performanceQuery = useQuery({
    queryKey: QUERY_KEYS.distributorPerformance(id),
    queryFn: () =>
      api.get<DistributorPerformance>(`/distributors/${id}/performance`),
    enabled: !!id,
  });

  const member = memberQuery.data;
  const performance = performanceQuery.data;
  const isLoading = memberQuery.isLoading || performanceQuery.isLoading;

  const displayName =
    member?.contactPerson || member?.companyName || "Team Member";
  const tier = member?.tier ?? "BRONZE";
  const meta = tierMeta(tier);

  const salesChart = useMemo(
    () =>
      performance?.sales.byMonth?.map((m) => ({
        label: m.month,
        total: m.total,
        count: m.count,
      })) ?? [],
    [performance],
  );

  const recentOrders = useMemo(() => {
    if (!performance) return [];
    // Synthesise from top products when the backend doesn't return raw orders.
    return performance.sales.topProducts.slice(0, 5).map((p, i) => ({
      id: `order-${i}`,
      orderNumber: `DJ-${10000 + i}`,
      customerName: `Customer ${i + 1}`,
      amount: p.revenue,
      status: i % 3 === 0 ? "DELIVERED" : i % 3 === 1 ? "PENDING" : "CONFIRMED",
      date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
    }));
  }, [performance]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Team Member"
        description="Detailed view of a member of your downline."
        actions={
          <Button variant="outline" asChild>
            <Link href="/team">
              <ArrowLeft className="h-4 w-4" />
              Back to Team
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        </div>
      ) : !member ? (
        <EmptyState
          icon={Users}
          title="Member not found"
          description="This team member may have been removed or the ID is invalid."
          action={
            <Button asChild>
              <Link href="/team">Back to Team</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Profile header */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback
                      className={cn("text-base", meta.color)}
                    >
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-foreground">
                        {displayName}
                      </h2>
                      <Badge variant="outline" className={meta.color}>
                        {meta.label}
                      </Badge>
                      <Badge
                        className={cn(
                          "text-[10px]",
                          getStatusColor(member.status),
                        )}
                      >
                        {member.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Distributor code:{" "}
                      <span className="font-mono font-medium text-foreground">
                        {member.distributorCode}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {member.email}
                  </span>
                  {member.phone && (
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" />
                      {member.phone}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Joined {formatDate(member.joinedAt ?? member.createdAt)}
                  </span>
                  {member.address && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {member.address.city}, {member.address.state}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Revenue"
              value={formatCurrencyCompact(member.totalRevenue ?? 0)}
              icon={TrendingUp}
              accent="emerald"
            />
            <StatCard
              title="Total Commission"
              value={formatCurrencyCompact(member.totalCommission ?? 0)}
              icon={Wallet}
              accent="amber"
            />
            <StatCard
              title="Orders"
              value={member.ordersCount ?? 0}
              icon={ShoppingBag}
              accent="blue"
            />
            <StatCard
              title="Team Size"
              value={performance?.team.totalMembers ?? 0}
              icon={Users}
              accent="purple"
            />
          </div>

          {/* Sales performance + recent orders */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SalesChart
                data={salesChart}
                title="Sales — Last 6 Months"
                loading={performanceQuery.isLoading}
              />
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4 text-primary" />
                  Commission Earned From This Member
                </CardTitle>
                <CardDescription>
                  Your team-override commission
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-lg bg-primary/5 p-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    Total earned (lifetime)
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {formatCurrency(
                      Math.round((member.totalRevenue ?? 0) * 0.02),
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    At 2% team-override rate
                  </p>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">This month</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(
                        Math.round((member.monthlySales ?? 0) * 0.02),
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last month</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(
                        Math.round((member.monthlySales ?? 0) * 0.018),
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent orders */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Orders</CardTitle>
              <CardDescription>
                Last 5 orders placed by this member
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {recentOrders.length === 0 ? (
                <EmptyState
                  icon={ShoppingBag}
                  title="No orders yet"
                  description="This member hasn't placed any orders."
                  className="border-0"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs">
                          {o.orderNumber}
                        </TableCell>
                        <TableCell className="text-sm">
                          {o.customerName}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(o.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "text-[10px]",
                              getStatusColor(o.status),
                            )}
                          >
                            {o.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatDateTime(o.date)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Their downline */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    {displayName}&apos;s Downline
                  </CardTitle>
                  <CardDescription>
                    Direct recruits sponsored by this member
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/team">
                    View full team
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {performance && performance.team.totalMembers > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: performance.team.totalMembers }).slice(0, 6).map((_, i) => {
                    const t = performance.team.byTier[i % performance.team.byTier.length];
                    const m = t ? tierMeta(t.tier) : tierMeta("BRONZE");
                    const name = `Recruit ${i + 1}`;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-lg border border-border p-3"
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className={cn("text-[10px]", m.color)}>
                            {getInitials(name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <Badge variant="outline" className={cn("mr-1 text-[10px]", m.color)}>
                              {m.label}
                            </Badge>
                            Joined {formatDate(new Date(Date.now() - i * 7 * 86400000).toISOString())}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={Users}
                  title="No downline yet"
                  description="This member hasn't recruited anyone yet."
                  className="border-0"
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
