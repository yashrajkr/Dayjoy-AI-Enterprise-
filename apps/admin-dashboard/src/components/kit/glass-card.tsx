'use client'

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GlassCard({
  children,
  className,
  tilt = true,
  delay = 0,
  premium = false,
}: {
  children: ReactNode;
  className?: string;
  tilt?: boolean;
  delay?: number;
  premium?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "glass rounded-2xl",
        tilt && "tilt-card",
        premium && "gradient-border",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

export function CardHead({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-glass-strong text-brand">{icon}</div>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{title}</h2>
          {subtitle ? <p className="truncate text-xs text-subtle">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
