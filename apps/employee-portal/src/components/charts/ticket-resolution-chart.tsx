"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TicketResolutionChartProps {
  data: { date: string; hours: number; sla: number }[];
  height?: number;
}

/**
 * Ticket resolution time trend — line chart with an SLA reference
 * line so it's visually obvious when SLA is breached. Used on the
 * Analytics page and the Tickets report.
 */
export function TicketResolutionChart({ data, height = 280 }: TicketResolutionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
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
          unit="h"
        />
        <Tooltip
          contentStyle={{
            background: "hsl(230 18% 9%)",
            border: "1px solid hsl(230 15% 20%)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "hsl(220 25% 95%)" }}
          formatter={(value: number, name: string) => [
            name === "hours" ? `${value}h` : `${value}h (SLA)`,
            name === "hours" ? "Avg resolution" : "SLA target",
          ]}
        />
        <ReferenceLine
          y={data[0]?.sla ?? 8}
          stroke="hsl(351 83% 64%)"
          strokeDasharray="4 4"
          label={{ value: "SLA", fill: "hsl(351 83% 64%)", fontSize: 10, position: "right" }}
        />
        <Line
          type="monotone"
          dataKey="hours"
          stroke="hsl(249 70% 66%)"
          strokeWidth={2}
          dot={{ r: 3, fill: "hsl(249 70% 66%)", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
