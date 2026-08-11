"use client";

import { useState } from "react";
import { Database, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { CardHead, GlassCard } from "@/components/kit/glass-card";
import { Meter, PageHeader, Pill } from "@/components/kit/page-header";
import { securityToggles, services, systemResources } from "@/data/mock";
import { cn } from "@/lib/utils";


export function SystemView() {
  const [toggles, setToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(securityToggles.map((t) => [t, true])),
  );

  const flip = (key: string) => {
    setToggles((p) => {
      const next = { ...p, [key]: !p[key] };
      if (next[key]) toast.success(`Enabled: ${key}`, { description: "Control is now active." });
      else toast.warning(`Disabled: ${key}`, { description: "Control is now inactive." });
      return next;
    });
  };

  return (
    <>
      <PageHeader title="System Config" subtitle="Infrastructure health and platform hardening." />

      <section className="grid gap-4 lg:grid-cols-2">
        <GlassCard delay={0.05} className="p-5">
          <CardHead
            title="Service Health"
            subtitle="Live checks every 30s"
            action={
              <Pill tone="success" dot pulse>
                Operational
              </Pill>
            }
          />
          <ul className="mt-4 divide-y divide-border">
            {services.map((s) => (
              <li key={s.name} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span
                  className={cn("size-2 shrink-0 rounded-full", s.status === "healthy" ? "bg-success" : "bg-warning")}
                />
                <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                <span className="num w-16 text-right text-xs text-subtle">{s.latency}</span>
                <span className="num w-16 text-right text-xs text-muted-foreground">{s.uptime}</span>
                <Pill tone={s.status === "healthy" ? "success" : "warning"}>
                  {s.status === "healthy" ? "Healthy" : "Degraded"}
                </Pill>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard delay={0.1} className="p-5">
          <CardHead title="System Resources" subtitle="Cluster averages" />
          <div className="mt-5 space-y-4">
            {systemResources.map((r) => (
              <div key={r.label}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-subtle">{r.label}</span>
                  <span className="num font-semibold">{r.value}%</span>
                </div>
                <Meter value={r.value} tone={r.tone} className="mt-2" />
              </div>
            ))}
          </div>
        </GlassCard>
      </section>

      <GlassCard delay={0.15} className="p-5">
        <CardHead title="Security Configuration" subtitle="All controls enabled" icon={<ShieldCheck className="size-4" />} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {securityToggles.map((t) => {
            const on = toggles[t] ?? true;
            return (
              <button
                key={t}
                onClick={() => flip(t)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-glass px-3 py-2.5 text-[13px] transition-colors hover:border-brand/30"
              >
                <span className="min-w-0 truncate font-medium">{t}</span>
                <span
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                    on ? "bg-gradient-success" : "bg-muted-foreground/30",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-4 rounded-full bg-background transition-all",
                      on ? "right-0.5" : "left-0.5",
                    )}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </GlassCard>

      <section className="grid gap-4 lg:grid-cols-3">
        <button
          onClick={() => toast.info("API Keys", { description: "5 configured · 1 expired — rotating soon." })}
          className="text-left"
        >
          <GlassCard delay={0.2} className="p-5 transition-transform hover:scale-[1.02]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand/12 text-brand">
                <KeyRound className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">API Keys</p>
                <p className="truncate text-xs text-subtle">5 configured · 1 expired</p>
              </div>
            </div>
          </GlassCard>
        </button>
        <button
          onClick={() => toast.success("Backup status", { description: "Last backup 2h ago · Next in 22h." })}
          className="text-left"
        >
          <GlassCard delay={0.25} className="p-5 transition-transform hover:scale-[1.02]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-info/12 text-info">
                <Database className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">Database Backup</p>
                <p className="truncate text-xs text-subtle">Last: 2 hours ago</p>
              </div>
            </div>
          </GlassCard>
        </button>
        <button
          onClick={() => toast.success("Security scan", { description: "Passed · 0 issues · Next scan in 24h." })}
          className="text-left"
        >
          <GlassCard delay={0.3} className="p-5 transition-transform hover:scale-[1.02]">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-success/12 text-success">
                <ShieldCheck className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">Security Scan</p>
                <p className="truncate text-xs text-subtle">Passed · 0 issues</p>
              </div>
            </div>
          </GlassCard>
        </button>
      </section>
    </>
  );
}
