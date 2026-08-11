"use client";

import Link from "next/link";
import {
  Bot,
  TrendingUp,
  Users,
  Wallet,
  Target,
  ArrowRight,
  ShoppingBag,
  UserPlus,
  Bell,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useDistributor } from "@/hooks/use-distributor";
import { StatCard } from "@/components/stat-card";
import { SalesChart } from "@/components/charts/sales-chart";
import { CommissionChart } from "@/components/charts/commission-chart";
import { TeamGrowthChart } from "@/components/charts/team-growth-chart";
import { TierDistributionChart } from "@/components/charts/tier-distribution-chart";
import { GoalProgress } from "@/components/charts/goal-progress";
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
import { PageHeader } from "@/components/layout/page-header";
import {
  cn,
  formatCurrency,
  formatCurrencyCompact,
  formatRelativeTime,
  tierMeta,
} from "@/lib/utils";
import { TIERS } from "@/lib/constants";

interface ActivityItem {
  id: string;
  type: "order" | "team" | "lead";
  title: string;
  description: string;
  timestamp: string;
  amount?: number;
}

/**
 * Distributor dashboard — the landing page after login. Surfaces:
 *
 *   - Welcome message + tier badge
 *   - KPI cards (This Month Sales / Commission / Team Size / Active Leads)
 *   - Sales trend (last 6 months)
 *   - Commission history (last 6 months)
 *   - Team growth + tier distribution
 *   - Recent activity (orders + team joins + leads)
 *   - Goal progress toward the next tier
 *   - AI Assistant quick-access card
 *   - Announcements
 */
export default function DashboardPage() {
  const { distributor, performance, commissionSummary, isLoading } =
    useDistributor();

  const displayName =
    distributor?.contactPerson ||
    distributor?.companyName ||
    "Distributor";
  const tier = distributor?.tier ?? "BRONZE";
  const tierInfo = tierMeta(tier);

  const thisMonthSales =
    performance?.sales.byMonth?.[performance.sales.byMonth.length - 1]?.total ??
    distributor?.monthlySales ??
    0;
  const lastMonthSales =
    performance?.sales.byMonth?.[performance.sales.byMonth.length - 2]?.total ??
    thisMonthSales;
  const salesGrowth =
    lastMonthSales > 0
      ? ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100
      : 0;

  const thisMonthCommission =
    commissionSummary?.thisMonth ?? distributor?.monthlyCommission ?? 0;
  const lastMonthCommission = commissionSummary?.lastMonth ?? 0;
  const commissionGrowth =
    lastMonthCommission > 0
      ? ((thisMonthCommission - lastMonthCommission) / lastMonthCommission) *
        100
      : 0;

  const teamSize = performance?.team.totalMembers ?? distributor?.teamSize ?? 0;
  const activeLeads = distributor?.activeLeads ?? 0;

  // Sales chart (last 6 months)
  const salesChartData =
    performance?.sales.byMonth?.map((m) => ({
      label: m.month,
      total: m.total,
      count: m.count,
    })) ?? [];

  // Commission chart (last 6 months)
  const commissionChartData =
    performance?.commissions.byMonth?.map((m) => ({
      label: m.month,
      total: m.total,
      pending: m.pending,
      paid: m.paid,
    })) ?? [];

  // Team growth (cumulative)
  const teamGrowthData =
    performance?.team.growth?.map((g) => ({
      label: g.month,
      added: g.added,
      total: g.total,
    })) ?? [];

  // Tier distribution
  const tierDistribution =
    performance?.team.byTier?.map((t, idx) => {
      const colors = [
        "hsl(35 80% 45%)", // bronze
        "hsl(220 10% 60%)", // silver
        "hsl(45 90% 50%)", // gold
        "hsl(187 74% 55%)", // platinum
      ];
      return {
        name: tierMeta(t.tier).label,
        value: t.count,
        color: colors[idx % colors.length]!,
      };
    }) ?? [];

  // Recent activity (synthesize from performance data)
  const activity: ActivityItem[] = [
    ...(performance?.sales.topProducts?.slice(0, 2).map((p, i) => ({
      id: `prod-${i}`,
      type: "order" as const,
      title: `New order: ${p.productName}`,
      description: `${p.quantity} units · ${formatCurrency(p.revenue)}`,
      timestamp: new Date(Date.now() - i * 3_600_000).toISOString(),
      amount: p.revenue,
    })) ?? []),
    ...(performance?.team.growth?.slice(-1).map((g, i) => ({
      id: `team-${i}`,
      type: "team" as const,
      title: `${g.added} new team member${g.added === 1 ? "" : "s"} joined`,
      description: `Team size is now ${g.total}`,
      timestamp: new Date(Date.now() - 5_400_000).toISOString(),
    })) ?? []),
    {
      id: "lead-1",
      type: "lead",
      title: "New lead assigned",
      description: "Priya Sharma is interested in Gold-tier products",
      timestamp: new Date(Date.now() - 7_200_000).toISOString(),
    },
  ].slice(0, 5);

  // Compute next-tier goal
  const currentTierIdx = TIERS.findIndex((t) => t.value === tier);
  const nextTier = TIERS[currentTierIdx + 1];

  const announcements = [
    {
      id: "a1",
      title: "Q1 Sales Challenge — Win a Trip to Goa!",
      description:
        "Top 10 distributors by Q1 sales win an all-expenses-paid retreat.",
      badge: "Challenge",
      badgeVariant: "warning" as const,
    },
    {
      id: "a2",
      title: "New Product Launch: Dayjoy Ayurveda Range",
      description:
        "Earn 2x commission on all Ayurveda products through March 31.",
      badge: "New",
      badgeVariant: "info" as const,
    },
    {
      id: "a3",
      title: "Training: Mastering Voice AI Sales",
      description:
        "Live webinar on Thursday at 6 PM IST. Register now to secure your spot.",
      badge: "Training",
      badgeVariant: "default" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Welcome back, ${displayName.split(" ")[0]} 👋`}
        description="Here's what's happening with your business today."
        actions={
          <Button asChild>
            <Link href="/ai-assistant">
              <Bot className="h-4 w-4" />
              Ask AI Assistant
            </Link>
          </Button>
        }
      />

      {/* Tier banner */}
      <Card className="overflow-hidden border-primary/20">
        <div className="relative bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full ring-2",
                  tierInfo.ring,
                )}
              >
                <Sparkles className={cn("h-6 w-6", tierInfo.color)} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-foreground">
                    {tierInfo.label} Distributor
                  </h2>
                  <Badge variant="outline" className={tierInfo.color}>
                    {tier}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {distributor?.distributorCode
                    ? `Code: ${distributor.distributorCode} · `
                    : ""}
                  Member since{" "}
                  {distributor?.joinedAt
                    ? new Date(distributor.joinedAt).toLocaleDateString(
                        "en-IN",
                        { day: "numeric", month: "short", year: "numeric" },
                      )
                    : "recently"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="text-xs text-muted-foreground">
                  This Month&apos;s Sales
                </p>
                <p className="text-xl font-bold text-foreground">
                  {formatCurrency(thisMonthSales)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="This Month Sales"
          value={formatCurrencyCompact(thisMonthSales)}
          icon={TrendingUp}
          change={salesGrowth}
          accent="emerald"
          loading={isLoading}
        />
        <StatCard
          title="This Month Commission"
          value={formatCurrencyCompact(thisMonthCommission)}
          icon={Wallet}
          change={commissionGrowth}
          accent="amber"
          loading={isLoading}
        />
        <StatCard
          title="Team Size"
          value={teamSize}
          icon={Users}
          description={`${performance?.team.activeMembers ?? teamSize} active`}
          accent="blue"
          loading={isLoading}
        />
        <StatCard
          title="Active Leads"
          value={activeLeads}
          icon={Target}
          description="Awaiting follow-up"
          accent="purple"
          loading={isLoading}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SalesChart
          data={salesChartData}
          title="Sales — Last 6 Months"
          loading={isLoading}
        />
        <CommissionChart
          data={commissionChartData}
          title="Commissions — Last 6 Months"
          loading={isLoading}
        />
      </div>

      {/* Team growth + tier distribution + goal progress */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TeamGrowthChart
            data={teamGrowthData}
            title="Team Growth"
            loading={isLoading}
          />
        </div>
        <GoalProgress
          currentTier={tier}
          currentSales={thisMonthSales}
          nextTierThreshold={nextTier?.minSales}
          nextTierName={nextTier?.label}
          loading={isLoading}
        />
      </div>

      {/* Tier distribution + Recent activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TierDistributionChart
          data={tierDistribution}
          title="Team Tier Distribution"
          loading={isLoading}
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                Recent Activity
              </span>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/orders">
                  View all
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : activity.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="No recent activity"
                description="New orders, team members, and leads will appear here."
                className="border-0"
              />
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {activity.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-accent"
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        item.type === "order" && "bg-emerald-500/10 text-emerald-600",
                        item.type === "team" && "bg-blue-500/10 text-blue-600",
                        item.type === "lead" && "bg-purple-500/10 text-purple-600",
                      )}
                    >
                      {item.type === "order" && (
                        <ShoppingBag className="h-4 w-4" />
                      )}
                      {item.type === "team" && <UserPlus className="h-4 w-4" />}
                      {item.type === "lead" && <Target className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                    <div className="text-right">
                      {item.amount && (
                        <p className="text-xs font-semibold text-foreground">
                          {formatCurrency(item.amount)}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {formatRelativeTime(item.timestamp)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Assistant + Announcements */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* AI Assistant quick access */}
        <Card className="overflow-hidden border-primary/30">
          <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient shadow-lg">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-foreground">
                  Your AI Business Coach
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Get personalised recommendations on closing leads, growing
                  your team, and maximising your commissions.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link href="/ai-assistant">
                      <Sparkles className="h-3.5 w-3.5" />
                      Open Assistant
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/training">View Training</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Announcements */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" />
              Announcements
            </CardTitle>
            <CardDescription>Latest from Dayjoy HQ</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {announcements.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                >
                  <Badge variant={a.badgeVariant} className="shrink-0">
                    {a.badge}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {a.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
