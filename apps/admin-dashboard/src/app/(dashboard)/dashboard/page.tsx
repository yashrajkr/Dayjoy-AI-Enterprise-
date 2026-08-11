"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Bot,
  Boxes,
  IndianRupee,
  PhoneCall,
  MessageCircle,
  MessageSquare,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import {
  ActivityFeed,
  type ActivityItem,
  type HealthCheck,
  ChartCard,
  ChartSkeleton,
  ErrorState,
  KpiCard,
  KpiSkeleton,
  LoadingSpinner,
  SystemHealth,
} from "@/components/dashboard";

// ===== Types (local — these mirror what Agent A's analytics service will return) =====

interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

interface OrdersByStatus {
  status: string;
  count: number;
  color: string;
}

interface ChannelUsage {
  channel: string;
  count: number;
}

interface TopProduct {
  name: string;
  revenue: number;
  units: number;
}

interface RecentOrder {
  id: string;
  customer: string;
  amount: number;
  status: string;
  placedAt: string;
}

interface RecentLead {
  id: string;
  name: string;
  source: string;
  intent: string;
  createdAt: string;
}

interface RecentCall {
  id: string;
  customer: string;
  direction: "INBOUND" | "OUTBOUND";
  durationSec: number;
  outcome: string;
  startedAt: string;
}

interface RecentConversation {
  id: string;
  channel: "voice" | "chat" | "whatsapp";
  customer: string;
  snippet: string;
  createdAt: string;
}

interface DashboardSummary {
  totalCustomers: number;
  customersTrend: number;
  ordersToday: number;
  ordersTrend: number;
  revenueToday: number;
  revenueTrend: number;
  activeConversations: {
    voice: number;
    chat: number;
    whatsapp: number;
    total: number;
  };
  revenue7d: RevenuePoint[];
  ordersByStatus: OrdersByStatus[];
  aiUsageByChannel: ChannelUsage[];
  topProducts: TopProduct[];
  recentOrders: RecentOrder[];
  recentLeads: RecentLead[];
  recentCalls: RecentCall[];
  recentConversations: RecentConversation[];
  systemHealth: {
    api: HealthCheck;
    database: HealthCheck;
    redis: HealthCheck;
    voice: HealthCheck;
    avgResponseMs: number;
  };
}

const CHART_COLORS = [
  "hsl(var(--indigo))",
  "hsl(var(--cyan))",
  "hsl(var(--azure))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
];

const tooltipStyle = {
  background: "hsl(var(--surface-2))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--foreground))",
} as const;

// ===== Helpers =====

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// ===== Page =====

export default function DashboardPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<DashboardSummary>({
    queryKey: ["dashboard", "summary"],
    queryFn: () => api.get<DashboardSummary>("/dashboard/summary"),
    refetchInterval: 60_000,
  });

  // Compose the unified activity feed from the four recent-* arrays.
  const activities = useMemo<ActivityItem[]>(() => {
    if (!data) return [];
    const items: ActivityItem[] = [];

    data.recentOrders.slice(0, 4).forEach((o) =>
      items.push({
        id: `order-${o.id}`,
        icon: ShoppingCart,
        title: `Order ${o.id} placed by ${o.customer}`,
        description: `₹${o.amount.toLocaleString("en-IN")} • ${o.status}`,
        time: relativeTime(o.placedAt),
        channel: "Order",
        variant: "success",
      }),
    );
    data.recentLeads.slice(0, 3).forEach((l) =>
      items.push({
        id: `lead-${l.id}`,
        icon: Users,
        title: `New lead: ${l.name}`,
        description: `${l.source} • ${l.intent}`,
        time: relativeTime(l.createdAt),
        channel: "Lead",
      }),
    );
    data.recentCalls.slice(0, 3).forEach((c) =>
      items.push({
        id: `call-${c.id}`,
        icon: PhoneCall,
        title: `${c.direction === "INBOUND" ? "Inbound" : "Outbound"} call · ${c.customer}`,
        description: `${formatDuration(c.durationSec)} • ${c.outcome}`,
        time: relativeTime(c.startedAt),
        channel: "Voice",
        variant: "live",
      }),
    );
    data.recentConversations.slice(0, 4).forEach((c) => {
      const icon =
        c.channel === "voice"
          ? PhoneCall
          : c.channel === "whatsapp"
            ? MessageCircle
            : MessageSquare;
      items.push({
        id: `conv-${c.id}`,
        icon,
        title: `${c.channel[0]!.toUpperCase()}${c.channel.slice(1)} with ${c.customer}`,
        description: c.snippet,
        time: relativeTime(c.createdAt),
        channel: c.channel,
        variant: c.channel === "voice" ? "live" : "default",
      });
    });

    return items;
  }, [data]);

  const healthChecks: HealthCheck[] = data
    ? [
        data.systemHealth.api,
        data.systemHealth.database,
        data.systemHealth.redis,
        data.systemHealth.voice,
      ]
    : [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="Real-time overview of your AI platform performance"
          actions={
            <Badge variant="live" dot>
              Live
            </Badge>
          }
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ChartSkeleton className="lg:col-span-2" />
          <ChartSkeleton />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ChartSkeleton className="lg:col-span-2" />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="Real-time overview of your AI platform performance"
        />
        <ErrorState
          message={
            error instanceof Error
              ? error.message
              : "Failed to load dashboard data"
          }
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Real-time overview of your AI platform performance"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              {isFetching ? "Refreshing…" : "Refresh"}
            </Button>
            <Badge variant="live" dot>
              Live
            </Badge>
          </div>
        }
      />

      {/* ===== KPI cards ===== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Customers"
          value={data.totalCustomers}
          trend={data.customersTrend}
          trendLabel="vs last 7d"
          icon={Users}
        />
        <KpiCard
          title="Orders Today"
          value={data.ordersToday}
          trend={data.ordersTrend}
          trendLabel="vs yesterday"
          icon={ShoppingCart}
        />
        <KpiCard
          title="Revenue Today"
          value={data.revenueToday}
          trend={data.revenueTrend}
          trendLabel="vs yesterday"
          icon={IndianRupee}
          format="currency"
        />
        <KpiCard
          title="Active Conversations"
          value={data.activeConversations.total}
          icon={MessageSquare}
          trendNeutral
          trendLabel={`${data.activeConversations.voice} voice · ${data.activeConversations.chat} chat · ${data.activeConversations.whatsapp} WhatsApp`}
        />
      </div>

      {/* ===== Charts row 1: revenue + orders donut ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard
          title="Revenue (Last 7 Days)"
          description="Daily revenue across all channels"
          icon={IndianRupee}
          className="lg:col-span-2"
          actions={
            <div className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <ArrowUpRight className="h-3 w-3 text-success" />
              <span className="font-mono text-success">
                +{data.revenueTrend.toFixed(1)}%
              </span>
              <span>WoW</span>
            </div>
          }
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.revenue7d}
                margin={{ left: -10, right: 8, top: 8 }}
              >
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="hsl(var(--indigo))"
                      stopOpacity={0.55}
                    />
                    <stop
                      offset="100%"
                      stopColor="hsl(var(--indigo))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => [
                    `₹${value.toLocaleString("en-IN")}`,
                    "Revenue",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--indigo))"
                  strokeWidth={2.5}
                  fill="url(#revenueFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Orders by Status"
          description="Today's order pipeline"
          icon={Boxes}
        >
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.ordersByStatus}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  stroke="none"
                >
                  {data.ordersByStatus.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => [value, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {data.ordersByStatus.map((s, i) => (
              <div
                key={s.status}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      s.color ?? CHART_COLORS[i % CHART_COLORS.length],
                  }}
                />
                <span className="truncate">{s.status}</span>
                <span className="ml-auto font-mono text-foreground">
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* ===== Charts row 2: AI usage + top products ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard
          title="AI Usage by Channel"
          description="Conversations handled per channel today"
          icon={Bot}
        >
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.aiUsageByChannel}
                margin={{ left: -10, right: 8, top: 8 }}
              >
                <XAxis
                  dataKey="channel"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "hsl(var(--surface-3) / 0.3)" }}
                  formatter={(value: number) => [value, "Conversations"]}
                />
                <Bar
                  dataKey="count"
                  radius={[6, 6, 0, 0]}
                  fill="hsl(var(--cyan))"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Top 5 Products"
          description="By revenue this week"
          icon={TrendingUp}
          className="lg:col-span-2"
        >
          <div className="space-y-3 py-1">
            {data.topProducts.map((p, i) => {
              const maxRevenue = data.topProducts[0]?.revenue ?? 1;
              const pct = (p.revenue / maxRevenue) * 100;
              return (
                <div key={p.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-md font-mono text-[10px] font-semibold",
                          i === 0
                            ? "bg-aurora text-white"
                            : "bg-white/[0.05] text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="font-medium text-foreground">
                        {p.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatNumber(p.units)} units</span>
                      <span className="font-mono font-medium text-foreground">
                        ₹{p.revenue.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                    <div
                      className="h-full rounded-full bg-aurora transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      </div>

      {/* ===== Activity + System health ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ActivityFeed
          title="Recent Activity"
          activities={activities}
          maxHeight="max-h-[28rem]"
        />
        <SystemHealth
          checks={healthChecks}
          avgResponseMs={data.systemHealth.avgResponseMs}
          className="lg:col-span-2"
        />
      </div>

      {/* ===== Recent tables: orders + leads + calls ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          title="Recent Orders"
          description="Latest 5 orders placed"
          icon={ShoppingCart}
        >
          <div className="space-y-1">
            {data.recentOrders.map((o, i) => (
              <div
                key={o.id}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-white/[0.03]",
                  i !== data.recentOrders.length - 1 &&
                    "border-b border-white/[0.04]",
                )}
              >
                <div>
                  <p className="font-medium text-foreground">{o.customer}</p>
                  <p className="text-xs text-muted-foreground">
                    Order #{o.id} · {formatDateTime(o.placedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {o.status}
                  </Badge>
                  <span className="font-mono font-medium text-foreground">
                    ₹{o.amount.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title="Recent Voice Calls"
          description="Latest 5 inbound / outbound calls"
          icon={PhoneCall}
        >
          <div className="space-y-1">
            {data.recentCalls.map((c, i) => (
              <div
                key={c.id}
                className={cn(
                  "flex items-center justify-between rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-white/[0.03]",
                  i !== data.recentCalls.length - 1 &&
                    "border-b border-white/[0.04]",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-white/[0.04] p-1.5">
                    <PhoneCall className="h-3.5 w-3.5 text-cyan" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{c.customer}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.direction === "INBOUND" ? "Inbound" : "Outbound"} ·{" "}
                      {formatDuration(c.durationSec)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={c.outcome === "TRANSFERRED" ? "warning" : "success"}
                    className="text-[10px]"
                  >
                    {c.outcome}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {relativeTime(c.startedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Data refreshes automatically every 60s · Last updated{" "}
        {new Date().toLocaleTimeString("en-US")}
      </p>
    </div>
  );
}

// Re-export for type-safety in other dashboard pages.
export type { DashboardSummary };
