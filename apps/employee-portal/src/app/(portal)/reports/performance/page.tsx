"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, TrendingUp, Target, Award } from "lucide-react";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  Bar,
  BarChart,
} from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PerformanceComparisonChart } from "@/components/charts/performance-comparison-chart";
import { QUERY_KEYS } from "@/lib/constants";
import { getPerformanceReport, type PerformanceRow } from "@/lib/mock-data";
import { cn, downloadCSV, formatNumber } from "@/lib/utils";

export default function PerformanceReportPage() {
  const [scope, setScope] = useState<"self" | "team">("self");

  const reportQuery = useQuery({
    queryKey: QUERY_KEYS.reportPerformance,
    queryFn: () => getPerformanceReport(),
  });

  const data = reportQuery.data;
  const isManagerView = scope === "team";

  // For the team view, scale "mine" up to "team avg" so the chart still
  // tells a useful story (real backend will return team aggregates).
  const comparisonData = useMemo(() => {
    if (!data) return [];
    if (!isManagerView) {
      return data.metrics.map((m) => ({
        metric: m.metric,
        mine: m.mine,
        teamAvg: m.teamAvg,
        top: m.goal,
      }));
    }
    return data.metrics.map((m) => ({
      metric: m.metric,
      mine: m.teamAvg,
      teamAvg: m.mine,
      top: m.goal,
    }));
  }, [data, isManagerView]);

  function handleExportCSV() {
    if (!data) return;
    const rows = data.metrics.map((m: PerformanceRow) => ({
      Metric: m.metric,
      "My Value": m.mine,
      "Team Avg": m.teamAvg,
      Goal: m.goal,
    }));
    downloadCSV(`performance-report-${scope}.csv`, rows);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Report"
        description="Your productivity, ticket handling, and goal achievement vs. team averages."
        icon={TrendingUp}
        actions={
          <Button variant="outline" onClick={handleExportCSV} disabled={!data}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {/* Scope toggle (managers) */}
      <Tabs value={scope} onValueChange={(v) => setScope(v as "self" | "team")}>
        <TabsList>
          <TabsTrigger value="self">My performance</TabsTrigger>
          <TabsTrigger value="team">Team view (manager)</TabsTrigger>
        </TabsList>

        <TabsContent value="self">
          <p className="text-sm text-muted-foreground">
            Your individual performance for the current period, compared to your team's average.
          </p>
        </TabsContent>
        <TabsContent value="team">
          <p className="text-sm text-muted-foreground">
            Aggregated team performance, with your stats shown as the team average benchmark.
          </p>
        </TabsContent>
      </Tabs>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data ? (
          data.metrics.slice(0, 4).map((m) => {
            const aboveTeam = m.mine >= m.teamAvg;
            return (
              <Card key={m.metric}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{m.metric}</span>
                    <Award className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">
                    {formatNumber(m.mine)}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className={aboveTeam ? "text-success" : "text-destructive"}>
                      {aboveTeam ? "▲" : "▼"} {Math.abs(((m.mine - m.teamAvg) / Math.max(m.teamAvg, 1)) * 100).toFixed(0)}%
                    </span>
                    <span className="text-muted-foreground">vs. team avg ({m.teamAvg})</span>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
        )}
      </div>

      {/* Comparison chart */}
      <Card>
        <CardHeader>
          <CardTitle>Performance comparison</CardTitle>
          <CardDescription>
            {isManagerView
              ? "Team aggregate vs. your individual contribution."
              : "Your metrics vs. team average vs. your goal."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : (
            <PerformanceComparisonChart data={comparisonData} height={320} />
          )}
        </CardContent>
      </Card>

      {/* Trend + goals */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance trend</CardTitle>
            <CardDescription>Daily combined tasks + tickets output.</CardDescription>
          </CardHeader>
          <CardContent>
            {!data ? (
              <Skeleton className="h-64 w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.trend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
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
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  <Line
                    type="monotone"
                    dataKey="mine"
                    name={isManagerView ? "Team" : "Me"}
                    stroke="hsl(219 100% 65%)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "hsl(219 100% 65%)", strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="teamAvg"
                    name="Team avg"
                    stroke="hsl(187 74% 55%)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4" /> Goal progress
            </CardTitle>
            <CardDescription>Progress towards your quarterly goals.</CardDescription>
          </CardHeader>
          <CardContent>
            {!data ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {data.goalProgress.map((g) => {
                  const pct = Math.min(100, g.progress * 100);
                  const achieved = g.progress >= 1;
                  return (
                    <div key={g.goal}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{g.goal}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {g.current} / {g.target}
                          </span>
                          {achieved && (
                            <Badge variant="success" className="text-[10px]">
                              ✓ Achieved
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Progress
                        value={pct}
                        indicatorClassName={achieved ? "bg-success" : pct > 75 ? "bg-aurora" : "bg-warning"}
                      />
                      <div className="mt-1 text-right text-xs text-muted-foreground">
                        {pct.toFixed(0)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed metrics table */}
      <Card>
        <CardHeader>
          <CardTitle>All metrics</CardTitle>
          <CardDescription>Side-by-side comparison across all tracked metrics.</CardDescription>
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">{isManagerView ? "Team" : "Me"}</TableHead>
                  <TableHead className="text-right">Team avg</TableHead>
                  <TableHead className="text-right">Goal</TableHead>
                  <TableHead className="text-right">vs. team</TableHead>
                  <TableHead className="text-right">vs. goal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.metrics.map((m) => {
                  const teamDelta = ((m.mine - m.teamAvg) / Math.max(m.teamAvg, 1)) * 100;
                  const goalDelta = ((m.mine - m.goal) / Math.max(m.goal, 1)) * 100;
                  return (
                    <TableRow key={m.metric}>
                      <TableCell className="font-medium">{m.metric}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.mine}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{m.teamAvg}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{m.goal}</TableCell>
                      <TableCell className={cn("text-right tabular-nums text-xs", teamDelta >= 0 ? "text-success" : "text-destructive")}>
                        {teamDelta >= 0 ? "+" : ""}{teamDelta.toFixed(0)}%
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums text-xs", goalDelta >= 0 ? "text-success" : "text-destructive")}>
                        {goalDelta >= 0 ? "+" : ""}{goalDelta.toFixed(0)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
