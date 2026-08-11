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

interface ProductivityChartProps {
  data: { date: string; tasks: number; tickets: number }[];
  height?: number;
}

/**
 * Productivity chart — tasks completed + tickets resolved per day, as a
 * stacked area chart. Used on the Analytics page.
 */
export function ProductivityChart({ data, height = 280 }: ProductivityChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-tasks" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(219 100% 65%)" stopOpacity={0.7} />
            <stop offset="95%" stopColor="hsl(219 100% 65%)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="grad-tickets" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(187 74% 55%)" stopOpacity={0.7} />
            <stop offset="95%" stopColor="hsl(187 74% 55%)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 20%)" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="hsl(222 12% 62%)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(222 12% 62%)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(230 18% 9%)",
            border: "1px solid hsl(230 15% 20%)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "hsl(220 25% 95%)" }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: "hsl(222 12% 62%)" }}
          iconType="circle"
        />
        <Area
          type="monotone"
          dataKey="tasks"
          name="Tasks"
          stroke="hsl(219 100% 65%)"
          strokeWidth={2}
          fill="url(#grad-tasks)"
        />
        <Area
          type="monotone"
          dataKey="tickets"
          name="Tickets"
          stroke="hsl(187 74% 55%)"
          strokeWidth={2}
          fill="url(#grad-tickets)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
