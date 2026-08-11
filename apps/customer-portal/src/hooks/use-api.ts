"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import type {
  SupportTicket,
  CreateTicketInput,
  TicketReply,
  NotificationItem,
  NotificationPreferences,
  KnowledgeArticle,
  FaqItem,
  KnowledgeQueryResult,
  LiveChatSession,
  LiveChatMessage,
} from "@/types";

// ===== Support Tickets =====

export function useSupportTickets(params?: {
  status?: string;
  priority?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: [...QUERY_KEYS.supportTickets, params],
    queryFn: () => api.get<SupportTicket[]>("/support/tickets", params),
  });
}

export function useSupportTicket(id: string | null) {
  return useQuery({
    queryKey: id ? QUERY_KEYS.supportTicket(id) : ["support", "tickets", "null"],
    queryFn: () => api.get<SupportTicket>(`/support/tickets/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) =>
      api.post<SupportTicket>("/support/tickets", input),
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.supportTickets });
      qc.setQueryData(QUERY_KEYS.supportTicket(ticket.id), ticket);
    },
  });
}

export function useReplyToTicket(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api.post<TicketReply>(`/support/tickets/${ticketId}/replies`, {
        content,
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: QUERY_KEYS.supportTicket(ticketId),
      });
    },
  });
}

export function useCloseTicket(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.patch<SupportTicket>(`/support/tickets/${ticketId}/close`),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: QUERY_KEYS.supportTicket(ticketId),
      });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.supportTickets });
    },
  });
}

// ===== Live chat =====

export function useLiveChatSession() {
  return useQuery<LiveChatSession>({
    queryKey: QUERY_KEYS.liveChat("active"),
    queryFn: () => api.get<LiveChatSession>("/support/live-chat/active"),
    retry: false,
  });
}

export function useStartLiveChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<LiveChatSession>("/support/live-chat/start"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.liveChat("active") });
    },
  });
}

export function useSendLiveChatMessage(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      api.post<LiveChatMessage>(
        `/support/live-chat/${sessionId}/messages`,
        { content },
      ),
    onSuccess: () => {
      if (sessionId) {
        qc.invalidateQueries({
          queryKey: QUERY_KEYS.liveChat(sessionId),
        });
      }
    },
  });
}

// ===== Knowledge base / FAQ =====

export function useKnowledgeArticles(params?: {
  category?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: [...QUERY_KEYS.knowledgeArticles, params],
    queryFn: () =>
      api.get<KnowledgeArticle[]>("/knowledge/articles", params),
  });
}

export function useKnowledgeArticle(id: string | null) {
  return useQuery({
    queryKey: id ? QUERY_KEYS.knowledgeArticle(id) : ["knowledge", "articles", "null"],
    queryFn: () => api.get<KnowledgeArticle>(`/knowledge/articles/${id}`),
    enabled: Boolean(id),
  });
}

export function useFaqs(params?: { category?: string; search?: string }) {
  return useQuery<FaqItem[]>({
    queryKey: ["knowledge", "faqs", params],
    queryFn: () => api.get<FaqItem[]>("/knowledge/articles", { ...params, type: "faq" }),
  });
}

export function useKnowledgeQuery() {
  return useMutation({
    mutationFn: (query: string) =>
      api.post<KnowledgeQueryResult>("/knowledge/query", { query }),
  });
}

// ===== Notifications =====

export function useNotifications(params?: { type?: string; unreadOnly?: boolean }) {
  return useQuery({
    queryKey: [...QUERY_KEYS.notifications, params],
    queryFn: () =>
      api.get<NotificationItem[]>("/notifications", params),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<void>(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/notifications/read-all"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/notifications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
    },
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: QUERY_KEYS.notificationPreferences,
    queryFn: () =>
      api.get<NotificationPreferences>("/notifications/preferences"),
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: NotificationPreferences) =>
      api.put<NotificationPreferences>(
        "/notifications/preferences",
        prefs,
      ),
    onSuccess: (prefs) => {
      qc.setQueryData(QUERY_KEYS.notificationPreferences, prefs);
    },
  });
}
