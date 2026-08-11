'use client'

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Clock,
  DollarSign,
  FileText,
  Layers,
  MessageSquare,
  Phone,
  Search,
  Users,
} from "lucide-react";
import type { Kpi } from "@/data/mock";
import { GlassCard } from "./glass-card";
import { CountUp } from "./count-up";
import { toneGradient, toneVar } from "@/lib/tone";
import { cn } from "@/lib/utils";

const icons = {
  revenue: DollarSign,
  users: Users,
  phone: Phone,
  chat: MessageSquare,
  docs: FileText,
  chunks: Layers,
  query: Search,
  latency: Clock,
  bot: Bot,
} as const;

export function KpiCard({ kpi, delay = 0 }: { kpi: Kpi; delay?: number }) {
  const Icon = icons[kpi.icon];
  const up = kpi.trend === "up";
  const color = toneVar[kpi.tone];
  const gradientId = `spark-${kpi.label.replace(/\s+/g, "-")}`;

  return (
    <GlassCard delay={delay} className="overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl text-primary-foreground shadow-lg",
            toneGradient[kpi.tone],
          )}
        >
          <Icon className="size-5" />
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium num",
            up ? "border-success/25 bg-success/12 text-success" : "border-danger/25 bg-danger/12 text-danger",
          )}
        >
          {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          {kpi.change}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <p className="text-3xl font-bold tracking-tight num">
          <CountUp
            value={kpi.value}
            prefix={kpi.prefix ?? ""}
            suffix={kpi.suffix ?? ""}
            decimals={kpi.decimals ?? 0}
          />
        </p>
        {kpi.live ? <span className="live-dot size-2 rounded-full bg-success text-success/40" /> : null}
      </div>
      <p className="mt-1 text-[13px] leading-tight text-subtle">{kpi.label}</p>

      <div className="-mx-5 -mb-5 mt-4 h-8 overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={kpi.spark.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
