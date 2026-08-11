"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PieChart as PieIcon } from "lucide-react";
import { formatCurrencyCompact, formatPercent } from "@/lib/utils";

interface CategoryPieDatum {
  name: string;
  value: number;
}

interface CategoryPieChartProps {
  data: CategoryPieDatum[];
  title?: string;
  loading?: boolean;
  height?: number;
  colors?: string[];
}

const DEFAULT_COLORS = [
  "hsl(24.6 95% 53.1%)",
  "hsl(173 58% 39%)",
  "hsl(197 37% 50%)",
  "hsl(43 74% 66%)",
  "hsl(27 87% 67%)",
  "hsl(280 65% 60%)",
  "hsl(340 75% 55%)",
];

/**
 * Category pie — used for Sales-by-Category, Sales-by-Channel,
 * Earnings-by-Type breakdowns. Generic pie/donut with auto colors.
 */
export function CategoryPieChart({
  data,
  title = "Breakdown",
  loading,
  height = 280,
  colors = DEFAULT_COLORS,
}: CategoryPieChartProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PieIcon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : data.length === 0 || total === 0 ? (
          <EmptyState
            icon={PieIcon}
            title="No data to display"
            description="Breakdown will appear here once you have data."
            className="border-0"
          />
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
                stroke="hsl(var(--background))"
                strokeWidth={2}
              >
                {data.map((_, idx) => (
                  <Cell key={idx} fill={colors[idx % colors.length]!} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number, name: string) => [
                  `${formatCurrencyCompact(Number(value))} (${formatPercent(total ? Number(value) / total : 0)})`,
                  name,
                ]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

interface DayOfWeekBarProps {
  data: Array<{ day: string; total: number }>;
  title?: string;
  loading?: boolean;
  height?: number;
}

/** Sales by day of week — bar chart. */
export function DayOfWeekBarChart({
  data,
  title = "Sales by Day of Week",
  loading,
  height = 240,
}: DayOfWeekBarProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={PieIcon}
            title="No data yet"
            description="Daily breakdown will appear here."
            className="border-0"
          />
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatCurrencyCompact(Number(v))}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [formatCurrencyCompact(Number(value)), "Sales"]}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="hsl(24.6 95% 53.1%)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
