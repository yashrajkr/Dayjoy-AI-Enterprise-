'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { toneVar, type Tone } from "@/lib/tone";

const axis = {
  stroke: "var(--subtle)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({ formatter }: { formatter?: (v: number) => string }) {
  return (
    <Tooltip
      cursor={{ stroke: "var(--border)" }}
      contentStyle={{
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        fontSize: 12,
        color: "var(--foreground)",
        boxShadow: "var(--shadow-glass)",
      }}
      formatter={(value) => (formatter ? formatter(Number(value)) : value) as ReactNode}
    />
  );
}

export function RevenueAreaChart({
  data,
  withTarget = true,
  height = 280,
}: {
  data: { day?: string; month?: string; revenue: number; target?: number }[];
  withTarget?: boolean;
  height?: number;
}) {
  const key = data[0] && "day" in data[0] ? "day" : "month";
  return (
    <div style={{ height }} className="overflow-hidden rounded-lg">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey={key} {...axis} tickMargin={8} />
          <YAxis {...axis} width={52} tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`} />
          <ChartTooltip formatter={(v) => `₹${v.toLocaleString("en-IN")}`} />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--brand)"
            strokeWidth={2.5}
            fill="url(#revFill)"
            animationDuration={1000}
          />
          {withTarget ? (
            <Line
              type="monotone"
              dataKey="target"
              stroke="var(--subtle)"
              strokeDasharray="5 5"
              strokeWidth={1.5}
              dot={false}
              animationDuration={1000}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OutcomesDonut({
  data,
  total,
}: {
  data: { name: string; value: number; tone: Tone }[];
  total: number;
}) {
  return (
    <div className="relative h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius="66%"
            outerRadius="94%"
            paddingAngle={3}
            stroke="transparent"
            animationDuration={1100}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={toneVar[d.tone]} />
            ))}
          </Pie>
          <ChartTooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="num text-2xl font-bold">{total}</p>
          <p className="text-[11px] text-subtle">Total Calls</p>
        </div>
      </div>
    </div>
  );
}

export function ChannelUsageBars({ data }: { data: { channel: string; value: number; tone: Tone }[] }) {
  return (
    <div className="h-[200px] overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="channel" width={72} {...axis} />
          <ChartTooltip />
          <Bar dataKey="value" radius={[6, 6, 6, 6]} barSize={18} animationDuration={1000}>
            {data.map((d) => (
              <Cell key={d.channel} fill={toneVar[d.tone]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupedChannelChart({ data }: { data: { month: string; calls: number; messages: number }[] }) {
  return (
    <div className="h-[300px] overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
          <XAxis dataKey="month" {...axis} tickMargin={8} />
          <YAxis {...axis} width={36} />
          <ChartTooltip />
          <Bar dataKey="calls" fill="var(--info)" radius={[6, 6, 0, 0]} barSize={16} animationDuration={900} />
          <Bar dataKey="messages" fill="var(--success)" radius={[6, 6, 0, 0]} barSize={16} animationDuration={900} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ToolTrendChart({
  data,
}: {
  data: { month: string; knowledge: number; products: number; crm: number }[];
}) {
  return (
    <div className="h-[300px] overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
          <XAxis dataKey="month" {...axis} tickMargin={8} />
          <YAxis {...axis} width={36} />
          <ChartTooltip />
          <Line type="monotone" dataKey="knowledge" stroke="var(--brand)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--brand)" }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="products" stroke="var(--info)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--info)" }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="crm" stroke="var(--violet)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--violet)" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
