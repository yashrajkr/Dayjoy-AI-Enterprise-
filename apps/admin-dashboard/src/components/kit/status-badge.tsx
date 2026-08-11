"use client";

import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/tone";
import { toneBgSoft } from "@/lib/tone";

interface StatusBadgeProps {
  status: string;
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
}

const STATUS_TONE_MAP: Record<string, Tone> = {
  active: "success",
  ready: "success",
  approved: "success",
  healthy: "success",
  completed: "success",
  configured: "success",
  enabled: "success",

  draft: "muted",
  paused: "muted",
  disabled: "muted",
  inactive: "muted",
  archived: "muted",
  invited: "muted",

  processing: "info",
  uploading: "info",
  connecting: "info",
  connected: "info",
  pending: "warning",

  failed: "danger",
  error: "danger",
  rejected: "danger",
  abandoned: "danger",
  suspended: "danger",
  degraded: "warning",
};

export function StatusBadge({ status, tone, dot = true, pulse = false }: StatusBadgeProps) {
  const resolvedTone = tone ?? STATUS_TONE_MAP[status.toLowerCase()] ?? "muted";
  const shouldPulse = pulse || ["processing", "uploading", "connecting", "connected", "pending"].includes(status.toLowerCase());

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize whitespace-nowrap",
        toneBgSoft[resolvedTone],
      )}
    >
      {dot ? (
        <span className={cn("size-1.5 rounded-full", shouldPulse && "live-dot")} style={{ backgroundColor: "currentColor" }} />
      ) : null}
      {status}
    </span>
  );
}
