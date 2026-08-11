"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface AttendanceChartProps {
  data: { name: string; value: number; color: string }[];
  height?: number;
}

/**
 * Monthly attendance donut chart. Each segment is a status
 * (present / late / half-day / leave / absent / weekend).
 */
export function AttendanceChart({ data, height = 240 }: AttendanceChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="hsl(230 18% 9%)"
            strokeWidth={2}
          >
            {data.map((d, i) => (
              <Cell key={`c-${i}`} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "hsl(230 18% 9%)",
              border: "1px solid hsl(230 15% 20%)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(220 25% 95%)" }}
            formatter={(value: number, name: string) => [
              `${value} day${value === 1 ? "" : "s"}`,
              name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-foreground">{total}</span>
        <span className="text-xs text-muted-foreground">tracked days</span>
      </div>
    </div>
  );
}
