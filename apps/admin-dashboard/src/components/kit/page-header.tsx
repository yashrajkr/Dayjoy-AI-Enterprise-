'use client'

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneBgSoft, toneDot, type Tone } from "@/lib/tone";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.header
      initial={reduceMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-[13px] text-subtle">{subtitle}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </motion.header>
  );
}

export function Pill({
  children,
  tone = "muted",
  dot = false,
  pulse = false,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneBgSoft[tone],
        className,
      )}
    >
      {dot ? (
        <span className={cn("size-1.5 rounded-full", toneDot[tone], pulse && "live-dot")} />
      ) : null}
      {children}
    </span>
  );
}

export function Meter({ value, tone = "brand", className }: { value: number; tone?: Tone; className?: string }) {
  const reduceMotion = useReducedMotion();
  const pct = Math.min(Math.max(value, 0), 100);
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-glass-strong", className)}>
      <motion.div
        initial={reduceMotion ? { width: `${pct}%` } : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={cn("h-full rounded-full", toneDot[tone])}
        style={{ minWidth: pct > 0 ? '6px' : 0 }}
      />
    </div>
  );
}

export function DataTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-1 mt-4 overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <thead>
          <tr className="text-xs font-medium tracking-wide text-subtle uppercase">
            {head.map((h) => (
              <th key={h} className="px-3 pb-3 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="align-middle">{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <tr className="border-t border-border/70 transition-colors hover:bg-glass">{children}</tr>;
}

export function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-3 whitespace-nowrap", className)}>{children}</td>;
}
