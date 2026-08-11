"use client";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Users } from "lucide-react";
import { formatNumber } from "@/lib/utils";

interface TeamGrowthDatum {
  label: string;
  added: number;
  total: number;
  active?: number;
}

interface TeamGrowthChartProps {
  data: TeamGrowthDatum[];
  title?: string;
  loading?: boolean;
  height?: number;
}

/**
 * Team growth — stacked area chart showing new recruits per month and
 * the cumulative team size.
 */
export function TeamGrowthChart({
  data,
  title = "Team Growth",
  loading,
  height = 280,
}: TeamGrowthChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No team growth yet"
            description="New recruit additions over time will appear here."
            className="border-0"
          />
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(24.6 95% 53.1%)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(24.6 95% 53.1%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="addedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(173 58% 39%)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(173 58% 39%)" stopOpacity={0} />
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
                tickFormatter={(v) => formatNumber(Number(v))}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
                iconSize={8}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="hsl(24.6 95% 53.1%)"
                strokeWidth={2.5}
                fill="url(#totalGradient)"
                name="Total Team"
              />
              <Area
                type="monotone"
                dataKey="added"
                stroke="hsl(173 58% 39%)"
                strokeWidth={2.5}
                fill="url(#addedGradient)"
                name="New Recruits"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
