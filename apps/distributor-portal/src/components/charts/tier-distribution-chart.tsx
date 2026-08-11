"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PieChart as PieIcon } from "lucide-react";
import { formatPercent } from "@/lib/utils";

interface TierDistributionDatum {
  name: string;
  value: number;
  color: string;
}

interface TierDistributionChartProps {
  data: TierDistributionDatum[];
  title?: string;
  loading?: boolean;
  height?: number;
}

/**
 * Tier distribution — pie/donut chart showing how the team breaks down
 * by tier (Bronze / Silver / Gold / Platinum).
 */
export function TierDistributionChart({
  data,
  title = "Tier Distribution",
  loading,
  height = 280,
}: TierDistributionChartProps) {
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
            title="No team members yet"
            description="Tier breakdown of your downline will appear here."
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
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                stroke="hsl(var(--background))"
                strokeWidth={2}
              >
                {data.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
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
                  `${value} (${formatPercent(total ? value / total : 0)})`,
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
