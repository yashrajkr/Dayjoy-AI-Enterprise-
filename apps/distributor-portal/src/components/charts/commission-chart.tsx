"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Receipt } from "lucide-react";
import { formatCurrencyCompact, formatCurrency } from "@/lib/utils";

interface CommissionChartDatum {
  label: string;
  total: number;
  pending?: number;
  paid?: number;
}

interface CommissionChartProps {
  data: CommissionChartDatum[];
  title?: string;
  loading?: boolean;
  height?: number;
}

const COLORS = ["hsl(24.6 95% 53.1%)", "hsl(173 58% 39%)", "hsl(197 37% 50%)"];

/**
 * Commission chart — bar chart for commissions per month.
 *
 * Each bar shows the total commission for a month, segmented by
 * `pending` vs `paid` when those sub-fields are present.
 */
export function CommissionChart({
  data,
  title = "Commission History",
  loading,
  height = 280,
}: CommissionChartProps) {
  const hasSegments = data.some((d) => d.pending != null || d.paid != null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : data.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No commissions yet"
            description="Your monthly commission earnings will appear here."
            className="border-0"
          />
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
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
                formatter={(value: number) => [
                  formatCurrency(value),
                  "Commission",
                ]}
              />
              {hasSegments ? (
                <>
                  <Bar
                    dataKey="paid"
                    stackId="a"
                    fill={COLORS[0]!}
                    radius={[0, 0, 0, 0]}
                    name="Paid"
                  />
                  <Bar
                    dataKey="pending"
                    stackId="a"
                    fill={COLORS[1]!}
                    radius={[4, 4, 0, 0]}
                    name="Pending"
                  />
                </>
              ) : (
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {data.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]!} />
                  ))}
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
