"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Check, CheckCheck, BellOff } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import {
  cn,
  formatRelativeTime,
  getStatusColor,
  titleCase,
} from "@/lib/utils";
import type { Notification, NotificationType } from "@/types/notification.types";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { EmptyState } from "@/components/ui/empty-state";

const TYPE_LABELS: Record<NotificationType, string> = {
  order: "Order",
  payment: "Payment",
  shipment: "Shipment",
  promotion: "Offer",
  system: "System",
  ai: "AI",
  support: "Support",
  account: "Account",
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const notificationsQuery = useQuery({
    queryKey: [...QUERY_KEYS.notifications, { filter }],
    queryFn: () =>
      api.paginated<Notification>("/notifications", {
        limit: 50,
        unreadOnly: filter === "unread" ? true : undefined,
      }),
    staleTime: 30 * 1000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications }),
    onError: (err) =>
      toast.error("Failed to mark as read", { description: getErrorMessage(err) }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => {
      toast.success("All notifications marked as read");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
    onError: (err) =>
      toast.error("Action failed", { description: getErrorMessage(err) }),
  });

  const unreadCount =
    notificationsQuery.data?.data.filter((n) => !n.read).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Stay up to date with your orders, offers, and account activity."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={unreadCount === 0 || markAllReadMutation.isPending}
          >
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        }
      />

      {/* Filter pills */}
      <div className="flex gap-2">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition-colors",
              filter === f
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {f === "all" ? "All" : `Unread${unreadCount ? ` (${unreadCount})` : ""}`}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {notificationsQuery.isLoading ? (
            <LoadingState label="Loading notifications…" />
          ) : notificationsQuery.isError ? (
            <ErrorState
              error={notificationsQuery.error}
              onRetry={() => notificationsQuery.refetch()}
            />
          ) : !notificationsQuery.data?.data.length ? (
            <EmptyState
              icon={filter === "unread" ? Check : BellOff}
              title={
                filter === "unread"
                  ? "You're all caught up"
                  : "No notifications yet"
              }
              description={
                filter === "unread"
                  ? "You have no unread notifications."
                  : "Order updates and offers will appear here."
              }
              className="rounded-none border-0"
            />
          ) : (
            <ul className="divide-y divide-border">
              {notificationsQuery.data.data.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "flex gap-3 p-4 transition-colors hover:bg-accent",
                    !n.read && "bg-primary/[0.03]",
                  )}
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {n.title}
                      </p>
                      <Badge variant="secondary" className="text-[10px]">
                        {TYPE_LABELS[n.type]}
                      </Badge>
                      {!n.read && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {n.message}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {formatRelativeTime(n.createdAt)}
                    </p>
                  </div>
                  {!n.read && (
                    <button
                      onClick={() => markReadMutation.mutate(n.id)}
                      className="shrink-0 self-start rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Mark as read"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
