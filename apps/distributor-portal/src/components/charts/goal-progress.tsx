"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, TrendingUp } from "lucide-react";
import { cn, formatCurrency, formatCurrencyCompact, formatPercent } from "@/lib/utils";
import type { DistributorTier } from "@/types/distributor.types";

interface GoalProgressProps {
  /** Current tier. */
  currentTier: DistributorTier;
  /** This-period sales (used to compute progress toward the next tier). */
  currentSales: number;
  /** The next-tier sales threshold. */
  nextTierThreshold?: number;
  /** The next tier name (e.g. "Silver"). */
  nextTierName?: string;
  loading?: boolean;
  className?: string;
}

/**
 * Goal progress — progress bar + ring showing the distributor's progress
 * toward the next tier. Surfaces the gap (₹X more to reach the next
 * tier) and the commission-rate bump they'd earn.
 */
export function GoalProgress({
  currentTier,
  currentSales,
  nextTierThreshold,
  nextTierName,
  loading,
  className,
}: GoalProgressProps) {
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-8 w-24" />
        </CardContent>
      </Card>
    );
  }

  const isMaxTier = currentTier === "PLATINUM" || !nextTierThreshold;
  const progress = isMaxTier
    ? 100
    : Math.min(100, Math.max(0, (currentSales / nextTierThreshold!) * 100));
  const remaining = isMaxTier ? 0 : Math.max(0, nextTierThreshold! - currentSales);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Tier Progress
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {currentTier}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isMaxTier ? (
          <div className="rounded-lg bg-primary/5 p-4 text-center">
            <Trophy className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 text-sm font-semibold text-foreground">
              You&apos;ve reached the top tier!
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Enjoy maximum commission rates and exclusive Platinum benefits.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Progress to <span className="font-medium text-foreground">{nextTierName}</span>
                </span>
                <span className="font-semibold text-foreground">
                  {formatPercent(progress / 100, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <Progress value={progress} className="h-2.5" />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{formatCurrencyCompact(currentSales)} sold</span>
                <span>{formatCurrencyCompact(nextTierThreshold!)} goal</span>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(remaining)} more to reach {nextTierName}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  Unlock higher commission rates & team overrides
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
