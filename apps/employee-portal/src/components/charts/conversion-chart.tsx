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

interface ConversionChartProps {
  data: { date: string; leads: number; converted: number; rate: number }[];
  height?: number;
}

/**
 * Lead conversion chart — leads vs. converted as grouped bars, with the
 * conversion rate expressed as a tooltip. Used on the Analytics page
 * and the Performance report.
 */
export function ConversionChart({ data, height = 280 }: ConversionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }} barGap={2}>
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
          formatter={(value: number, name: string) => {
            if (name === "rate") return [`${(value * 100).toFixed(0)}%`, "Conversion rate"];
            return [value, name === "leads" ? "Leads" : "Converted"];
          }}
        />
        <Bar dataKey="leads" name="leads" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={`l-${i}`} fill="hsl(230 15% 28%)" />
          ))}
        </Bar>
        <Bar dataKey="converted" name="converted" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={`c-${i}`} fill="hsl(156 64% 48%)" />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
