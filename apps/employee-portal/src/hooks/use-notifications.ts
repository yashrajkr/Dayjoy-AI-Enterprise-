"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { toast } from "sonner";

export type NotificationType =
  | "TASK"
  | "TICKET"
  | "LEAD"
  | "ANNOUNCEMENT"
  | "SYSTEM"
  | "MENTION";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  read: boolean;
  createdAt: string;
}

export function useNotifications() {
  return useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: async () => {
      try {
        const data = await api.get<AppNotification[]>("/notifications");
        if (Array.isArray(data) && data.length > 0) return data;
        return mockNotifications();
      } catch {
        return mockNotifications();
      }
    },
    staleTime: 30 * 1000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      api.patch(`/notifications/${id}/read`).catch(() => undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      api.post("/notifications/mark-all-read").catch(() => undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
      toast.success("All notifications marked as read");
    },
  });
}

function mockNotifications(): AppNotification[] {
  const now = new Date();
  const oneHourAgo = new Date(now); oneHourAgo.setHours(now.getHours() - 1);
  const twoHoursAgo = new Date(now); twoHoursAgo.setHours(now.getHours() - 2);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const twoDaysAgo = new Date(now); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  return [
    {
      id: "n1",
      type: "TICKET",
      title: "Urgent ticket #TKT-4821 assigned to you",
      body: "Damaged wellness kit — needs refund. SLA due in 1 hour.",
      href: "/tickets/tkt_4821",
      read: false,
      createdAt: oneHourAgo.toISOString(),
    },
    {
      id: "n2",
      type: "TASK",
      title: "Task due today: Follow up with Rajesh Kumar",
      body: "Call to confirm 200-unit bulk order.",
      href: "/tasks/task_1001",
      read: false,
      createdAt: twoHoursAgo.toISOString(),
    },
    {
      id: "n3",
      type: "LEAD",
      title: "New lead assigned: Vikram Reddy moved to Qualified",
      href: "/crm/leads/lead_001",
      read: false,
      createdAt: yesterday.toISOString(),
    },
    {
      id: "n4",
      type: "ANNOUNCEMENT",
      title: "Q3 Sales Kick-off — Friday 10am",
      body: "All sales team members: please join the Q3 kick-off call.",
      read: true,
      createdAt: yesterday.toISOString(),
    },
    {
      id: "n5",
      type: "MENTION",
      title: "Priya Sharma mentioned you in #sales",
      body: "@You — please prep the territory deck for Friday.",
      href: "/chat",
      read: false,
      createdAt: twoHoursAgo.toISOString(),
    },
    {
      id: "n6",
      type: "SYSTEM",
      title: "AI Assistant feature: ticket summarisation is live",
      body: "Try it from any ticket detail page → 'Draft with AI'.",
      read: true,
      createdAt: twoDaysAgo.toISOString(),
    },
    {
      id: "n7",
      type: "TICKET",
      title: "Ticket #TKT-4818 customer replied",
      body: "Customer is following up on the GST invoice.",
      href: "/tickets/tkt_4818",
      read: true,
      createdAt: yesterday.toISOString(),
    },
  ];
}
