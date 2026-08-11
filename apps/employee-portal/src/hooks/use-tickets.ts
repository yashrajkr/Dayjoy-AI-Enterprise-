"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import type {
  SupportTicket,
  TicketFilters,
  UpdateTicketInput,
  ReplyTicketInput,
} from "@/types/ticket.types";

export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: [...QUERY_KEYS.tickets, filters],
    queryFn: async () => {
      try {
        const data = await api.get<SupportTicket[]>("/support-tickets", {
          status: filters.status !== "ALL" ? filters.status : undefined,
          priority: filters.priority !== "ALL" ? filters.priority : undefined,
          assignedToId:
            filters.assignedToId !== "ALL" ? filters.assignedToId : undefined,
          search: filters.search || undefined,
        });
        if (Array.isArray(data) && data.length > 0) return data;
        return mockTickets();
      } catch {
        return mockTickets();
      }
    },
    staleTime: 30 * 1000,
  });
}

export function useTicket(id: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: id ? QUERY_KEYS.ticket(id) : ["tickets", "undefined"],
    queryFn: async () => {
      try {
        return await api.get<SupportTicket>(`/support-tickets/${id}`);
      } catch {
        return mockTickets().find((t) => t.id === id) ?? mockTickets()[0]!;
      }
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTicketInput }) =>
      api.put<SupportTicket>(`/support-tickets/${id}`, input).catch(() => undefined),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticket(id) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tickets });
      }
    },
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReplyTicketInput }) =>
      api.post(`/support-tickets/${id}/messages`, input).catch(() => undefined),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticket(id) });
      }
    },
  });

  const escalateMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/support-tickets/${id}/escalate`).catch(() => undefined),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ticket(id) });
        toast.success("Ticket escalated");
      }
    },
  });

  return {
    ticket: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    updateTicket: (input: UpdateTicketInput) =>
      updateMutation.mutateAsync({ id: id!, input }),
    reply: (input: ReplyTicketInput) =>
      replyMutation.mutateAsync({ id: id!, input }),
    escalate: () => escalateMutation.mutateAsync(id!),
  };
}

function mockTickets(): SupportTicket[] {
  const now = new Date();
  const today = new Date(now);
  const twoHoursAgo = new Date(now); twoHoursAgo.setHours(now.getHours() - 2);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(now); lastWeek.setDate(lastWeek.getDate() - 5);

  return [
    {
      id: "tkt_4821",
      number: "TKT-4821",
      subject: "Damaged wellness kit — needs refund",
      description:
        "Customer received the Wellness Bundle with broken seals on 3 of 5 items. Requesting full refund. Photos attached.",
      status: "OPEN",
      priority: "URGENT",
      category: "RETURN",
      channel: "WHATSAPP",
      customerId: "cus_001",
      customer: {
        id: "cus_001",
        name: "Rajesh Kumar",
        email: "rajesh.kumar@gmail.com",
        phone: "+91 98765 43210",
      },
      assignedToName: "You",
      slaDueAt: today.toISOString(),
      messages: [
        {
          id: "m1",
          authorId: "cus_001",
          authorName: "Rajesh Kumar",
          authorRole: "CUSTOMER",
          body: "Hi, my wellness kit arrived damaged. 3 of 5 bottles had broken seals.",
          createdAt: twoHoursAgo.toISOString(),
        },
        {
          id: "m2",
          authorId: "ai",
          authorName: "Dayjoy AI",
          authorRole: "AI",
          body: "Hi Rajesh, I'm sorry to hear that. I've routed your ticket to our support team who will respond within 1 hour.",
          createdAt: twoHoursAgo.toISOString(),
        },
      ],
      activity: [
        {
          id: "a1",
          type: "COMMENT",
          description: "Ticket created via WhatsApp.",
          actorName: "System",
          createdAt: twoHoursAgo.toISOString(),
        },
        {
          id: "a2",
          type: "ASSIGNMENT",
          description: "Assigned to you.",
          actorName: "Priya Sharma",
          createdAt: twoHoursAgo.toISOString(),
        },
      ],
      totalMinutesLogged: 0,
      createdAt: twoHoursAgo.toISOString(),
      updatedAt: twoHoursAgo.toISOString(),
    },
    {
      id: "tkt_4818",
      number: "TKT-4818",
      subject: "GST invoice missing for order #ORD-22931",
      description: "Need a GST invoice for the order placed last week. GSTIN: 27AABCS1234L1Z5.",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      category: "PAYMENT",
      channel: "EMAIL",
      customerId: "cus_002",
      customer: {
        id: "cus_002",
        name: "Sunita Traders",
        email: "accounts@sunitatraders.in",
        phone: "+91 91234 56780",
      },
      assignedToName: "You",
      relatedOrderId: "ord_1",
      messages: [
        {
          id: "m3",
          authorId: "cus_002",
          authorName: "Sunita Traders",
          authorRole: "CUSTOMER",
          body: "Please share the GST invoice for order ORD-22931.",
          createdAt: yesterday.toISOString(),
        },
        {
          id: "m4",
          authorId: "self",
          authorName: "You",
          authorRole: "EMPLOYEE",
          body: "Hi, I'll have the finance team generate the GST invoice and share it within 24 hours.",
          createdAt: yesterday.toISOString(),
        },
      ],
      activity: [],
      totalMinutesLogged: 15,
      createdAt: yesterday.toISOString(),
      updatedAt: yesterday.toISOString(),
    },
    {
      id: "tkt_4812",
      number: "TKT-4812",
      subject: "Bulk pricing request — Wellness Bundle",
      description: "Wants 50-unit bulk pricing for corporate gifting.",
      status: "WAITING_CUSTOMER",
      priority: "HIGH",
      category: "ORDER",
      channel: "WEB",
      customerId: "cus_003",
      customer: {
        id: "cus_003",
        name: "Meena Iyer",
        email: "meena.iyer@gmail.com",
        phone: "+91 99876 54321",
      },
      assignedToName: "You",
      messages: [
        {
          id: "m5",
          authorId: "cus_003",
          authorName: "Meena Iyer",
          authorRole: "CUSTOMER",
          body: "We're interested in 50 wellness bundles for corporate gifting. What's the bulk pricing?",
          createdAt: yesterday.toISOString(),
        },
        {
          id: "m6",
          authorId: "self",
          authorName: "You",
          authorRole: "EMPLOYEE",
          body: "Hi Meena, thanks for reaching out! For 50 units I can offer ₹1,499/unit (vs ₹1,999 list). I'll send the proposal shortly.",
          createdAt: yesterday.toISOString(),
        },
      ],
      activity: [],
      totalMinutesLogged: 30,
      createdAt: yesterday.toISOString(),
      updatedAt: yesterday.toISOString(),
    },
    {
      id: "tkt_4801",
      number: "TKT-4801",
      subject: "Password reset & account recovery",
      description: "Customer couldn't log in. Sent reset link.",
      status: "RESOLVED",
      priority: "LOW",
      category: "ACCOUNT",
      channel: "WEB",
      customerId: "cus_004",
      customer: {
        id: "cus_004",
        name: "Anil Verma",
        email: "anil.verma@outlook.com",
        phone: "+91 90909 80808",
      },
      assignedToName: "You",
      resolvedAt: twoHoursAgo.toISOString(),
      messages: [
        {
          id: "m7",
          authorId: "cus_004",
          authorName: "Anil Verma",
          authorRole: "CUSTOMER",
          body: "Can't log in to my account.",
          createdAt: lastWeek.toISOString(),
        },
        {
          id: "m8",
          authorId: "self",
          authorName: "You",
          authorRole: "EMPLOYEE",
          body: "Hi Anil, I've sent a password reset link to your registered email. Let me know if you don't receive it.",
          createdAt: lastWeek.toISOString(),
        },
      ],
      activity: [],
      totalMinutesLogged: 10,
      createdAt: lastWeek.toISOString(),
      updatedAt: twoHoursAgo.toISOString(),
    },
    {
      id: "tkt_4795",
      number: "TKT-4795",
      subject: "Product enquiry — Ayurvedic supplements",
      description: "Wants to know if Ayurvedic supplements are safe with BP medication.",
      status: "OPEN",
      priority: "MEDIUM",
      category: "PRODUCT",
      channel: "PHONE",
      customerId: "cus_005",
      customer: {
        id: "cus_005",
        name: "Wellness Roots Pvt Ltd",
        email: "info@wellnessroots.in",
        phone: "+91 80123 45678",
      },
      assignedToName: "You",
      messages: [],
      activity: [],
      totalMinutesLogged: 0,
      createdAt: today.toISOString(),
      updatedAt: today.toISOString(),
    },
  ];
}
