"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CheckCircle2,
  Ticket as TicketIcon,
  Target,
  Smile,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ProductivityChart,
  TicketResolutionChart,
  ConversionChart,
  PerformanceComparisonChart,
} from "@/components/charts";
import { QUERY_KEYS } from "@/lib/constants";
import {
  getAnalyticsKPIs,
  getConversionTrend,
  getInteractionTrend,
  getProductivityTrend,
  getResolutionTimeTrend,
  getTeamComparison,
} from "@/lib/mock-data";
import { cn, formatNumber } from "@/lib/utils";

const RANGES = [
  { label: "Last 7 days", value: "7", days: 7 },
  { label: "Last 14 days", value: "14", days: 14 },
  { label: "Last 30 days", value: "30", days: 30 },
];

export default function AnalyticsPage() {
  const [range, setRange] = useState("14");
  const rangeDays = Number(range);

  const kpisQuery = useQuery({
    queryKey: QUERY_KEYS.analyticsDashboard,
    queryFn: () => getAnalyticsKPIs(),
  });
  const productivityQuery = useQuery({
    queryKey: ["analytics", "productivity", range],
    queryFn: () => getProductivityTrend(rangeDays),
  });
  const resolutionQuery = useQuery({
    queryKey: ["analytics", "resolution", range],
    queryFn: () => getResolutionTimeTrend(rangeDays),
  });
  const conversionQuery = useQuery({
    queryKey: ["analytics", "conversion", range],
    queryFn: () => getConversionTrend(rangeDays),
  });
  const interactionQuery = useQuery({
    queryKey: ["analytics", "interactions", range],
    queryFn: () => getInteractionTrend(rangeDays),
  });
  const comparisonQuery = useQuery({
    queryKey: ["analytics", "comparison"],
    queryFn: () => getTeamComparison(),
  });

  const kpis = kpisQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Your productivity, ticket handling, conversion, and CSAT — at a glance."
        icon={BarChart3}
        actions={
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[160px]" aria-label="Date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpisQuery.isLoading || !kpis ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
        ) : (
          <>
            <KpiCard
              label="Tasks Completed"
              value={formatNumber(kpis.tasksCompleted)}
              delta={kpis.tasksCompletedDelta}
              icon={<CheckCircle2 className="h-4 w-4" />}
              accent="text-emerald-500"
            />
            <KpiCard
              label="Tickets Resolved"
              value={formatNumber(kpis.ticketsResolved)}
              delta={kpis.ticketsResolvedDelta}
              icon={<TicketIcon className="h-4 w-4" />}
              accent="text-cyan"
            />
            <KpiCard
              label="Leads Converted"
              value={formatNumber(kpis.leadsConverted)}
              delta={kpis.leadsConvertedDelta}
              icon={<Target className="h-4 w-4" />}
              accent="text-indigo"
            />
            <KpiCard
              label="CSAT Score"
              value={`${kpis.csatScore.toFixed(1)} / 5`}
              delta={kpis.csatDelta}
              icon={<Smile className="h-4 w-4" />}
              accent="text-amber-500"
            />
          </>
        )}
      </div>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My analytics</TabsTrigger>
          <TabsTrigger value="team">Team comparison</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="space-y-6">
          {/* Productivity */}
          <Card>
            <CardHeader>
              <CardTitle>My productivity</CardTitle>
              <CardDescription>Tasks completed + tickets resolved per day.</CardDescription>
            </CardHeader>
            <CardContent>
              {productivityQuery.isLoading ? (
                <Skeleton className="h-72 w-full rounded-xl" />
              ) : (
                <ProductivityChart data={productivityQuery.data ?? []} />
              )}
            </CardContent>
          </Card>

          {/* Resolution + Conversion */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Ticket resolution time</CardTitle>
                <CardDescription>Avg resolution (h) per day vs. SLA.</CardDescription>
              </CardHeader>
              <CardContent>
                {resolutionQuery.isLoading ? (
                  <Skeleton className="h-64 w-full rounded-xl" />
                ) : (
                  <TicketResolutionChart data={resolutionQuery.data ?? []} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lead conversion</CardTitle>
                <CardDescription>Leads vs. converted per day.</CardDescription>
              </CardHeader>
              <CardContent>
                {conversionQuery.isLoading ? (
                  <Skeleton className="h-64 w-full rounded-xl" />
                ) : (
                  <ConversionChart data={conversionQuery.data ?? []} />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Customer interactions */}
          <Card>
            <CardHeader>
              <CardTitle>Customer interactions</CardTitle>
              <CardDescription>Channels used per day.</CardDescription>
            </CardHeader>
            <CardContent>
              {interactionQuery.isLoading ? (
                <Skeleton className="h-72 w-full rounded-xl" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={interactionQuery.data ?? []} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 20%)" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(222 12% 62%)" fontSize={11} tickLine={false} axisLine={false} />
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
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                    <Bar dataKey="calls" name="Calls" stackId="a" fill="hsl(219 100% 65%)" />
                    <Bar dataKey="emails" name="Emails" stackId="a" fill="hsl(249 70% 66%)" />
                    <Bar dataKey="chats" name="Chats" stackId="a" fill="hsl(187 74% 55%)" />
                    <Bar dataKey="meetings" name="Meetings" stackId="a" fill="hsl(156 64% 48%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4" /> My stats vs. team
              </CardTitle>
              <CardDescription>
                Side-by-side comparison across productivity, quality, and volume metrics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {comparisonQuery.isLoading ? (
                <Skeleton className="h-80 w-full rounded-xl" />
              ) : (
                <PerformanceComparisonChart data={comparisonQuery.data ?? []} height={340} />
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(comparisonQuery.data ?? []).slice(0, 6).map((row) => {
              const isLowerBetter = row.metric.includes("Resolution");
              const mineBetter = isLowerBetter ? row.mine <= row.teamAvg : row.mine >= row.teamAvg;
              const deltaPct = isLowerBetter
                ? ((row.teamAvg - row.mine) / Math.max(row.teamAvg, 1)) * 100
                : ((row.mine - row.teamAvg) / Math.max(row.teamAvg, 1)) * 100;
              return (
                <Card key={row.metric}>
                  <CardContent className="p-5">
                    <div className="text-xs text-muted-foreground">{row.metric}</div>
                    <div className="mt-1 text-2xl font-semibold text-foreground">
                      {formatNumber(row.mine)}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <Badge variant={mineBetter ? "success" : "warning"} className="text-[10px]">
                        {deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(0)}%
                      </Badge>
                      <span className="text-muted-foreground">vs. team avg ({row.teamAvg})</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  icon,
  accent,
}: {
  label: string;
  value: string;
  delta: number;
  icon: React.ReactNode;
  accent: string;
}) {
  const isPositive = delta >= 0;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.04]", accent)}>
            {icon}
          </span>
        </div>
        <div className="mt-2 text-3xl font-semibold text-foreground">{value}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs">
          {isPositive ? (
            <TrendingUp className="h-3 w-3 text-success" />
          ) : (
            <TrendingDown className="h-3 w-3 text-destructive" />
          )}
          <span className={isPositive ? "text-success" : "text-destructive"}>
            {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(0)}%
          </span>
          <span className="text-muted-foreground">vs. previous period</span>
        </div>
      </CardContent>
    </Card>
  );
}
