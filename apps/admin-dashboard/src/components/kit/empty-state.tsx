"use client";

import { type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/kit/glass-card";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <GlassCard tilt={false} className="p-10 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-border bg-glass-strong text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <p className="mt-4 text-[15px] font-semibold">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-[13px] text-subtle">{description}</p> : null}
      {action ? (
        <button
          onClick={action.onClick}
          className="bg-gradient-brand mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
        >
          {action.label}
        </button>
      ) : null}
    </GlassCard>
  );
}
