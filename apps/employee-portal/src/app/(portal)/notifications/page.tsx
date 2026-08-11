"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  CircleDot,
  MessageSquare,
  Megaphone,
  Settings2,
  Target,
  TicketIcon,
  CheckSquare,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type AppNotification,
  type NotificationType,
} from "@/hooks/use-notifications";
import {
  cn,
  formatRelativeTime,
  getStatusColor,
} from "@/lib/utils";

const TYPES: (NotificationType | "ALL")[] = [
  "ALL",
  "TASK",
  "TICKET",
  "LEAD",
  "ANNOUNCEMENT",
  "MENTION",
  "SYSTEM",
];

const TYPE_LABELS: Record<NotificationType | "ALL", string> = {
  ALL: "All",
  TASK: "Tasks",
  TICKET: "Tickets",
  LEAD: "Leads",
  ANNOUNCEMENT: "Announcements",
  MENTION: "Mentions",
  SYSTEM: "System",
};

const TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  TASK: CheckSquare,
  TICKET: TicketIcon,
  LEAD: Target,
  ANNOUNCEMENT: Megaphone,
  MENTION: MessageSquare,
  SYSTEM: Settings2,
};

const TYPE_ACCENT: Record<NotificationType, string> = {
  TASK: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  TICKET: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  LEAD: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  ANNOUNCEMENT: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  MENTION: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  SYSTEM: "bg-muted text-muted-foreground",
};

export default function NotificationsPage() {
  const { data, isLoading, isError } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [type, setType] = useState<NotificationType | "ALL">("ALL");

  const filtered = useMemo(() => {
    if (!data) return [];
    const list = type === "ALL" ? data : data.filter((n) => n.type === type);
    return [...list].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data, type]);

  const unreadCount = (data ?? []).filter((n) => !n.read).length;

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-[10px]">
                {unreadCount} new
              </Badge>
            )}
          </span>
        }
        description="Stay on top of tasks, tickets, leads, and team updates."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={unreadCount === 0 || markAllRead.isPending}
          >
            <CheckCheck className="h-4 w-4" /> Mark all as read
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          {TYPES.map((t) => {
            const count =
              t === "ALL"
                ? (data ?? []).length
                : (data ?? []).filter((n) => n.type === t).length;
            return (
              <Button
                key={t}
                variant={type === t ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setType(t)}
              >
                {t !== "ALL" && (() => {
                  const Icon = TYPE_ICONS[t];
                  return <Icon className="h-3.5 w-3.5" />;
                })()}
                {TYPE_LABELS[t]}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px]",
                    type === t
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      {isError ? (
        <EmptyState title="Couldn't load notifications" description="Please try again in a moment." />
      ) : isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="No notifications to show."
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {TYPE_LABELS[type]} — {filtered.length}
            </CardTitle>
            <CardDescription>
              Most recent first. Unread items are highlighted.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="max-h-[calc(100vh-340px)]">
              <ul className="divide-y divide-border">
                {filtered.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    onMarkRead={() => markRead.mutate(n.id)}
                  />
                ))}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: AppNotification;
  onMarkRead: () => void;
}) {
  const Icon = TYPE_ICONS[notification.type];
  const accent = TYPE_ACCENT[notification.type];

  const content = (
    <div
      className={cn(
        "flex gap-3 p-4 transition-colors hover:bg-accent/40",
        !notification.read && "bg-primary/[0.03]",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          accent,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            {notification.title}
          </p>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {notification.body}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn("text-[10px]", getStatusColor(notification.type))}
          >
            {TYPE_LABELS[notification.type]}
          </Badge>
          {!notification.read && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMarkRead();
              }}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
            >
              <CircleDot className="h-3 w-3" /> Mark as read
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <li>
      {notification.href ? (
        <Link href={notification.href} className="block">
          {content}
        </Link>
      ) : (
        content
      )}
    </li>
  );
}
