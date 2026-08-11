"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Package,
  Settings as SettingsIcon,
  Sparkles,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { EmptyState } from "@/components/ui/empty-state";
import { notificationsService } from "@/lib/services";
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS } from "@/lib/constants";
import {
  cn,
  formatRelativeTime,
  getStatusColor,
} from "@/lib/utils";
import type { NotificationItem, NotificationType } from "@/types";

const TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  COMMISSION: Sparkles,
  TEAM: Users,
  ORDER: Package,
  ANNOUNCEMENT: Bell,
  SYSTEM: SettingsIcon,
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: notifications, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["notifications", { type: typeFilter }],
    queryFn: () =>
      notificationsService.list({
        type: typeFilter !== "all" ? typeFilter : undefined,
      }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsService.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsService.markAllRead(),
    onSuccess: () => {
      toast.success("All notifications marked as read.");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: () => toast.error("Failed to mark all as read."),
  });

  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`
            : "You're all caught up!"
        }
        icon={Bell}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => markAllMutation.mutate()}
              disabled={unreadCount === 0 || markAllMutation.isPending}
              loading={markAllMutation.isPending}
            >
              <CheckCheck className="h-4 w-4" />
              Mark all as read
            </Button>
            <Button variant="ghost" asChild>
              <a href="/settings">Notification settings</a>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="p-4">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]" aria-label="Filter by type">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {NOTIFICATION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {NOTIFICATION_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isError && (
        <InlineAlert variant="error">
          Failed to load notifications: {(error as Error)?.message ?? "Unknown error"}.{" "}
          <button
            type="button"
            onClick={() => refetch()}
            className="underline underline-offset-2"
          >
            Retry
          </button>
        </InlineAlert>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="m-3 h-16" />
            ))}
          </CardContent>
        </Card>
      ) : !notifications || notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="You'll see updates about commissions, team activity, and orders here."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const Icon = TYPE_ICONS[n.type] ?? Bell;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 p-4 transition-colors hover:bg-muted/30",
                      !n.read && "bg-primary/[0.03]",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        getStatusColor(n.type.toLowerCase()),
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={cn(
                            "text-sm",
                            n.read
                              ? "font-medium text-foreground"
                              : "font-semibold text-foreground",
                          )}
                        >
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {n.body}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge variant="secondary">
                          {NOTIFICATION_TYPE_LABELS[n.type]}
                        </Badge>
                        <time className="text-xs text-muted-foreground">
                          {formatRelativeTime(n.createdAt)}
                        </time>
                        {n.link && (
                          <a
                            href={n.link}
                            className="ml-auto text-xs font-medium text-primary hover:underline"
                          >
                            View →
                          </a>
                        )}
                      </div>
                    </div>
                    {!n.read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markReadMutation.mutate(n.id)}
                        disabled={markReadMutation.isPending}
                        aria-label="Mark as read"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
