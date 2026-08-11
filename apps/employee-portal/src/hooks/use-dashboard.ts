"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";

export interface DashboardKpis {
  myOpenTasks: number;
  myOpenTickets: number;
  leadsToday: number;
  customersManaged: number;
  tasksCompletedThisWeek: number;
  avgFirstResponseTimeMins: number;
}

export interface DashboardTaskItem {
  id: string;
  title: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  dueDate: string;
  relatedTo?: { type: string; label: string };
}

export interface DashboardTicketItem {
  id: string;
  number: string;
  subject: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: string;
  customerName: string;
  createdAt: string;
}

export interface DashboardActivityItem {
  id: string;
  type:
    | "TASK_COMPLETED"
    | "TICKET_REPLIED"
    | "LEAD_UPDATED"
    | "CUSTOMER_CONTACTED"
    | "NOTE_ADDED";
  description: string;
  timestamp: string;
}

export interface DashboardAnnouncement {
  id: string;
  title: string;
  body: string;
  authorName: string;
  publishedAt: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
}

export interface DashboardData {
  kpis: DashboardKpis;
  tasksToday: DashboardTaskItem[];
  recentTickets: DashboardTicketItem[];
  recentActivity: DashboardActivityItem[];
  announcements: DashboardAnnouncement[];
  weeklyTasks: { day: string; completed: number; created: number }[];
}

/**
 * Pull dashboard data from `GET /api/analytics/dashboard`. Falls back to
 * deterministic mock data when the analytics endpoint isn't reachable so
 * the portal stays usable in dev / preview environments.
 */
export function useDashboard() {
  return useQuery({
    queryKey: QUERY_KEYS.analyticsDashboard,
    queryFn: async () => {
      try {
        const data = await api.get<DashboardData>(
          "/analytics/dashboard",
          { scope: "employee" },
        );
        if (data && data.kpis) return data;
        return mockDashboard();
      } catch {
        return mockDashboard();
      }
    },
    staleTime: 60 * 1000,
  });
}

function mockDashboard(): DashboardData {
  const now = new Date();
  const today = new Date(now);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const twoHoursAgo = new Date(now); twoHoursAgo.setHours(now.getHours() - 2);
  const oneHourAgo = new Date(now); oneHourAgo.setHours(now.getHours() - 1);
  const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return {
    kpis: {
      myOpenTasks: 7,
      myOpenTickets: 4,
      leadsToday: 3,
      customersManaged: 42,
      tasksCompletedThisWeek: 18,
      avgFirstResponseTimeMins: 14,
    },
    tasksToday: [
      {
        id: "task_1001",
        title: "Follow up with Rajesh Kumar about bulk order",
        priority: "HIGH",
        status: "IN_PROGRESS",
        dueDate: today.toISOString(),
        relatedTo: { type: "CUSTOMER", label: "Rajesh Kumar" },
      },
      {
        id: "task_1002",
        title: "Resolve ticket #TKT-4821 — refund for damaged shipment",
        priority: "URGENT",
        status: "TODO",
        dueDate: today.toISOString(),
        relatedTo: { type: "TICKET", label: "#TKT-4821" },
      },
      {
        id: "task_1003",
        title: "Draft onboarding email for new Gold-tier distributor",
        priority: "MEDIUM",
        status: "TODO",
        dueDate: today.toISOString(),
        relatedTo: { type: "DISTRIBUTOR", label: "Wellness Roots Pvt Ltd" },
      },
      {
        id: "task_1004",
        title: "Schedule demo call with Meena Iyer",
        priority: "LOW",
        status: "TODO",
        dueDate: today.toISOString(),
        relatedTo: { type: "LEAD", label: "Meena Iyer" },
      },
    ],
    recentTickets: [
      {
        id: "tkt_4821",
        number: "TKT-4821",
        subject: "Damaged wellness kit — needs refund",
        priority: "URGENT",
        status: "OPEN",
        customerName: "Rajesh Kumar",
        createdAt: twoHoursAgo.toISOString(),
      },
      {
        id: "tkt_4818",
        number: "TKT-4818",
        subject: "GST invoice missing for order #ORD-22931",
        priority: "MEDIUM",
        status: "IN_PROGRESS",
        customerName: "Sunita Traders",
        createdAt: yesterday.toISOString(),
      },
      {
        id: "tkt_4812",
        number: "TKT-4812",
        subject: "Bulk pricing request — Wellness Bundle",
        priority: "HIGH",
        status: "WAITING_CUSTOMER",
        customerName: "Meena Iyer",
        createdAt: yesterday.toISOString(),
      },
      {
        id: "tkt_4801",
        number: "TKT-4801",
        subject: "Password reset & account recovery",
        priority: "LOW",
        status: "RESOLVED",
        customerName: "Anil Verma",
        createdAt: twoHoursAgo.toISOString(),
      },
    ],
    recentActivity: [
      {
        id: "act_1",
        type: "TASK_COMPLETED",
        description: "Closed the deal with Meena — Wellness Bundle",
        timestamp: oneHourAgo.toISOString(),
      },
      {
        id: "act_2",
        type: "TICKET_REPLIED",
        description: "Replied to TKT-4818 (GST invoice missing)",
        timestamp: twoHoursAgo.toISOString(),
      },
      {
        id: "act_3",
        type: "LEAD_UPDATED",
        description: "Moved lead 'Vikram Reddy' from Contacted → Qualified",
        timestamp: yesterday.toISOString(),
      },
      {
        id: "act_4",
        type: "CUSTOMER_CONTACTED",
        description: "Logged a call with Sunita Traders",
        timestamp: yesterday.toISOString(),
      },
    ],
    announcements: [
      {
        id: "ann_1",
        title: "Q3 Sales Kick-off — Friday 10am",
        body: "All sales team members: please join the Q3 kick-off call on Friday at 10am IST. We'll cover the new compensation plan and product bundle targets.",
        authorName: "Priya Sharma (Sales Head)",
        publishedAt: yesterday.toISOString(),
        priority: "HIGH",
      },
      {
        id: "ann_2",
        title: "New AI Assistant feature: ticket summarisation",
        body: "The AI Assistant can now summarise any ticket's history. Try it from the ticket detail page → 'Summarise with AI'.",
        authorName: "Product Team",
        publishedAt: twoHoursAgo.toISOString(),
        priority: "MEDIUM",
      },
    ],
    weeklyTasks: week.map((day, i) => ({
      day,
      completed: [3, 4, 2, 5, 4, 0, 0][i] ?? 0,
      created: [4, 5, 3, 6, 5, 1, 0][i] ?? 0,
    })),
  };
}
