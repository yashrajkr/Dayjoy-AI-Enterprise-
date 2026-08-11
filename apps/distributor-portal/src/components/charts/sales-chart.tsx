"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { TrendingUp } from "lucide-react";
import { formatCurrencyCompact, formatCurrency } from "@/lib/utils";

interface SalesChartDatum {
  label: string;
  total: number;
  count?: number;
}

interface SalesChartProps {
  data: SalesChartDatum[];
  title?: string;
  loading?: boolean;
  /** Show a comparison line/area for the previous period. */
  previousData?: SalesChartDatum[];
  height?: number;
}

/**
 * Sales trend — area chart with a soft gradient fill.
 *
 * Used on the Dashboard and the Sales Dashboard. Falls back to a
 * skeleton while loading and an `EmptyState` when there's no data.
 */
export function SalesChart({
  data,
  title = "Sales Trend",
  loading,
  previousData,
  height = 280,
}: SalesChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No sales data yet"
            description="Sales over the selected period will appear here."
            className="border-0"
          />
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(24.6 95% 53.1%)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(24.6 95% 53.1%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient
                  id="salesGradientPrev"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="hsl(220 10% 50%)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(220 10% 50%)" stopOpacity={0} />
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
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [formatCurrency(value), "Sales"]}
              />
              {previousData && (
                <Area
                  type="monotone"
                  data={previousData}
                  dataKey="total"
                  stroke="hsl(220 10% 60%)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="url(#salesGradientPrev)"
                  name="Previous"
                />
              )}
              <Area
                type="monotone"
                dataKey="total"
                stroke="hsl(24.6 95% 53.1%)"
                strokeWidth={2.5}
                fill="url(#salesGradient)"
                name="Sales"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
