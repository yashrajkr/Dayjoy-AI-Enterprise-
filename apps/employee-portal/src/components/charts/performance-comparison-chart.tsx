"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PerformanceComparisonChartProps {
  data: { metric: string; mine: number; teamAvg: number; top?: number }[];
  height?: number;
}

/**
 * Performance comparison chart — your metric vs. team average vs. top
 * performer, as grouped bars. Used on the Analytics page (manager
 * comparison) and the Performance report.
 */
export function PerformanceComparisonChart({ data, height = 320 }: PerformanceComparisonChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 24, bottom: 0 }}
        barGap={2}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 20%)" horizontal={false} />
        <XAxis
          type="number"
          stroke="hsl(222 12% 62%)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="metric"
          stroke="hsl(222 12% 62%)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={140}
        />
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
        <Legend
          wrapperStyle={{ fontSize: 12, color: "hsl(222 12% 62%)" }}
          iconType="circle"
        />
        <Bar dataKey="mine" name="Me" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={`m-${i}`} fill="hsl(219 100% 65%)" />
          ))}
        </Bar>
        <Bar dataKey="teamAvg" name="Team Avg" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={`t-${i}`} fill="hsl(249 70% 66%)" />
          ))}
        </Bar>
        {data.some((d) => d.top != null) && (
          <Bar dataKey="top" name="Top Performer" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={`p-${i}`} fill="hsl(187 74% 55%)" />
            ))}
          </Bar>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
