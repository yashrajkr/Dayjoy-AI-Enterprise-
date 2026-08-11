'use client'

import { useState } from "react";
import { CardHead, GlassCard } from "@/components/kit/glass-card";
import { Meter, PageHeader, Pill } from "@/components/kit/page-header";
import { KpiCard } from "@/components/kit/kpi-card";
import { GroupedChannelChart, RevenueAreaChart, ToolTrendChart } from "@/components/kit/charts";
import { aiPerformanceMetrics, channelVolume, monthlyRevenue, toolTrends, type Kpi } from "@/data/mock";
import { cn } from "@/lib/utils";


const kpis: Kpi[] = [
  { label: "Total Revenue", value: 1980000, prefix: "₹", trend: "up", change: "+18%", icon: "revenue", tone: "brand", spark: [240, 285, 262, 331, 358, 374, 392] },
  { label: "Total Orders", value: 1420, trend: "up", change: "+12%", icon: "users", tone: "info", spark: [980, 1050, 1120, 1240, 1320, 1380, 1420] },
  { label: "Total Calls", value: 2390, trend: "up", change: "+8%", icon: "phone", tone: "success", spark: [1720, 1880, 1960, 2100, 2210, 2310, 2390] },
  { label: "AI Accuracy", value: 92, suffix: "%", trend: "up", change: "+3%", icon: "bot", tone: "violet", spark: [84, 85, 87, 88, 90, 91, 92] },
];

const tabs = ["Revenue", "Channels", "AI Performance", "Tools"] as const;

export function AnalyticsView() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Revenue");

  return (
    <>
      <PageHeader title="Analytics" subtitle="Six-month performance across revenue, channels and AI quality." />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} kpi={k} delay={i * 0.05} />
        ))}
      </section>

      <div className="glass inline-flex flex-wrap gap-1 rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              tab === t ? "bg-brand/15 text-brand" : "text-subtle hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Revenue" ? (
        <GlassCard delay={0.1} tilt={false} className="p-5">
          <CardHead title="Revenue Trend" subtitle="Last 6 months" action={<Pill tone="success">+18%</Pill>} />
          <div className="mt-4">
            <RevenueAreaChart data={monthlyRevenue} withTarget={false} height={320} />
          </div>
        </GlassCard>
      ) : null}

      {tab === "Channels" ? (
        <GlassCard delay={0.1} tilt={false} className="p-5">
          <CardHead
            title="Calls vs Messages"
            subtitle="Monthly channel volume"
            action={
              <div className="flex items-center gap-3 text-[11px] text-subtle">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-info" /> Calls
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-success" /> Messages
                </span>
              </div>
            }
          />
          <div className="mt-4">
            <GroupedChannelChart data={channelVolume} />
          </div>
        </GlassCard>
      ) : null}

      {tab === "AI Performance" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {aiPerformanceMetrics.map((m, i) => (
            <GlassCard key={m.label} delay={i * 0.05} className="p-5">
              <p className="text-[13px] text-subtle">{m.label}</p>
              <p className="num mt-2 text-2xl font-bold">
                {m.value}
                {m.suffix}
              </p>
              <Meter value={m.suffix === "/5" ? (m.value / 5) * 100 : m.value} tone={m.tone} className="mt-3" />
              <p className="num mt-2 text-[11px] text-muted-foreground">
                Target {m.target}
                {m.suffix}
              </p>
            </GlassCard>
          ))}
        </div>
      ) : null}

      {tab === "Tools" ? (
        <GlassCard delay={0.1} tilt={false} className="p-5">
          <CardHead
            title="Tool Usage Trends"
            subtitle="Monthly executions by tool family"
            action={
              <div className="flex items-center gap-3 text-[11px] text-subtle">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-brand" /> Knowledge
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-info" /> Products
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-violet" /> CRM
                </span>
              </div>
            }
          />
          <div className="mt-4">
            <ToolTrendChart data={toolTrends} />
          </div>
        </GlassCard>
      ) : null}
    </>
  );
}
