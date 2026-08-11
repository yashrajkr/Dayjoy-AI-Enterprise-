import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { TicketStatus } from "@/types";

const STATUS_META: Record<
  TicketStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  OPEN: { label: "Open", variant: "info" },
  IN_PROGRESS: { label: "In Progress", variant: "warning" },
  RESOLVED: { label: "Resolved", variant: "success" },
  CLOSED: { label: "Closed", variant: "muted" },
};

interface TicketStatusBadgeProps {
  status: TicketStatus;
  className?: string;
}

/**
 * Color-coded status badge for support tickets.
 * OPEN → info (sky), IN_PROGRESS → warning (amber),
 * RESOLVED → success (emerald), CLOSED → muted (gray).
 */
export function TicketStatusBadge({
  status,
  className,
}: TicketStatusBadgeProps) {
  const meta = STATUS_META[status] ?? {
    label: status,
    variant: "muted" as const,
  };
  return (
    <Badge variant={meta.variant} className={className}>
      {meta.label}
    </Badge>
  );
}

const PRIORITY_META: Record<
  string,
  { label: string; variant: BadgeProps["variant"] }
> = {
  LOW: { label: "Low", variant: "muted" },
  MEDIUM: { label: "Medium", variant: "info" },
  HIGH: { label: "High", variant: "warning" },
  URGENT: { label: "Urgent", variant: "destructive" },
};

export function TicketPriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITY_META[priority] ?? {
    label: priority,
    variant: "muted" as const,
  };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
