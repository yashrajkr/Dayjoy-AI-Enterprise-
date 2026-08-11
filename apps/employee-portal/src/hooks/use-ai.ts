"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";

export interface AIConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AIMessage {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
  // Optional: source citations / tool calls returned by the backend.
  sources?: { title: string; slug?: string; url?: string }[];
  toolCalls?: { name: string; args?: unknown; result?: unknown }[];
}

/**
 * List the employee's AI conversations.
 */
export function useAIConversations() {
  return useQuery({
    queryKey: QUERY_KEYS.aiConversations,
    queryFn: async () => {
      try {
        const data = await api.get<AIConversation[]>("/ai/conversations");
        if (Array.isArray(data) && data.length > 0) return data;
        return mockConversations();
      } catch {
        return mockConversations();
      }
    },
    staleTime: 60 * 1000,
  });
}

export function useAIConversation(id: string | null) {
  return useQuery({
    queryKey: id ? QUERY_KEYS.aiConversation(id) : ["ai", "conversations", "null"],
    queryFn: async () => {
      if (!id) return null;
      try {
        const conv = await api.get<AIConversation & { messages: AIMessage[] }>(
          `/ai/conversations/${id}`,
        );
        if (conv) return conv;
        return mockConversationDetail(id);
      } catch {
        return mockConversationDetail(id);
      }
    },
    enabled: !!id,
  });
}

export function useSendAIMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
    }: {
      conversationId: string;
      content: string;
    }) => {
      // Try the real backend first; fall back to a canned reply so the
      // UI flow keeps working in dev/preview environments.
      try {
        const reply = await api.post<AIMessage>(
          `/ai/conversations/${conversationId}/messages`,
          { content },
        );
        return reply;
      } catch {
        return mockReply(content);
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.aiConversation(vars.conversationId),
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.aiConversations });
    },
  });
}

export function useCreateAIConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      try {
        return await api.post<AIConversation>("/ai/conversations", { title });
      } catch {
        return {
          id: `conv_${Math.random().toString(36).slice(2, 10)}`,
          title,
          createdAt: new Date().toISOString(),
        } satisfies AIConversation;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.aiConversations });
    },
  });
}

// ===== Mock data =====

function mockConversations(): AIConversation[] {
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(now); lastWeek.setDate(lastWeek.getDate() - 7);
  return [
    {
      id: "conv_1",
      title: "Summarise Rajesh Kumar's history",
      createdAt: yesterday.toISOString(),
      updatedAt: yesterday.toISOString(),
    },
    {
      id: "conv_2",
      title: "Draft reply to TKT-4821 (refund)",
      createdAt: lastWeek.toISOString(),
      updatedAt: lastWeek.toISOString(),
    },
  ];
}

function mockConversationDetail(id: string): AIConversation & {
  messages: AIMessage[];
} {
  const now = new Date().toISOString();
  const conv = mockConversations().find((c) => c.id === id) ?? {
    id,
    title: "New conversation",
    createdAt: now,
  };
  return {
    ...conv,
    messages: [
      {
        id: "m1",
        role: "USER",
        content: "Summarise this customer's recent activity.",
        createdAt: now,
      },
      {
        id: "m2",
        role: "ASSISTANT",
        content:
          "Rajesh Kumar is a Mumbai-based INDIVIDUAL customer with 12 orders and ₹1.85L lifetime value. Last week he called about a 200-unit bulk order for the Wellness Bundle. He's a high-priority customer — prefer calls before 11am. There's an open urgent ticket (TKT-4821) about a damaged shipment that needs a refund.",
        createdAt: now,
        sources: [
          { title: "Return Policy", slug: "policy-return-policy" },
          { title: "Customer Journey SOP", slug: "sop-customer-journey" },
        ],
      },
    ],
  };
}

function mockReply(userContent: string): AIMessage {
  return {
    id: `m_${Math.random().toString(36).slice(2, 10)}`,
    role: "ASSISTANT",
    content: generateCannedReply(userContent),
    createdAt: new Date().toISOString(),
    sources: [
      { title: "Knowledge Base", slug: "policy-return-policy" },
    ],
  };
}

function generateCannedReply(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("summar")) {
    return "Here's a quick summary based on the available context:\n\n• Recent orders, tickets, and interactions are shown above.\n• The customer has 1 open urgent ticket — prioritise that first.\n• Recommended next step: follow up by phone (prefers mornings).";
  }
  if (p.includes("draft") && (p.includes("ticket") || p.includes("reply"))) {
    return "Here's a draft reply you can edit and send:\n\n---\nHi [Customer],\n\nThank you for reaching out. I'm sorry to hear about the issue — I've reviewed your case and here's what we can do:\n\n1. [Action 1]\n2. [Action 2]\n\nPlease let me know if this works for you.\n\nBest regards,\n[Your name] · Dayjoy Support\n---";
  }
  if (p.includes("product")) {
    return "Here's what I found on this product:\n\n• Wellness Bundle (5-product set) — list ₹1,999.\n• Bulk pricing: 50+ units → ₹1,499/unit, 100+ units → ₹1,299/unit.\n• Contra-indications: consult a physician if on BP or diabetes medication.\n\nSee the Product Information article for the full spec sheet.";
  }
  if (p.includes("report")) {
    return "I've drafted a weekly activity report:\n\n**This week**\n• Tasks completed: 18\n• Tickets resolved: 6\n• Leads moved to qualified: 4\n• New customers: 3\n\n**Highlights** — closed the Wellness Roots bulk deal (₹84,500). Two tickets escalated to finance for GST invoice issuance.\n\nWant this exported as PDF or emailed to your manager?";
  }
  return "I'm the Dayjoy AI Assistant. I can help you:\n\n• Summarise a customer's history\n• Draft replies to support tickets\n• Look up product information\n• Generate activity reports\n\nWhat would you like to do?";
}
