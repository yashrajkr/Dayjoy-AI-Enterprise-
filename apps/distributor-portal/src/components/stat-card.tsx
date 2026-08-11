"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatPercent } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  /** Percentage change vs previous period — positive = up, negative = down. */
  change?: number;
  /** When `change` is provided, force the "good" direction (e.g. lower churn is good). */
  invertChangeColor?: boolean;
  accent?: "primary" | "emerald" | "amber" | "blue" | "purple" | "rose";
  loading?: boolean;
  className?: string;
}

const ACCENT_BG: Record<NonNullable<StatCardProps["accent"]>, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

/**
 * KPI / stat card — used on the dashboard, sales page, earnings page.
 * Renders a large numeric value with an icon, optional description,
 * and a directional change indicator.
 */
export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  change,
  invertChangeColor,
  accent = "primary",
  loading,
  className,
}: StatCardProps) {
  const positive = (change ?? 0) >= 0;
  const isGood = invertChangeColor ? !positive : positive;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
            {loading ? (
              <div className="h-7 w-24 animate-pulse rounded bg-muted" />
            ) : (
              <p className="text-2xl font-bold tracking-tight text-foreground">
                {value}
              </p>
            )}
            {description && !loading && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              ACCENT_BG[accent],
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>

        {change !== undefined && !loading && (
          <div className="mt-3 flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                "flex items-center gap-0.5 font-medium",
                isGood ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {positive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {formatPercent(Math.abs(change / 100), {
                maximumFractionDigits: 1,
              })}
            </span>
            <span className="text-muted-foreground">vs last period</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
